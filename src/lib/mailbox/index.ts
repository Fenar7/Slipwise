import "server-only";

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
  MailboxThreadRecord,
  MailboxMessageRecord,
  MailboxAttachmentRecord,
  MailboxSyncRunRecord,
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
  MailboxMessageDirection,
} from "./domain-types";
export {
  connectionRequiresReconnect,
  connectionIsDegraded,
  connectionIsOperational,
  mailboxCanSync,
  cursorIsExpired,
  watchIsExpired,
  cursorIsValidForDelta,
  resolveSyncMode,
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
  MailboxAttachmentEnvelope,
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

// Health derivation
export type { MailboxHealthStatus, MailboxConnectionHealth } from "./health";
export { deriveMailboxHealth, EXPIRING_SOON_THRESHOLD_MS } from "./health";

// Admin shapes
export type { MailboxConnectionListItem } from "./admin-shapes";
export { toMailboxConnectionListItem } from "./admin-shapes";

// Sprint 2.2: Gmail OAuth and token lifecycle
export type { MailboxCredentialPayload } from "./credential-store";
export {
  storeMailboxCredential,
  readMailboxCredential,
  rotateMailboxCredential,
  revokeMailboxCredential,
} from "./credential-store";

export type { GmailCallbackResult, GmailRefreshResult, GmailVerifyResult } from "./gmail-oauth-service";
export {
  initiateGmailConnect,
  handleGmailCallback,
  refreshGmailAuthorization,
  markConnectionReconnectRequired,
  verifyGmailConnection,
  disconnectGmailMailbox,
} from "./gmail-oauth-service";

export { gmailProviderAdapter, buildGmailAuthUrl, GMAIL_OAUTH_SCOPES } from "./gmail-provider";

// Sprint 2.4: Connection permissions and org-scoped visibility
export type {
  MailboxVisibilityPolicy,
  MailboxAccessLevel,
  MailboxAccessResolution,
} from "./domain-types";
export {
  resolveMailboxAccessLevel,
  canAccessMailbox,
} from "./domain-types";
export {
  getMailboxAccessResolution,
  listMailboxConnectionsForMember,
  setMailboxVisibilityPolicy,
} from "./visibility-service";

// Sprint 3.1: Provider registry
export { getMailboxProviderAdapter, mailboxProviderRegistry } from "./provider-registry";

// Sprint 3.1: Ingestion service
export {
  upsertMailboxThread,
  upsertMailboxMessage,
  upsertMailboxAttachment,
} from "./ingestion-service";

// Sprint 3.1: Sync orchestration
export type { RunMailboxSyncParams, RunMailboxSyncResult } from "./mailbox-sync-service";
export { runMailboxSync } from "./mailbox-sync-service";
