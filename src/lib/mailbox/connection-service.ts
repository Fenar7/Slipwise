import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MailboxConnectionRecord, MailboxConnectionStatus } from "./domain-types";
import { logMailboxAuditTx } from "./audit";
import type { MailboxAuditAction } from "./domain-types";
import { isSchemaDriftError } from "@/lib/prisma-errors";
import { logMailboxTelemetry } from "./telemetry";

/**
 * System user ID used for auto-generated system messages (e.g., "New Chat" welcome).
 * Matches the UUID format used for org members but is not a real user row.
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * System user ID used for auto-generated system messages (e.g., "New Chat" welcome).
 * Matches the UUID format used for org members but is not a real user row.
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

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

/**
 * Result of a paginated connection list query.
 */
export interface PaginatedMailboxConnectionsResult {
  records: MailboxConnectionRecord[];
  nextCursor: string | null;
}

/**
 * List mailbox connections for an org with cursor-based pagination.
 * Excludes soft-deleted connections (deletedAt IS NULL).
 *
 * @param orgId - The organization to scope the query to.
 * @param options.cursor - Opaque cursor (record id) for the next page.
 * @param options.pageSize - Number of records per page (1–100, default 20).
 */
export async function listMailboxConnectionsPaginated(
  orgId: string,
  options?: { cursor?: string; pageSize?: number },
): Promise<PaginatedMailboxConnectionsResult> {
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 100);

  try {
    const rows = await db.mailboxConnection.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: pageSize + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > pageSize;
    const records = hasMore ? rows.slice(0, pageSize) : rows;

    return {
      records: records.map(toConnectionRecord),
      nextCursor: hasMore ? records[records.length - 1].id : null,
    };
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox] listMailboxConnectionsPaginated skipped: mailbox_connection schema drift — run prisma migrate deploy",
      );
      return { records: [], nextCursor: null };
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

  const record = toConnectionRecord(result);
  // Emit connection_created so adoption dashboards track every new mailbox.
  await logMailboxTelemetry("connection_created", {
    orgId: input.orgId,
    connectionId: record.id,
    provider: input.provider,
    emailAddress: input.emailAddress,
    connectedBy: input.connectedBy,
  });
  return record;
}

// ─── New Chat (Sprint 7.3) ────────────────────────────────────────────────────

/**
 * Result DTO for a newly created chat connection.
 */
export interface NewChatConnectionDTO {
  id: string;
  displayName: string;
  visibilityPolicy: string;
  notificationSettings: Record<string, unknown> | null;
}

const NEW_CHAT_PREFIX = "New Chat #";

/**
 * Generate the next "New Chat #<seq>" display name for an org.
 * Fetches all non-deleted New Chat names for the org, parses the numeric
 * suffix from each, and returns max + 1. This avoids the lexicographic
 * ordering pitfall where "New Chat #9" > "New Chat #10".
 *
 * Gaps are ignored (e.g., if "#2" is missing and "#3" exists, returns "#4").
 *
 * Indexed path: uses composite index on (orgId, displayName) with
 * a filtered condition (deletedAt IS NULL).
 */
export async function generateNewChatName(orgId: string): Promise<string> {
  const rows = await db.mailboxConnection.findMany({
    where: {
      orgId,
      displayName: { startsWith: NEW_CHAT_PREFIX },
      deletedAt: null,
    },
    select: { displayName: true },
  });

  const maxSeq = rows.reduce((max, r) => {
    const seq = parseInt(r.displayName.replace(NEW_CHAT_PREFIX, ""), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);

  return `${NEW_CHAT_PREFIX}${maxSeq + 1}`;
}

/**
 * Create a "New Chat" connection, welcome thread + message, and audit log
 * in a single Prisma transaction.
 *
 * - connection: status=ACTIVE, provider=GMAIL (placeholder), synthetic
 *   providerAccountId/emailAddress
 * - thread: synthetic providerThreadId, subject="Welcome to your new mailbox!"
 * - message: synthetic providerMessageId, htmlBody/snippet with welcome text
 * - audit: CONNECTION_CREATED with masked name (#<seq> only)
 *
 * Caller must emit the realtime event after the transaction commits.
 */
export async function createNewChatConnection(
  orgId: string,
  userId: string,
): Promise<NewChatConnectionDTO> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const displayName = await generateNewChatName(orgId);
    const seq = displayName.replace(NEW_CHAT_PREFIX, "");
    const connId = `new-chat-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const threadId = `welcome-thread-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const msgId = `welcome-msg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();

    const connection = await tx.mailboxConnection.create({
      data: {
        orgId,
        provider: "GMAIL",
        providerAccountId: connId,
        emailAddress: `chat-${connId}@local`,
        displayName,
        status: "ACTIVE",
        visibilityPolicy: "org_shared",
        notificationSettings: { email: false, sms: false },
        connectedBy: userId,
      },
    });

    const thread = await tx.mailboxThread.create({
      data: {
        orgId,
        mailboxConnectionId: connection.id,
        providerThreadId: `system-welcome-${connection.id}`,
        subject: "Welcome to your new mailbox!",
        participantsSummary: [],
        lastMessageAt: now,
        unreadCount: 1,
        status: "OPEN",
        previewSnippet: "Welcome to your new mailbox!",
      },
    });

    await tx.mailboxMessage.create({
      data: {
        orgId,
        threadId: thread.id,
        providerMessageId: `system-welcome-msg-${connection.id}`,
        direction: "inbound",
        from: { name: "System", id: SYSTEM_USER_ID },
        to: [],
        cc: [],
        bcc: [],
        subject: "Welcome to your new mailbox!",
        htmlBody: "<p>Welcome to your new mailbox!</p>",
        textBody: "Welcome to your new mailbox!",
        snippet: "Welcome to your new mailbox!",
        sentAt: now,
        receivedAt: now,
        attachmentCount: 0,
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "CONNECTION_CREATED",
      summary: `New Chat #${seq} created`,
      mailboxConnectionId: connection.id,
      metadata: {
        nameSeq: seq,
        visibilityPolicy: "org_shared",
      },
    });

    return {
      id: connection.id,
      displayName,
      visibilityPolicy: "org_shared",
      notificationSettings: { email: false, sms: false },
    };
  });

  return result;
}

// ─── New Chat (Sprint 7.3) ────────────────────────────────────────────────────

/**
 * Result DTO for a newly created chat connection.
 */
export interface NewChatConnectionDTO {
  id: string;
  displayName: string;
  visibilityPolicy: string;
  notificationSettings: Record<string, unknown> | null;
}

const NEW_CHAT_PREFIX = "New Chat #";

/**
 * Generate the next "New Chat #<seq>" display name for an org.
 * Queries the highest existing sequence among non-deleted connections
 * and increments by one. Gaps are ignored (e.g., if "#2" is missing,
 * the next name is based on the actual max found).
 *
 * Indexed path: uses composite index on (orgId, displayName) with
 * a filtered condition (deletedAt IS NULL).
 */
export async function generateNewChatName(orgId: string): Promise<string> {
  const result = await db.mailboxConnection.findFirst({
    where: {
      orgId,
      displayName: { startsWith: NEW_CHAT_PREFIX },
      deletedAt: null,
    },
    orderBy: { displayName: "desc" },
    select: { displayName: true },
  });

  const nextSeq = result
    ? parseInt(result.displayName.replace(NEW_CHAT_PREFIX, ""), 10) + 1
    : 1;

  return `${NEW_CHAT_PREFIX}${nextSeq}`;
}

/**
 * Create a "New Chat" connection, welcome thread + message, and audit log
 * in a single Prisma transaction.
 *
 * - connection: status=ACTIVE, provider=GMAIL (placeholder), synthetic
 *   providerAccountId/emailAddress
 * - thread: synthetic providerThreadId, subject="Welcome to your new mailbox!"
 * - message: synthetic providerMessageId, htmlBody/snippet with welcome text
 * - audit: CONNECTION_CREATED with masked name (#<seq> only)
 *
 * Caller must emit the realtime event after the transaction commits.
 */
export async function createNewChatConnection(
  orgId: string,
  userId: string,
): Promise<NewChatConnectionDTO> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const displayName = await generateNewChatName(orgId);
    const seq = displayName.replace(NEW_CHAT_PREFIX, "");
    const connId = `new-chat-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const threadId = `welcome-thread-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const msgId = `welcome-msg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();

    const connection = await tx.mailboxConnection.create({
      data: {
        orgId,
        provider: "GMAIL",
        providerAccountId: connId,
        emailAddress: `chat-${connId}@local`,
        displayName,
        status: "ACTIVE",
        visibilityPolicy: "org_shared",
        notificationSettings: { email: false, sms: false },
        connectedBy: userId,
      },
    });

    const thread = await tx.mailboxThread.create({
      data: {
        orgId,
        mailboxConnectionId: connection.id,
        providerThreadId: `system-welcome-${connection.id}`,
        subject: "Welcome to your new mailbox!",
        participantsSummary: [],
        lastMessageAt: now,
        unreadCount: 1,
        status: "OPEN",
        previewSnippet: "Welcome to your new mailbox!",
      },
    });

    await tx.mailboxMessage.create({
      data: {
        orgId,
        threadId: thread.id,
        providerMessageId: `system-welcome-msg-${connection.id}`,
        direction: "inbound",
        from: { name: "System" },
        to: [],
        cc: [],
        bcc: [],
        subject: "Welcome to your new mailbox!",
        htmlBody: "<p>Welcome to your new mailbox!</p>",
        textBody: "Welcome to your new mailbox!",
        snippet: "Welcome to your new mailbox!",
        sentAt: now,
        receivedAt: now,
        attachmentCount: 0,
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "CONNECTION_CREATED",
      summary: `New Chat #${seq} created`,
      mailboxConnectionId: connection.id,
      metadata: {
        nameSeq: seq,
        visibilityPolicy: "org_shared",
      },
    });

    return {
      id: connection.id,
      displayName,
      visibilityPolicy: "org_shared",
      notificationSettings: { email: false, sms: false },
    };
  });

  return result;
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

  const statusRecord = toConnectionRecord(result);
  // Emit status transition telemetry for health dashboards.
  await logMailboxTelemetry("connection_status_updated", {
    orgId: input.orgId,
    connectionId: input.connectionId,
    newStatus: input.status,
    reason: input.lastSyncError ?? undefined,
  });
  return statusRecord;
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

// ─── Soft-delete ──────────────────────────────────────────────────────────────

/**
 * Soft-delete a mailbox connection: sets deletedAt and status = DISCONNECTED.
 * Prevents deletion if the connection has any active drafts.
 *
 * @throws Error if connection not found for org.
 * @throws Error if connection has active drafts (409 semantic).
 */
export async function softDeleteMailboxConnection(
  orgId: string,
  connectionId: string,
  actorId: string,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: connectionId, orgId },
      select: { id: true, displayName: true, deletedAt: true },
    });
    if (!existing) {
      throw new Error(
        `MailboxConnection ${connectionId} not found for org ${orgId}`,
      );
    }

    if (existing.deletedAt) {
      throw new Error(
        `MailboxConnection ${connectionId} is already deleted`,
      );
    }

    const activeDraft = await tx.mailboxDraft.findFirst({
      where: {
        mailboxConnectionId: connectionId,
        orgId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (activeDraft) {
      throw new Error(
        `MailboxConnection ${connectionId} has active drafts; cannot delete`,
      );
    }

    const row = await tx.mailboxConnection.update({
      where: { id: existing.id },
      data: {
        status: "DISCONNECTED",
        deletedAt: new Date(),
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId,
      action: "CONNECTION_DISCONNECTED",
      summary: `Mailbox connection "${existing.displayName}" soft-deleted by admin`,
      mailboxConnectionId: existing.id,
      metadata: {
        deletedAt: new Date().toISOString(),
        previousDisplayName: existing.displayName,
      },
    });

    return row;
  });

  const deletedRecord = toConnectionRecord(result);
  // Emit connection_deleted telemetry so adoption metrics reflect true active count.
  await logMailboxTelemetry("connection_deleted", {
    orgId,
    connectionId,
  });
  return deletedRecord;
}

/**
 * Supported fields that can be bulk-updated on a mailbox connection.
 */
export interface UpdateMailboxConnectionSettingsInput {
  orgId: string;
  connectionId: string;
  actorId: string;
  displayName?: string;
  visibilityPolicy?: string;
  notificationSettings?: Record<string, unknown> | null;
}

/**
 * Update mailbox connection settings (displayName, visibilityPolicy,
 * notificationSettings) atomically with audit logging.
 *
 * Org safety: loads the existing row inside the transaction with
 * `findFirst({ where: { id, orgId } })` before mutating. If the row
 * does not exist for this org the function throws.
 *
 * Only provided fields are updated. The audit log captures previous
 * and new values for changed fields only.
 */
export async function updateMailboxConnectionSettings(
  input: UpdateMailboxConnectionSettingsInput,
): Promise<MailboxConnectionRecord> {
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: input.connectionId, orgId: input.orgId },
      select: {
        id: true,
        displayName: true,
        visibilityPolicy: true,
        notificationSettings: true,
      },
    });
    if (!existing) {
      throw new Error(
        `MailboxConnection ${input.connectionId} not found for org ${input.orgId}`,
      );
    }

    const updateData: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};
    const summaryParts: string[] = [];

    if (
      input.displayName !== undefined &&
      input.displayName !== existing.displayName
    ) {
      updateData.displayName = input.displayName;
      metadata.previousDisplayName = existing.displayName;
      metadata.newDisplayName = input.displayName;
      summaryParts.push(
        `display name updated from "${existing.displayName}" to "${input.displayName}"`,
      );
    }

    if (
      input.visibilityPolicy !== undefined &&
      input.visibilityPolicy !== existing.visibilityPolicy
    ) {
      updateData.visibilityPolicy = input.visibilityPolicy;
      metadata.previousVisibilityPolicy = existing.visibilityPolicy;
      metadata.newVisibilityPolicy = input.visibilityPolicy;
      summaryParts.push(
        `visibility policy changed to "${input.visibilityPolicy}"`,
      );
    }

    if (input.notificationSettings !== undefined) {
      updateData.notificationSettings = input.notificationSettings;
      metadata.previousNotificationSettings = existing.notificationSettings;
      metadata.newNotificationSettings = input.notificationSettings;
      summaryParts.push("notification settings updated");
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    const row = await tx.mailboxConnection.update({
      where: { id: existing.id },
      data: updateData,
    });

    await logMailboxAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "CONNECTION_POLICY_UPDATED",
      summary: `Mailbox connection ${summaryParts.join("; ")}`,
      mailboxConnectionId: existing.id,
      metadata,
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
    deletedAt: row.deletedAt,
    notificationSettings:
      row.notificationSettings != null &&
      typeof row.notificationSettings === "object" &&
      !Array.isArray(row.notificationSettings)
        ? (row.notificationSettings as Record<string, unknown>)
        : null,
    connectedBy: row.connectedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
