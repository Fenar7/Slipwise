import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MailboxConnectionRecord } from "./domain-types";
import { logMailboxAuditTx } from "./audit";

// ─── Org-scoped connection queries ────────────────────────────────────────────

/**
 * List all mailbox connections for an org.
 * Returns domain records (includes tokenRef for internal service use).
 * Callers must map to read shapes before returning to the UI.
 *
 * Rate-limiting seam: Sprint 2.2 should apply rateLimitByOrg before calling
 * admin mutation surfaces that use this service.
 */
export async function listMailboxConnections(
  orgId: string,
): Promise<MailboxConnectionRecord[]> {
  const rows = await db.mailboxConnection.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toConnectionRecord);
}

/**
 * Get a single mailbox connection by ID, scoped to the org.
 * Returns null if not found or if the connection belongs to a different org.
 */
export async function getMailboxConnection(
  orgId: string,
  connectionId: string,
): Promise<MailboxConnectionRecord | null> {
  const row = await db.mailboxConnection.findFirst({
    where: { id: connectionId, orgId },
  });
  return row ? toConnectionRecord(row) : null;
}

/**
 * Get a mailbox connection by provider account ID, scoped to the org.
 * Used during OAuth callback to detect duplicate connections.
 */
export async function findMailboxConnectionByProviderAccount(
  orgId: string,
  provider: MailboxConnectionRecord["provider"],
  providerAccountId: string,
): Promise<MailboxConnectionRecord | null> {
  const row = await db.mailboxConnection.findFirst({
    where: { orgId, provider, providerAccountId },
  });
  return row ? toConnectionRecord(row) : null;
}

// ─── Connection mutations ─────────────────────────────────────────────────────

export interface CreateMailboxConnectionInput {
  orgId: string;
  provider: MailboxConnectionRecord["provider"];
  providerAccountId: string;
  emailAddress: string;
  displayName: string;
  tokenRef: string;
  tokenExpiry: Date | null;
  connectedBy: string;
}

/**
 * Create a new mailbox connection and emit a CONNECTION_CREATED audit event.
 * Runs atomically in a transaction.
 */
export async function createMailboxConnection(
  input: CreateMailboxConnectionInput,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx) => {
    const row = await tx.mailboxConnection.create({
      data: {
        orgId: input.orgId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        emailAddress: input.emailAddress,
        displayName: input.displayName,
        status: "ACTIVE",
        tokenRef: input.tokenRef,
        tokenExpiry: input.tokenExpiry,
        connectedBy: input.connectedBy,
      },
    });

    await logMailboxAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.connectedBy,
      action: "CONNECTION_CREATED",
      summary: `Connected ${input.provider} mailbox: ${input.emailAddress}`,
      mailboxConnectionId: row.id,
      metadata: {
        provider: input.provider,
        emailAddress: input.emailAddress,
      },
    });

    return row;
  });

  return toConnectionRecord(result);
}

export interface UpdateMailboxConnectionStatusInput {
  orgId: string;
  connectionId: string;
  status: MailboxConnectionRecord["status"];
  lastSyncError?: string | null;
  actorId: string;
}

/**
 * Update the status of a mailbox connection.
 * Emits an audit event for governance-relevant status transitions.
 */
export async function updateMailboxConnectionStatus(
  input: UpdateMailboxConnectionStatusInput,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.mailboxConnection.update({
      where: { id: input.connectionId, orgId: input.orgId },
      data: {
        status: input.status,
        lastSyncError: input.lastSyncError ?? null,
        ...(input.status === "ACTIVE" ? { lastSyncAt: new Date() } : {}),
      },
    });

    const auditAction = resolveStatusAuditAction(input.status);
    if (auditAction) {
      await logMailboxAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.actorId,
        action: auditAction,
        summary: `Mailbox connection status changed to ${input.status}`,
        mailboxConnectionId: input.connectionId,
        metadata: { status: input.status },
      });
    }

    return row;
  });

  return toConnectionRecord(result);
}

function resolveStatusAuditAction(
  status: MailboxConnectionRecord["status"],
): MailboxConnectionRecord["status"] extends "RECONNECT_REQUIRED"
  ? "CONNECTION_RECONNECTED"
  : "CONNECTION_DEGRADED" | "CONNECTION_DISCONNECTED" | null {
  switch (status) {
    case "RECONNECT_REQUIRED":
      return "CONNECTION_RECONNECTED" as never;
    case "DEGRADED":
      return "CONNECTION_DEGRADED" as never;
    case "DISCONNECTED":
      return "CONNECTION_DISCONNECTED" as never;
    default:
      return null as never;
  }
}

// ─── Soft-disable ─────────────────────────────────────────────────────────────

/**
 * Soft-disable a mailbox connection (admin governance action).
 * Sets disabledAt and status = DISCONNECTED. Emits audit event.
 */
export async function disableMailboxConnection(
  orgId: string,
  connectionId: string,
  actorId: string,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.mailboxConnection.update({
      where: { id: connectionId, orgId },
      data: {
        status: "DISCONNECTED",
        disabledAt: new Date(),
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId,
      action: "CONNECTION_DISCONNECTED",
      summary: "Mailbox connection disabled by admin",
      mailboxConnectionId: connectionId,
    });

    return row;
  });

  return toConnectionRecord(result);
}

// ─── Internal mapper ──────────────────────────────────────────────────────────

function toConnectionRecord(
  row: Awaited<ReturnType<typeof db.mailboxConnection.findFirstOrThrow>>,
): MailboxConnectionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    emailAddress: row.emailAddress,
    displayName: row.displayName,
    status: row.status,
    tokenRef: row.tokenRef,
    tokenExpiry: row.tokenExpiry,
    watchMetadata:
      row.watchMetadata != null &&
      typeof row.watchMetadata === "object" &&
      !Array.isArray(row.watchMetadata)
        ? (row.watchMetadata as Record<string, unknown>)
        : null,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    disabledAt: row.disabledAt,
    connectedBy: row.connectedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
