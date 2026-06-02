import "server-only";
import { db } from "@/lib/db";
import { toCalendarConnectionRecord } from "./mappers";
import {
  CalendarConnectionRecord,
  CalendarProvider,
  CalendarConnectionStatus,
} from "./domain-types";
import {
  ConnectCalendarInput,
  DisconnectCalendarInput,
} from "./service-contracts";
import {
  ConversationAccessError,
  NotFoundError,
  InvalidInputError,
} from "./errors";
import { logMessagingAuditTx } from "./audit";

export interface ReconnectCalendarInput {
  orgId: string;
  connectionId: string;
  tokenRef: string;
  tokenExpiry?: Date | null;
  reconnectedBy: string;
}

export interface UpdateConnectionHealthInput {
  orgId: string;
  connectionId: string;
  status?: CalendarConnectionStatus;
  lastSyncError?: string | null;
  actorId: string;
}

/**
 * Connect a calendar provider for an organization.
 * Validates org-admin permission, enforces one active connection per provider,
 * and logs an audit trail.
 */
export async function connectCalendar(
  input: ConnectCalendarInput,
): Promise<CalendarConnectionRecord> {
  const {
    orgId,
    provider,
    providerAccountId,
    emailAddress,
    displayName,
    tokenRef,
    tokenExpiry,
    connectedBy,
  } = input;

  // 1. Permission Gating: authorized admins/owners only
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId: connectedBy },
    select: { role: true },
  });

  if (!member) {
    throw new ConversationAccessError("connectCalendar: active admin or owner role required");
  }

  const orgRole = member.role?.toLowerCase() ?? "";
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  if (!isAdmin) {
    throw new ConversationAccessError("connectCalendar: active admin or owner role required");
  }

  // 2. Enforce Invariant: One active connection per provider per org.
  // Transition any existing active/reconnect-required connections to DISCONNECTED.
  const connection = await db.$transaction(async (tx) => {
    await tx.calendarConnection.updateMany({
      where: {
        orgId,
        provider,
        status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
      },
      data: {
        status: "DISCONNECTED",
        disconnectedAt: new Date(),
      },
    });

    const upserted = await tx.calendarConnection.upsert({
      where: {
        orgId_provider_providerAccountId: {
          orgId,
          provider,
          providerAccountId,
        },
      },
      create: {
        orgId,
        provider,
        providerAccountId,
        emailAddress,
        displayName: displayName ?? null,
        tokenRef,
        tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null,
        status: "ACTIVE",
        connectedBy,
        disconnectedAt: null,
        lastSyncError: null,
      },
      update: {
        emailAddress,
        displayName: displayName ?? null,
        tokenRef,
        tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null,
        status: "ACTIVE",
        connectedBy,
        disconnectedAt: null,
        lastSyncError: null,
      },
    });

    // 3. Audit trail logging (no secrets leaked)
    await logMessagingAuditTx(tx, {
      orgId,
      actorId: connectedBy,
      action: "ADMIN_SUPPORT_ACTION",
      summary: `Connected ${provider === "GOOGLE" ? "Google" : "Outlook"} Calendar: ${emailAddress}`,
      metadata: { provider, emailAddress },
    });

    return upserted;
  });

  return toCalendarConnectionRecord(connection);
}

/**
 * Disconnect a calendar connection.
 * Visibly marks connection as disconnected and stops active integration.
 */
export async function disconnectCalendar(
  input: DisconnectCalendarInput,
): Promise<CalendarConnectionRecord> {
  const { orgId, connectionId, disconnectedBy } = input;

  // 1. Permission Gating
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId: disconnectedBy },
    select: { role: true },
  });

  if (!member) {
    throw new ConversationAccessError("disconnectCalendar: active admin or owner role required");
  }

  const orgRole = member.role?.toLowerCase() ?? "";
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  if (!isAdmin) {
    throw new ConversationAccessError("disconnectCalendar: active admin or owner role required");
  }

  const connection = await db.calendarConnection.findFirst({
    where: { id: connectionId, orgId },
  });

  if (!connection) {
    throw new NotFoundError("Calendar connection not found");
  }

  if (connection.status === "DISCONNECTED") {
    throw new InvalidInputError("Calendar is already disconnected");
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.calendarConnection.update({
      where: { id: connectionId },
      data: {
        status: "DISCONNECTED",
        disconnectedAt: new Date(),
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: disconnectedBy,
      action: "ADMIN_SUPPORT_ACTION",
      summary: `Disconnected ${res.provider === "GOOGLE" ? "Google" : "Outlook"} Calendar: ${res.emailAddress}`,
      metadata: { connectionId, provider: res.provider, emailAddress: res.emailAddress },
    });

    return res;
  });

  return toCalendarConnectionRecord(updated);
}

/**
 * Reconnect an expired or broken calendar connection.
 */
export async function reconnectCalendar(
  input: ReconnectCalendarInput,
): Promise<CalendarConnectionRecord> {
  const { orgId, connectionId, tokenRef, tokenExpiry, reconnectedBy } = input;

  // 1. Permission Gating
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId: reconnectedBy },
    select: { role: true },
  });

  if (!member) {
    throw new ConversationAccessError("reconnectCalendar: active admin or owner role required");
  }

  const orgRole = member.role?.toLowerCase() ?? "";
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  if (!isAdmin) {
    throw new ConversationAccessError("reconnectCalendar: active admin or owner role required");
  }

  const connection = await db.calendarConnection.findFirst({
    where: { id: connectionId, orgId },
  });

  if (!connection) {
    throw new NotFoundError("Calendar connection not found");
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.calendarConnection.update({
      where: { id: connectionId },
      data: {
        status: "ACTIVE",
        tokenRef,
        tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null,
        disconnectedAt: null,
        lastSyncError: null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: reconnectedBy,
      action: "ADMIN_SUPPORT_ACTION",
      summary: `Reconnected ${res.provider === "GOOGLE" ? "Google" : "Outlook"} Calendar: ${res.emailAddress}`,
      metadata: { connectionId, provider: res.provider, emailAddress: res.emailAddress },
    });

    return res;
  });

  return toCalendarConnectionRecord(updated);
}

/**
 * Update connection status or last sync error for health diagnostics.
 */
export async function updateConnectionHealth(
  input: UpdateConnectionHealthInput,
): Promise<CalendarConnectionRecord> {
  const { orgId, connectionId, status, lastSyncError, actorId } = input;

  const connection = await db.calendarConnection.findFirst({
    where: { id: connectionId, orgId },
  });

  if (!connection) {
    throw new NotFoundError("Calendar connection not found");
  }

  const updateData: any = {};
  if (status !== undefined) updateData.status = status;
  if (lastSyncError !== undefined) updateData.lastSyncError = lastSyncError;
  if (lastSyncError) {
    updateData.lastSyncAt = new Date();
  }

  const updated = await db.calendarConnection.update({
    where: { id: connectionId },
    data: updateData,
  });

  return toCalendarConnectionRecord(updated);
}

/**
 * Get active or reconnect-required calendar connection by provider.
 */
export async function getCalendarConnection(
  orgId: string,
  provider: CalendarProvider,
): Promise<CalendarConnectionRecord | null> {
  const connection = await db.calendarConnection.findFirst({
    where: {
      orgId,
      provider,
      status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
    },
  });
  return connection ? toCalendarConnectionRecord(connection) : null;
}

/**
 * List all calendar connections in an org.
 */
export async function listCalendarConnections(
  orgId: string,
): Promise<CalendarConnectionRecord[]> {
  const connections = await db.calendarConnection.findMany({
    where: { orgId },
  });
  return connections.map(toCalendarConnectionRecord);
}
