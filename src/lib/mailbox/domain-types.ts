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
  tokenRef: string | null;
  tokenExpiry: Date | null;
  watchMetadata: Record<string, unknown> | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
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

/**
 * Returns true if the cursor has expired and must be renewed before use.
 */
export function cursorIsExpired(cursor: MailboxProviderCursorRecord): boolean {
  if (!cursor.expiresAt) return false;
  return cursor.expiresAt <= new Date();
}
