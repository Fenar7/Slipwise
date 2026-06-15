import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MailboxConnectionRecord, MailboxConnectionStatus } from "./domain-types";
import { logMailboxAuditTx } from "./audit";
import type { MailboxAuditAction } from "./domain-types";
import { isSchemaDriftError } from "@/lib/prisma-errors";

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
  try {
    const rows = await db.mailboxConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toConnectionRecord);
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox] listMailboxConnections skipped: mailbox_connection schema drift — run prisma migrate deploy",
      );
      return [];
    }
    throw error;
  }
}

/**
 * Get a single mailbox connection by ID, scoped to the org.
 * Returns null if not found or if the connection belongs to a different org.
 */
export async function getMailboxConnection(
  orgId: string,
  connectionId: string,
): Promise<MailboxConnectionRecord | null> {
  try {
    const row = await db.mailboxConnection.findFirst({
      where: { id: connectionId, orgId },
    });
    return row ? toConnectionRecord(row) : null;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox] getMailboxConnection skipped: mailbox_connection schema drift — run prisma migrate deploy",
      );
      return null;
    }
    throw error;
  }
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
  try {
    const row = await db.mailboxConnection.findFirst({
      where: { orgId, provider, providerAccountId },
    });
    return row ? toConnectionRecord(row) : null;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox] findMailboxConnectionByProviderAccount skipped: mailbox_connection schema drift — run prisma migrate deploy",
      );
      return null;
    }
    throw error;
  }
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
  status: MailboxConnectionStatus;
  lastSyncError?: string | null;
  actorId: string;
}

/**
 * Update the status of a mailbox connection.
 *
 * Org safety: loads the existing row inside the transaction with
 * `findFirst({ where: { id, orgId } })` before mutating. If the row does not
 * exist for this org the function throws — cross-org mutation is impossible.
 *
 * Audit semantics: derives the audit action from (previousStatus, nextStatus)
 * so CONNECTION_RECONNECTED is only emitted when a broken connection recovers.
 */
export async function updateMailboxConnectionStatus(
  input: UpdateMailboxConnectionStatusInput,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Org-safe load: verifies ownership before any mutation.
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: input.connectionId, orgId: input.orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new Error(
        `MailboxConnection ${input.connectionId} not found for org ${input.orgId}`,
      );
    }

    const row = await tx.mailboxConnection.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        lastSyncError: input.lastSyncError ?? null,
        ...(input.status === "ACTIVE" ? { lastSyncAt: new Date() } : {}),
      },
    });

    const auditAction = resolveStatusTransitionAuditAction(
      existing.status,
      input.status,
    );
    if (auditAction) {
      await logMailboxAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.actorId,
        action: auditAction,
        summary: `Mailbox connection status changed to ${input.status}`,
        mailboxConnectionId: existing.id,
        metadata: {
          previousStatus: existing.status,
          newStatus: input.status,
        },
      });
    }

    return row;
  });

  return toConnectionRecord(result);
}

/**
 * Derive the audit action from a status transition.
 *
 * Rules:
 * - ACTIVE after a broken/degraded state → CONNECTION_RECONNECTED
 * - ACTIVE after ACTIVE (no-op) → null (no audit noise)
 * - → RECONNECT_REQUIRED → null (not a reconnection; Sprint 2.2 emits this
 *   when the OAuth token expires, which is a separate governance event)
 * - → DEGRADED → CONNECTION_DEGRADED
 * - → DISCONNECTED → CONNECTION_DISCONNECTED
 */
function resolveStatusTransitionAuditAction(
  previousStatus: MailboxConnectionStatus,
  nextStatus: MailboxConnectionStatus,
): MailboxAuditAction | null {
  if (nextStatus === "ACTIVE") {
    const wasRecovering =
      previousStatus === "RECONNECT_REQUIRED" ||
      previousStatus === "DEGRADED" ||
      previousStatus === "DISCONNECTED";
    return wasRecovering ? "CONNECTION_RECONNECTED" : null;
  }
  if (nextStatus === "DEGRADED") return "CONNECTION_DEGRADED";
  if (nextStatus === "DISCONNECTED") return "CONNECTION_DISCONNECTED";
  // RECONNECT_REQUIRED: not a reconnection event; caller emits its own audit
  // event when appropriate (e.g. token expiry detected during sync).
  return null;
}

// ─── Soft-disable ─────────────────────────────────────────────────────────────

/**
 * Soft-disable a mailbox connection (admin governance action).
 * Sets disabledAt and status = DISCONNECTED. Emits audit event.
 *
 * Org safety: same findFirst+guard pattern as updateMailboxConnectionStatus.
 */
export async function disableMailboxConnection(
  orgId: string,
  connectionId: string,
  actorId: string,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: connectionId, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(
        `MailboxConnection ${connectionId} not found for org ${orgId}`,
      );
    }

    const row = await tx.mailboxConnection.update({
      where: { id: existing.id },
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
      mailboxConnectionId: existing.id,
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
    visibilityPolicy: row.visibilityPolicy,
    tokenRef: row.tokenRef,
    tokenExpiry: row.tokenExpiry,
    watchMetadata:
      row.watchMetadata != null &&
      typeof row.watchMetadata === "object" &&
      !Array.isArray(row.watchMetadata)
        ? (row.watchMetadata as Record<string, unknown>)
        : null,
    watchExpiresAt: row.watchExpiresAt,
    watchRenewedAt: row.watchRenewedAt,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    lastSyncErrorCategory: row.lastSyncErrorCategory,
    syncLeaseToken: row.syncLeaseToken ?? null,
    syncLeaseExpiresAt: row.syncLeaseExpiresAt ?? null,
    disabledAt: row.disabledAt,
    connectedBy: row.connectedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
