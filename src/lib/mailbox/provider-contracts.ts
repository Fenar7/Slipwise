import "server-only";

/**
 * Mailbox provider-neutral contracts.
 *
 * These interfaces define the boundary between the mailbox platform core and
 * any concrete provider implementation (Gmail, Zoho, etc.).
 *
 * Rules:
 * - No Gmail-specific field names or API shapes leak into these interfaces.
 * - Provider adapters implement these contracts; the mailbox core depends only
 *   on these contracts, never on provider-specific types.
 * - Sprint 2.1 locks the contract surface. Sprint 2.2 implements Gmail behind it.
 */

import type { MailboxProvider } from "@/generated/prisma/client";

// ─── Provider identity ────────────────────────────────────────────────────────

/** Stable identifier for a provider type. */
export type MailboxProviderType = MailboxProvider;

/** Metadata about a provider's capabilities. */
export interface MailboxProviderDescriptor {
  readonly provider: MailboxProviderType;
  readonly displayName: string;
  /** Whether this provider supports push-based sync (vs. polling only). */
  readonly supportsPushSync: boolean;
  /** Whether this provider supports send/reply. */
  readonly supportsSend: boolean;
}

// ─── Connection identity capture ─────────────────────────────────────────────

/**
 * The minimal identity information captured from a provider after a successful
 * OAuth authorization. Used to create or update a MailboxConnection record.
 *
 * tokenRef is an opaque reference to an encrypted credential store.
 * The provider adapter is responsible for persisting the actual token via the
 * credential store and returning only the reference here.
 */
export interface MailboxConnectionIdentity {
  /** Provider-side account identifier (stable, not an email address). */
  providerAccountId: string;
  /** The email address associated with this mailbox account. */
  emailAddress: string;
  /** Display name for the mailbox (may be the email address if no name is set). */
  displayName: string;
  /** Opaque reference to the encrypted token store entry. */
  tokenRef: string;
  /** When the access token expires. Null if the provider does not expose expiry. */
  tokenExpiry: Date | null;
}

// ─── Mailbox account summary ──────────────────────────────────────────────────

/**
 * A lightweight summary of a connected mailbox account as returned by the
 * provider. Used to verify the connection is still valid and to refresh
 * display metadata.
 */
export interface MailboxAccountSummary {
  providerAccountId: string;
  emailAddress: string;
  displayName: string;
  /** Whether the provider reports the account as accessible. */
  isAccessible: boolean;
}

// ─── Cursor / sync checkpoint ─────────────────────────────────────────────────

/**
 * A provider sync checkpoint. The mailbox platform stores this opaquely in
 * MailboxProviderCursor and passes it back to the provider adapter on the next
 * sync call.
 */
export interface MailboxSyncCursor {
  /** The cursor value as understood by the provider. */
  value: string;
  /** When this cursor expires and must be renewed. Null if it does not expire. */
  expiresAt: Date | null;
}

// ─── Normalized thread/message envelope ──────────────────────────────────────

/**
 * A minimal normalized thread envelope returned by a provider sync.
 * Only fields needed for the mailbox platform's thread model are included.
 * Provider-specific metadata is isolated in providerMetadata.
 *
 * Sprint 2.1 locks this shape so Phase 3 ingestion can implement against it
 * without redesign.
 */
export interface MailboxThreadEnvelope {
  /** Provider-side thread identifier. */
  providerThreadId: string;
  subject: string;
  /** ISO timestamp of the most recent message in the thread. */
  lastMessageAt: string;
  /** Number of unread messages in the thread. */
  unreadCount: number;
  /** Participant email addresses (display names optional). */
  participants: MailboxParticipantRef[];
  /** Provider-specific metadata. Must not be used by core mailbox logic. */
  providerMetadata: Record<string, unknown>;
}

/**
 * A minimal normalized message envelope.
 * Body content is not included here — it is fetched separately via
 * fetchThreadDetail to avoid loading large payloads during list sync.
 */
export interface MailboxMessageEnvelope {
  /** Provider-side message identifier. */
  providerMessageId: string;
  /** RFC 2822 Message-ID header value. */
  rfcMessageId: string | null;
  direction: "inbound" | "outbound";
  from: MailboxParticipantRef;
  to: MailboxParticipantRef[];
  cc: MailboxParticipantRef[];
  subject: string;
  /** Short preview snippet (plain text, safe to display). */
  snippet: string;
  sentAt: string;
  receivedAt: string | null;
  attachmentCount: number;
  providerMetadata: Record<string, unknown>;
}

export interface MailboxParticipantRef {
  email: string;
  displayName: string | null;
}

// ─── Error categories ─────────────────────────────────────────────────────────

/**
 * Governance-safe error categories for provider operations.
 * These are the only error categories the mailbox core should act on.
 * Raw provider error details must never surface to the UI or be stored
 * in user-visible fields.
 */
export type MailboxProviderErrorCategory =
  | "auth_expired"        // token is expired or revoked; reconnect required
  | "auth_insufficient"   // token lacks required scopes
  | "rate_limited"        // provider rate limit hit; retry after backoff
  | "not_found"           // requested resource does not exist
  | "provider_unavailable" // provider API is temporarily unavailable
  | "quota_exceeded"      // provider quota exhausted
  | "unknown";            // unclassified error; log server-side only

export interface MailboxProviderError {
  category: MailboxProviderErrorCategory;
  /** Safe message for internal logging. Must not contain raw tokens or URLs. */
  safeMessage: string;
  /** Whether the operation is safe to retry. */
  retryable: boolean;
}

// ─── Provider adapter interface ───────────────────────────────────────────────

/**
 * The provider adapter interface. Each provider (Gmail, Zoho) implements this.
 *
 * Sprint 2.1 defines the contract surface. Sprint 2.2 implements Gmail.
 * The mailbox core must never call provider APIs directly — only through this
 * interface.
 *
 * Rate-limiting seam: Sprint 2.2 should apply rateLimitByOrg before calling
 * connect/refresh/sync operations. The adapter itself does not rate-limit;
 * the caller (service layer) is responsible.
 */
export interface IMailboxProviderAdapter {
  readonly descriptor: MailboxProviderDescriptor;

  /**
   * Exchange an authorization code for connection identity.
   * Returns the identity to persist in MailboxConnection.
   * The adapter is responsible for encrypting the token and returning only
   * the tokenRef.
   */
  connect(params: {
    orgId: string;
    authorizationCode: string;
    redirectUri: string;
  }): Promise<MailboxConnectionIdentity | MailboxProviderError>;

  /**
   * Refresh the access token for an existing connection.
   * Returns updated identity fields (tokenRef, tokenExpiry).
   * Returns auth_expired if the refresh token is also expired.
   */
  refreshAuthorization(params: {
    orgId: string;
    tokenRef: string;
  }): Promise<
    Pick<MailboxConnectionIdentity, "tokenRef" | "tokenExpiry"> | MailboxProviderError
  >;

  /**
   * Verify the connection is still valid and return current account summary.
   */
  verifyConnection(params: {
    orgId: string;
    tokenRef: string;
  }): Promise<MailboxAccountSummary | MailboxProviderError>;

  /**
   * Perform an incremental sync delta from the given cursor.
   * Returns thread envelopes and the next cursor to persist.
   * If cursor is null, performs an initial sync (may be paginated).
   */
  syncDelta(params: {
    orgId: string;
    tokenRef: string;
    cursor: MailboxSyncCursor | null;
  }): Promise<
    | { threads: MailboxThreadEnvelope[]; nextCursor: MailboxSyncCursor | null }
    | MailboxProviderError
  >;

  /**
   * Fetch full thread detail including message bodies.
   * Returns message envelopes with body content.
   */
  fetchThreadDetail(params: {
    orgId: string;
    tokenRef: string;
    providerThreadId: string;
  }): Promise<
    | { messages: (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null })[] }
    | MailboxProviderError
  >;

  /**
   * Revoke provider authorization and clean up any push subscriptions.
   * Best-effort: should not throw if the provider is unreachable.
   */
  disconnect(params: {
    orgId: string;
    tokenRef: string;
  }): Promise<void>;
}

// ─── Provider registry ────────────────────────────────────────────────────────

/**
 * Registry of available provider adapters.
 * Sprint 2.2 registers the Gmail adapter here.
 * The mailbox service layer resolves adapters through this registry.
 */
export type MailboxProviderRegistry = Map<MailboxProviderType, IMailboxProviderAdapter>;

/**
 * Type guard: checks whether a provider error result was returned.
 */
export function isMailboxProviderError(
  result: unknown,
): result is MailboxProviderError {
  return (
    typeof result === "object" &&
    result !== null &&
    "category" in result &&
    "safeMessage" in result &&
    "retryable" in result
  );
}
