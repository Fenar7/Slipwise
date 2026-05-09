/**
 * Mailbox UI-facing read shapes and mappers.
 *
 * These shapes are what the UI consumes. They are explicitly separate from:
 * - Raw Prisma records (which may contain tokenRef and other internal fields)
 * - Domain types (which are used in service layer logic)
 *
 * Security rules:
 * - tokenRef must never appear in any read shape.
 * - watchMetadata must never appear in any read shape.
 * - providerAccountId is included only in admin shapes, not in member shapes.
 * - Mappers are pure functions: they take a domain record and return a read shape.
 *   They never call the database.
 */

// Sprint 2.3 note: MailboxHealthSummary and MailboxAdminConnectionSummary are
// deprecated in favour of MailboxConnectionHealth (health.ts) and
// MailboxConnectionListItem (admin-shapes.ts) respectively.
// Remove after Phase 4 migration is complete.

import type {
  MailboxConnectionRecord,
  MailboxAssignmentRecord,
  MailboxAuditEventRecord,
  MailboxThreadLinkRecord,
} from "./domain-types";
import type {
  MailboxConnectionStatus,
  MailboxProvider,
  MailboxAuditAction,
  MailboxThreadLinkEntityType,
} from "./domain-types";

// ─── Connection summary (member-facing) ──────────────────────────────────────

/**
 * Mailbox connection summary for org members.
 * Does not include tokenRef, watchMetadata, or providerAccountId.
 */
export interface MailboxConnectionSummary {
  id: string;
  provider: MailboxProvider;
  emailAddress: string;
  displayName: string;
  status: MailboxConnectionStatus;
  lastSyncAt: string | null;
  /** Whether the connection is currently usable. */
  isOperational: boolean;
  /** Whether the user should be prompted to reconnect. */
  requiresReconnect: boolean;
}

export function toMailboxConnectionSummary(
  record: MailboxConnectionRecord,
): MailboxConnectionSummary {
  return {
    id: record.id,
    provider: record.provider,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    status: record.status,
    lastSyncAt: record.lastSyncAt?.toISOString() ?? null,
    isOperational: record.status === "ACTIVE",
    requiresReconnect:
      record.status === "RECONNECT_REQUIRED" ||
      record.status === "DISCONNECTED",
  };
}

// ─── Mailbox health summary ───────────────────────────────────────────────────

/**
 * @deprecated Use `MailboxConnectionHealth` from `./health` instead.
 * This shape will be removed once all callers are migrated.
 *
 * Health and reconnect-required summary for a mailbox connection.
 * Used in the mailbox workspace to show degraded/reconnect states.
 */
export interface MailboxHealthSummary {
  connectionId: string;
  status: MailboxConnectionStatus;
  emailAddress: string;
  displayName: string;
  lastSyncAt: string | null;
  /** Human-readable status message for display. */
  statusMessage: string;
  requiresAdminAction: boolean;
}

/**
 * @deprecated Use `toMailboxConnectionListItem` from `./admin-shapes` instead.
 */
export function toMailboxHealthSummary(
  record: MailboxConnectionRecord,
): MailboxHealthSummary {
  const statusMessage = resolveStatusMessage(record.status, record.lastSyncError);
  return {
    connectionId: record.id,
    status: record.status,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    lastSyncAt: record.lastSyncAt?.toISOString() ?? null,
    statusMessage,
    requiresAdminAction:
      record.status === "RECONNECT_REQUIRED" ||
      record.status === "DISCONNECTED",
  };
}

function resolveStatusMessage(
  status: MailboxConnectionStatus,
  _lastSyncError: string | null,
): string {
  switch (status) {
    case "ACTIVE":
      return "Connected and syncing";
    case "DEGRADED":
      return "Sync is degraded — some messages may be delayed";
    case "RECONNECT_REQUIRED":
      return "Reconnection required — authorization has expired";
    case "DISCONNECTED":
      return "Mailbox is disconnected";
  }
}

// ─── Admin connection summary ─────────────────────────────────────────────────

/**
 * @deprecated Use `MailboxConnectionListItem` from `./admin-shapes` instead.
 * This shape will be removed once all callers are migrated.
 *
 * Full admin-facing connection summary.
 * Includes providerAccountId and connectedBy for governance.
 * Still excludes tokenRef and watchMetadata.
 */
export interface MailboxAdminConnectionSummary extends MailboxConnectionSummary {
  providerAccountId: string;
  connectedBy: string;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @deprecated Use `toMailboxConnectionListItem` from `./admin-shapes` instead.
 */
export function toMailboxAdminConnectionSummary(
  record: MailboxConnectionRecord,
): MailboxAdminConnectionSummary {
  return {
    ...toMailboxConnectionSummary(record),
    providerAccountId: record.providerAccountId,
    connectedBy: record.connectedBy,
    disabledAt: record.disabledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ─── Restricted mailbox shape ─────────────────────────────────────────────────

/**
 * Minimal shape for a mailbox the current user can see but not access.
 * Used when a mailbox exists but the user lacks read permission.
 * Exposes only enough to explain the restriction — no thread data.
 */
export interface MailboxRestrictedSummary {
  id: string;
  displayName: string;
  provider: MailboxProvider;
  /** Why the user cannot access this mailbox. */
  restrictionReason: "no_permission" | "mailbox_disabled";
}

export function toMailboxRestrictedSummary(
  record: MailboxConnectionRecord,
  reason: MailboxRestrictedSummary["restrictionReason"],
): MailboxRestrictedSummary {
  return {
    id: record.id,
    displayName: record.displayName,
    provider: record.provider,
    restrictionReason: reason,
  };
}

// ─── Assignment summary ───────────────────────────────────────────────────────

export interface MailboxAssignmentSummary {
  id: string;
  threadId: string;
  assigneeId: string;
  assignedBy: string;
  status: MailboxAssignmentRecord["status"];
  assignedAt: string;
}

export function toMailboxAssignmentSummary(
  record: MailboxAssignmentRecord,
): MailboxAssignmentSummary {
  return {
    id: record.id,
    threadId: record.threadId,
    assigneeId: record.assigneeId,
    assignedBy: record.assignedBy,
    status: record.status,
    assignedAt: record.assignedAt.toISOString(),
  };
}

// ─── Thread link summary ──────────────────────────────────────────────────────

export interface MailboxThreadLinkSummary {
  id: string;
  threadId: string;
  entityType: MailboxThreadLinkEntityType;
  entityId: string;
  isPrimary: boolean;
  createdBy: string;
  createdAt: string;
}

export function toMailboxThreadLinkSummary(
  record: MailboxThreadLinkRecord,
): MailboxThreadLinkSummary {
  return {
    id: record.id,
    threadId: record.threadId,
    entityType: record.entityType,
    entityId: record.entityId,
    isPrimary: record.isPrimary,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}

// ─── Audit event summary ──────────────────────────────────────────────────────

export interface MailboxAuditEventSummary {
  id: string;
  orgId: string;
  mailboxConnectionId: string | null;
  threadId: string | null;
  actorId: string;
  action: MailboxAuditAction;
  summary: string;
  createdAt: string;
}

export function toMailboxAuditEventSummary(
  record: MailboxAuditEventRecord,
): MailboxAuditEventSummary {
  // metadata is intentionally excluded from the summary shape to prevent
  // accidental exposure of internal details in governance views.
  return {
    id: record.id,
    orgId: record.orgId,
    mailboxConnectionId: record.mailboxConnectionId,
    threadId: record.threadId,
    actorId: record.actorId,
    action: record.action,
    summary: record.summary,
    createdAt: record.createdAt.toISOString(),
  };
}
