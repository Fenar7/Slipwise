import "server-only";

/**
 * Mailbox domain types.
 *
 * These are the server-side domain types for the mailbox platform.
 * They are distinct from the UI-facing read shapes in read-shapes.ts.
 *
 * Rules:
 * - These types mirror the Prisma schema but are not raw Prisma records.
 * - They may be used in service layer logic, validation, and mappers.
 * - They must not expose tokenRef or other credential fields to callers
 *   outside the mailbox service layer.
 */

import type {
  MailboxProvider,
  MailboxConnectionStatus,
  MailboxThreadStatus,
  MailboxDraftMode,
  MailboxDraftStatus,
  MailboxAssignmentStatus,
  MailboxAuditAction,
  MailboxCursorType,
  MailboxThreadLinkEntityType,
  MailboxSyncRunStatus,
  MailboxSyncTriggerSource,
  MailboxSyncMode,
} from "@/generated/prisma/client";

// Re-export enums for use in service layer without importing from generated client directly.
export type {
  MailboxProvider,
  MailboxConnectionStatus,
  MailboxThreadStatus,
  MailboxDraftMode,
  MailboxDraftStatus,
  MailboxAssignmentStatus,
  MailboxAuditAction,
  MailboxCursorType,
  MailboxThreadLinkEntityType,
  MailboxSyncRunStatus,
  MailboxSyncTriggerSource,
  MailboxSyncMode,
};

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Full mailbox connection record as used in the service layer.
 * tokenRef is included here for internal service use only.
 * It must never be included in UI-facing read shapes.
 */
export interface MailboxConnectionRecord {
  id: string;
  orgId: string;
  provider: MailboxProvider;
  providerAccountId: string;
  emailAddress: string;
  displayName: string;
  status: MailboxConnectionStatus;
  visibilityPolicy: string;
  tokenRef: string | null;
  tokenExpiry: Date | null;
  watchMetadata: Record<string, unknown> | null;
  watchExpiresAt: Date | null;
  watchRenewedAt: Date | null;
  /** Sync concurrency lease. Matches Prisma MailboxConnection.syncLeaseToken. */
  syncLeaseToken: string | null;
  /** Sync concurrency lease expiry. Matches Prisma MailboxConnection.syncLeaseExpiresAt. */
  syncLeaseExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  lastSyncErrorCategory: string | null;
  disabledAt: Date | null;
  connectedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Thread link ──────────────────────────────────────────────────────────────

export interface MailboxThreadLinkRecord {
  id: string;
  orgId: string;
  threadId: string;
  entityType: MailboxThreadLinkEntityType;
  entityId: string;
  isPrimary: boolean;
  createdBy: string;
  createdAt: Date;
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export interface MailboxDraftRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  threadId: string | null;
  replyToMessageId: string | null;
  mode: MailboxDraftMode;
  fromIdentity: string;
  toRecipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
  subject: string;
  htmlBody: string;
  textBody: string | null;
  /** Opaque storage references. Never raw file content. */
  attachmentRefs: string[];
  status: MailboxDraftStatus;
  lastAutosavedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Assignment ───────────────────────────────────────────────────────────────

export interface MailboxAssignmentRecord {
  id: string;
  orgId: string;
  threadId: string;
  assigneeId: string;
  assignedBy: string;
  status: MailboxAssignmentStatus;
  assignedAt: Date;
  updatedAt: Date;
}

// ─── Audit event ─────────────────────────────────────────────────────────────

export interface MailboxAuditEventRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string | null;
  threadId: string | null;
  messageId: string | null;
  actorId: string;
  action: MailboxAuditAction;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Provider cursor ─────────────────────────────────────────────────────────

export interface MailboxProviderCursorRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  provider: MailboxProvider;
  cursorType: MailboxCursorType;
  cursorValue: string;
  expiresAt: Date | null;
  lastAdvancedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MailboxMessageDirection = "inbound" | "outbound";

export interface MailboxThreadRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  providerThreadId: string;
  subject: string;
  participantsSummary: unknown;
  lastMessageAt: Date;
  unreadCount: number;
  status: MailboxThreadStatus;
  preArchiveStatus: MailboxThreadStatus | null;
  assigneeId: string | null;
  isFlagged: boolean;
  primaryLinkSummary: unknown;
  /** Normalized preview snippet from the most recent message. Sprint 3.3. */
  previewSnippet: string;
  /** Total attachment count across all thread messages. Sprint 3.3. */
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailboxMessageRecord {
  id: string;
  orgId: string;
  threadId: string;
  providerMessageId: string;
  rfcMessageId: string | null;
  direction: MailboxMessageDirection;
  from: Record<string, unknown>;
  to: unknown[];
  cc: unknown[];
  bcc: unknown[];
  subject: string;
  htmlBody: string;
  textBody: string | null;
  snippet: string;
  sentAt: Date;
  receivedAt: Date | null;
  attachmentCount: number;
  providerMetadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailboxAttachmentRecord {
  id: string;
  messageId: string;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  storageRef: string | null;
}

export interface MailboxSyncRunRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  provider: MailboxProvider;
  status: MailboxSyncRunStatus;
  triggerSource: MailboxSyncTriggerSource;
  syncMode: MailboxSyncMode;
  startedAt: Date;
  completedAt: Date | null;
  errorCategory: string | null;
  errorSummary: string | null;
  stats: Record<string, unknown> | null;
  /** Timestamp of the last heartbeat/progress update during a running sync. */
  lastHeartbeatAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Returns true if the connection requires reconnection (auth expired or
 * explicitly disconnected).
 */
export function connectionRequiresReconnect(
  status: MailboxConnectionStatus,
): boolean {
  return status === "RECONNECT_REQUIRED" || status === "DISCONNECTED";
}

/**
 * Returns true if the connection is in a degraded but still-active state.
 */
export function connectionIsDegraded(
  status: MailboxConnectionStatus,
): boolean {
  return status === "DEGRADED";
}

/**
 * Returns true if the connection is usable for sync/send operations.
 */
export function connectionIsOperational(
  status: MailboxConnectionStatus,
): boolean {
  return status === "ACTIVE";
}

export function mailboxCanSync(status: MailboxConnectionStatus): boolean {
  return connectionIsOperational(status) || connectionIsDegraded(status);
}

/**
 * Returns true if the cursor has expired and must be renewed before use.
 */
export function cursorIsExpired(cursor: MailboxProviderCursorRecord): boolean {
  if (!cursor.expiresAt) return false;
  return cursor.expiresAt <= new Date();
}

// ─── Sprint 2.4 — Connection permissions and org-scoped visibility ──────────────

/**
 * The visibility policy for a mailbox connection.
 *
 * - "org_shared"    — all authenticated org members can see the mailbox inbox
 *                     (read-only unless also assigned)
 * - "restricted"    — only admins and explicitly assigned members can access
 * - "admin_only"    — only org admins and owners can see and access
 */
export type MailboxVisibilityPolicy =
  | "org_shared"
  | "restricted"
  | "admin_only";

/**
 * The effective access level a specific org member has for a given connection.
 *
 * - "full"       — can read threads, compose, assign
 * - "read_only"  — can read threads only, cannot compose or assign
 * - "none"       — no access; receives MailboxRestrictedSummary only
 */
export type MailboxAccessLevel = "full" | "read_only" | "none";

/**
 * Result of evaluating a member's access to a specific mailbox connection.
 * Returned by resolveMailboxAccessLevel().
 */
export interface MailboxAccessResolution {
  connectionId: string;
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  visibilityPolicy: MailboxVisibilityPolicy;
  accessLevel: MailboxAccessLevel;
  /** Human-readable reason for the access level, for admin audit use. */
  reason: string;
}

/**
 * Resolve the effective access level for a given member on a given mailbox.
 *
 * Rules (evaluated in order — first match wins):
 * 1. If connection.status === "DISCONNECTED" → accessLevel: "none",
 *    reason: "mailbox_disabled"
 * 2. If role === "owner" or role === "admin" → accessLevel: "full",
 *    reason: "admin_override"
 * 3. If visibilityPolicy === "admin_only" → accessLevel: "none",
 *    reason: "policy_admin_only"
 * 4. If visibilityPolicy === "restricted" → accessLevel: "none",
 *    reason: "policy_restricted"
 * 5. If visibilityPolicy === "org_shared" → accessLevel: "read_only",
 *    reason: "org_shared_read"
 * 6. Fallback → accessLevel: "none", reason: "unknown"
 */
export function resolveMailboxAccessLevel(
  params: {
    connectionId: string;
    orgId: string;
    userId: string;
    role: "owner" | "admin" | "member";
    connectionStatus: MailboxConnectionStatus;
    visibilityPolicy: MailboxVisibilityPolicy;
  },
): MailboxAccessResolution {
  const { connectionId, orgId, userId, role, connectionStatus, visibilityPolicy } =
    params;

  if (connectionStatus === "DISCONNECTED") {
    return {
      connectionId,
      orgId,
      userId,
      role,
      visibilityPolicy,
      accessLevel: "none",
      reason: "mailbox_disabled",
    };
  }

  if (role === "owner" || role === "admin") {
    return {
      connectionId,
      orgId,
      userId,
      role,
      visibilityPolicy,
      accessLevel: "full",
      reason: "admin_override",
    };
  }

  if (visibilityPolicy === "admin_only") {
    return {
      connectionId,
      orgId,
      userId,
      role,
      visibilityPolicy,
      accessLevel: "none",
      reason: "policy_admin_only",
    };
  }

  if (visibilityPolicy === "restricted") {
    return {
      connectionId,
      orgId,
      userId,
      role,
      visibilityPolicy,
      accessLevel: "none",
      reason: "policy_restricted",
    };
  }

  if (visibilityPolicy === "org_shared") {
    return {
      connectionId,
      orgId,
      userId,
      role,
      visibilityPolicy,
      accessLevel: "read_only",
      reason: "org_shared_read",
    };
  }

  return {
    connectionId,
    orgId,
    userId,
    role,
    visibilityPolicy,
    accessLevel: "none",
    reason: "unknown",
  };
}

/**
 * Returns true if the resolved access level is not "none".
 */
export function canAccessMailbox(resolution: MailboxAccessResolution): boolean {
  return resolution.accessLevel !== "none";
}

// ─── Sprint 3.2 — Incremental sync, cursor renewal, and concurrency ─────────────

/**
 * Returns true if the provider watch/subscription has expired and must be
 * renewed before a delta sync can proceed safely.
 */
export function watchIsExpired(connection: MailboxConnectionRecord): boolean {
  if (!connection.watchExpiresAt) return false;
  return connection.watchExpiresAt <= new Date();
}

/**
 * Returns true if a cursor exists, has not expired, and can be used for delta sync.
 */
export function cursorIsValidForDelta(cursor: MailboxProviderCursorRecord | null): boolean {
  if (!cursor) return false;
  if (cursorIsExpired(cursor)) return false;
  return cursor.cursorValue.length > 0;
}

/**
 * Determine the sync mode for a mailbox given its current state.
 * - INITIAL when no valid delta cursor exists.
 * - DELTA when a valid cursor exists and the watch has not expired.
 */
export function resolveSyncMode(
  connection: MailboxConnectionRecord,
  cursor: MailboxProviderCursorRecord | null,
): MailboxSyncMode {
  if (watchIsExpired(connection)) return "INITIAL";
  if (!cursorIsValidForDelta(cursor)) return "INITIAL";
  return "DELTA";
}

/**
 * Result shape for a concurrency-guarded sync attempt.
 */
export interface MailboxSyncAttemptResult {
  /** Whether the sync was allowed to start. */
  allowed: boolean;
  /** If false, the reason the sync was rejected. */
  reason?: "concurrent_sync_running" | "connection_not_operational" | "watch_expired_requires_renewal";
  /** The sync run record if one was created. */
  runId?: string;
}

// ── Folder Coverage Types (Sprint 6.3+ Gmail-grade completeness) ──

export const MAILBOX_FOLDER_COVERAGE_FOLDERS = [
  "INBOX",
  "SENT",
  "SPAM",
  "DRAFT",
  "ARCHIVE",
  "ALL_MAIL",
] as const;

export type MailboxCoverageFolder = (typeof MAILBOX_FOLDER_COVERAGE_FOLDERS)[number];

export const MAILBOX_FOLDER_COVERAGE_STATES = [
  "PENDING",
  "BOOTSTRAPPING",
  "COMPLETE",
  "RECOVERING",
  "ERRORED",
] as const;

export type MailboxFolderCoverageState =
  (typeof MAILBOX_FOLDER_COVERAGE_STATES)[number];

/** The four Gmail system labels that MUST reach COMPLETE before claiming "Up to date". */
export const GMAIL_REQUIRED_COVERAGE_FOLDERS: MailboxCoverageFolder[] = [
  "INBOX",
  "SENT",
  "SPAM",
  "DRAFT",
];

export interface MailboxFolderCoverageRecord {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  folder: string;
  state: string;
  lastAdvancedCursor: string | null;
  totalThreads: number;
  lastCompletedAt: Date | null;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-folder coverage summary for UI and sync orchestration. */
export interface MailboxFolderCoverageSummary {
  folder: string;
  state: MailboxFolderCoverageState;
  totalThreads: number;
  lastCompletedAt: string | null;
  errorSummary: string | null;
  /** Last page token / cursor advanced to during bootstrap for this folder. */
  lastAdvancedCursor: string | null;
}

/** Aggregate coverage state across all required folders. */
export type MailboxOverallCoverage =
  | "COMPLETE"       // All required folders are COMPLETE
  | "PARTIAL"        // At least one required folder is not yet COMPLETE
  | "BOOTSTRAPPING"  // Bootstrap in progress for at least one folder
  | "RECOVERING"     // Recovery in progress for at least one folder
  | "ERRORED"        // At least one folder is ERRORED and no bootstrapping/recovering
  | "PENDING";       // No folders have been started at all

/**
 * Compute the overall coverage state from a set of folder coverages.
 * Required folders are INBOX, SENT, SPAM, DRAFT.
 */
export function computeOverallCoverage(
  coverages: MailboxFolderCoverageSummary[],
): MailboxOverallCoverage {
  if (coverages.length === 0) return "PENDING";

  const required = coverages.filter((c) =>
    GMAIL_REQUIRED_COVERAGE_FOLDERS.includes(c.folder as MailboxCoverageFolder),
  );

  if (required.length === 0) return "PENDING";
  if (required.every((c) => c.state === "PENDING")) return "PENDING";

  if (required.some((c) => c.state === "ERRORED")) return "ERRORED";
  if (required.some((c) => c.state === "BOOTSTRAPPING")) return "BOOTSTRAPPING";
  if (required.some((c) => c.state === "RECOVERING")) return "RECOVERING";
  if (required.every((c) => c.state === "COMPLETE")) return "COMPLETE";

  return "PARTIAL";
}

/**
 * Determine if a specific folder's empty state means "truly empty"
 * vs "we haven't finished importing yet".
 */
export function folderIsGenuinelyEmpty(
  coverage: MailboxFolderCoverageSummary | null,
): boolean {
  if (!coverage) return false; // No coverage record → don't claim empty
  if (coverage.state === "COMPLETE" && coverage.totalThreads === 0) return true;
  return false;
}

/**
 * Determine if a folder might have data we haven't imported yet.
 */
export function folderMayHaveMoreData(
  coverage: MailboxFolderCoverageSummary | null,
): boolean {
  if (!coverage) return true; // No record → assume more data exists
  return coverage.state !== "COMPLETE";
}
