/**
 * Mailbox service module — public API surface.
 *
 * Import from this index rather than from individual files to maintain
 * a stable internal boundary. Internal implementation files may be
 * reorganized without breaking callers.
 *
 * What is exported:
 * - Domain types (for service layer use)
 * - Provider contracts (for adapter implementations)
 * - Read shapes and mappers (for UI-facing responses)
 * - Audit helpers (for governance event emission)
 * - Connection service (for connection lifecycle management)
 * - Cursor service (for sync checkpoint management)
 *
 * What is NOT exported from here:
 * - Raw Prisma types (import from @/generated/prisma/client directly)
 * - tokenRef values (never exposed outside the service layer)
 */

// Domain types
export type {
  MailboxConnectionRecord,
  MailboxThreadLinkRecord,
  MailboxDraftRecord,
  MailboxAssignmentRecord,
  MailboxAuditEventRecord,
  MailboxProviderCursorRecord,
  MailboxProvider,
  MailboxConnectionStatus,
  MailboxThreadStatus,
  MailboxDraftMode,
  MailboxDraftStatus,
  MailboxAssignmentStatus,
  MailboxAuditAction,
  MailboxCursorType,
  MailboxThreadLinkEntityType,
} from "./domain-types";
export {
  connectionRequiresReconnect,
  connectionIsDegraded,
  connectionIsOperational,
  cursorIsExpired,
} from "./domain-types";

// Provider contracts
export type {
  MailboxProviderType,
  MailboxProviderDescriptor,
  MailboxConnectionIdentity,
  MailboxAccountSummary,
  MailboxSyncCursor,
  MailboxThreadEnvelope,
  MailboxMessageEnvelope,
  MailboxParticipantRef,
  MailboxProviderErrorCategory,
  MailboxProviderError,
  IMailboxProviderAdapter,
  MailboxProviderRegistry,
} from "./provider-contracts";
export { isMailboxProviderError } from "./provider-contracts";

// Read shapes and mappers
export type {
  MailboxConnectionSummary,
  MailboxHealthSummary,
  MailboxAdminConnectionSummary,
  MailboxRestrictedSummary,
  MailboxAssignmentSummary,
  MailboxThreadLinkSummary,
  MailboxAuditEventSummary,
} from "./read-shapes";
export {
  toMailboxConnectionSummary,
  toMailboxHealthSummary,
  toMailboxAdminConnectionSummary,
  toMailboxRestrictedSummary,
  toMailboxAssignmentSummary,
  toMailboxThreadLinkSummary,
  toMailboxAuditEventSummary,
} from "./read-shapes";

// Audit helpers
export {
  logMailboxAudit,
  logMailboxAuditTx,
  getMailboxAuditActionLabel,
  MAILBOX_AUDIT_ACTION_LABELS,
} from "./audit";

// Connection service
export type { CreateMailboxConnectionInput, UpdateMailboxConnectionStatusInput } from "./connection-service";
export {
  listMailboxConnections,
  getMailboxConnection,
  findMailboxConnectionByProviderAccount,
  createMailboxConnection,
  updateMailboxConnectionStatus,
  disableMailboxConnection,
} from "./connection-service";

// Cursor service
export {
  getMailboxCursor,
  upsertMailboxCursor,
  deleteMailboxCursors,
} from "./cursor-service";
