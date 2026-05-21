import "server-only";

import type { MailboxConnectionRecord, MailboxConnectionStatus } from "./domain-types";
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
  status: MailboxConnectionStatus;
  /**
   * Typed as `string` (not `MailboxVisibilityPolicy`) intentionally for schema
   * evolution safety. The Prisma schema stores this as a plain string, which
   * allows new policy values to be added without a breaking type change here.
   * Callers that need strict typing should cast via `as MailboxVisibilityPolicy`.
   */
  visibilityPolicy: string;
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
    // Defensive: malformed DB rows or pre-migration records may have null
    // emailAddress / displayName. Coerce to empty string to prevent
    // "null" from surfacing in the UI and to survive unexpected shapes.
    emailAddress: record.emailAddress ?? "",
    displayName: record.displayName ?? "",
    status: record.status,
    // Null-guard: visibilityPolicy can be null for records pre-dating the
    // default migration. Fall back to "org_shared" as the schema default.
    visibilityPolicy: record.visibilityPolicy ?? "org_shared",
    health: deriveMailboxHealth(record, now),
    lastSyncAt: record.lastSyncAt?.toISOString() ?? null,
    lastSyncError: record.lastSyncError,
    connectedBy: record.connectedBy ?? "",
    // Defensive: if createdAt/updatedAt are not Dates (e.g. test stubs or
    // raw rows), avoid crashing the route with a TypeError.
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : String(record.createdAt ?? ""),
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : String(record.updatedAt ?? ""),
  };
}
