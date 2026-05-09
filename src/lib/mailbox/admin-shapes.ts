import "server-only";

import type { MailboxConnectionRecord } from "./domain-types";
import type { MailboxConnectionHealth } from "./health";
import { deriveMailboxHealth } from "./health";

/**
 * The full admin list item for a mailbox connection.
 * Returned by GET /api/mailbox/connections.
 * Consumed by the admin settings UI in Phase 4+.
 *
 * Intentionally does NOT include tokenRef (opaque, backend-only).
 */
export interface MailboxConnectionListItem {
  id: string;
  orgId: string;
  provider: string;
  emailAddress: string;
  displayName: string;
  status: string;
  health: MailboxConnectionHealth;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a MailboxConnectionRecord to the admin list item shape.
 * Strips tokenRef, tokenExpiry, watchMetadata, disabledAt.
 */
export function toMailboxConnectionListItem(
  record: MailboxConnectionRecord,
  now = Date.now(),
): MailboxConnectionListItem {
  return {
    id: record.id,
    orgId: record.orgId,
    provider: record.provider,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    status: record.status,
    health: deriveMailboxHealth(record, now),
    lastSyncAt: record.lastSyncAt?.toISOString() ?? null,
    lastSyncError: record.lastSyncError,
    connectedBy: record.connectedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
