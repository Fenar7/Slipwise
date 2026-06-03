import "server-only";

/**
 * Gmail provider adapter.
 *
 * Implements IMailboxProviderAdapter for Gmail using the Gmail REST API.
 * All Gmail-specific logic is isolated here. The mailbox core depends only on
 * the provider contract interfaces, never on this file directly.
 *
 * OAuth scopes (least-privilege for Sprint 2.2 auth lifecycle only):
 *   - https://www.googleapis.com/auth/gmail.readonly
 *     Required for verifyConnection (profile fetch) and future sync.
 *   - https://www.googleapis.com/auth/userinfo.email
 *     Required to capture the email address and display name at connect time.
 *
 * Sprint 2.3+ (send/reply) will require additional scopes. They are NOT
 * requested here to honour the least-privilege requirement.
 *
 * Rate-limiting seam:
 *   This adapter does not rate-limit. The OAuth service layer
 *   (src/lib/mailbox/gmail-oauth-service.ts) applies rateLimitByOrg before
 *   calling connect/refreshAuthorization. The adapter is a pure provider
 *   boundary, not a request-handling layer.
 */

import type {
  IMailboxProviderAdapter,
  MailboxProviderDescriptor,
  MailboxConnectionIdentity,
  MailboxAccountSummary,
  MailboxSyncCursor,
  MailboxThreadEnvelope,
  MailboxMessageEnvelope,
  MailboxProviderError,
  MailboxWatchRenewalResult,
  MailboxParticipantRef,
  MailboxDraftSyncResult,
  MailboxDraftEnvelope,
} from "./provider-contracts";
import { storeMailboxCredential, readMailboxCredential, rotateMailboxCredential, revokeMailboxCredential } from "./credential-store";
import type { MailboxCredentialPayload } from "./credential-store";

// ─── Config ───────────────────────────────────────────────────────────────────

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_THREAD_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GMAIL_HISTORY_URL = "https://gmail.googleapis.com/gmail/v1/users/me/history";
const GMAIL_WATCH_URL = "https://gmail.googleapis.com/gmail/v1/users/me/watch";
const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const GMAIL_SEND_URL = "https://www.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_INITIAL_SYNC_MAX_RESULTS = 100;
const GMAIL_BOOTSTRAP_SLICES = [
  { query: "in:inbox",  folder: "INBOX"   as const, includeSpamTrash: false },
  { query: "in:sent",   folder: "SENT"    as const, includeSpamTrash: false },
  { query: "in:spam",   folder: "SPAM"    as const, includeSpamTrash: true  },
  { query: "in:draft",  folder: "DRAFT"   as const, includeSpamTrash: false },
  { query: "in:trash",  folder: "TRASH"   as const, includeSpamTrash: true  },
  { query: "is:starred", folder: "STARRED" as const, includeSpamTrash: false },
] as const;

const GMAIL_WATCH_LABEL_IDS = ["INBOX", "SENT", "SPAM", "DRAFT", "STARRED", "TRASH"] as const;

/**
 * Least-privilege scopes for the Phase 6 connect/reconnect flow.
 * Outbound send scopes are intentionally deferred until that capability ships.
 */
export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

function getGmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Gmail OAuth credentials not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI)");
  }
  return { clientId, clientSecret, redirectUri };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

/**
 * Map a raw Google API HTTP status / error code to a mailbox-safe error category.
 * Raw provider error details are never surfaced to callers — only the category
 * and a safe internal message are returned.
 */
function mapGoogleError(
  status: number,
  errorCode?: string,
): MailboxProviderError {
  // Auth errors
  if (status === 401 || errorCode === "invalid_grant" || errorCode === "invalid_token") {
    return { category: "auth_expired", safeMessage: "Gmail authorization expired or revoked", retryable: false };
  }
  if (status === 403 && errorCode === "insufficientPermissions") {
    return { category: "auth_insufficient", safeMessage: "Gmail token lacks required scopes", retryable: false };
  }
  if (status === 403 && errorCode === "forbidden") {
    return { category: "auth_insufficient", safeMessage: "Gmail access forbidden", retryable: false };
  }
  // Rate limiting
  if (status === 429 || errorCode === "rateLimitExceeded" || errorCode === "userRateLimitExceeded") {
    return { category: "rate_limited", safeMessage: "Gmail API rate limit exceeded", retryable: true };
  }
  // Quota
  if (status === 403 && errorCode === "quotaExceeded") {
    return { category: "quota_exceeded", safeMessage: "Gmail API quota exceeded", retryable: false };
  }
  // History invalid / expired → force full re-sync by treating as watch expired
  if (status === 404 && errorCode === "historyNotFound") {
    return { category: "watch_expired", safeMessage: "Gmail history expired; full re-sync required", retryable: false };
  }
  // Not found
  if (status === 404) {
    return { category: "not_found", safeMessage: "Gmail resource not found", retryable: false };
  }
  // Provider unavailable
  if (status >= 500) {
    return { category: "provider_unavailable", safeMessage: "Gmail API temporarily unavailable", retryable: true };
  }
  return { category: "unknown", safeMessage: "Unexpected Gmail API error", retryable: false };
}

/**
 * Parse a Google API error response body and extract the error code.
 * Returns null if the body is not a recognisable Google error shape.
 */
async function parseGoogleErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = await res.clone().json() as { error?: string | { errors?: { reason?: string }[] } };
    if (typeof body.error === "string") return body.error;
    if (typeof body.error === "object" && Array.isArray(body.error.errors)) {
      return body.error.errors[0]?.reason;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

// ─── Token exchange helpers ───────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope: string;
}

async function readResponseBodyForLog(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    try {
      const clone = res.clone() as Response & { text?: () => Promise<string> };
      if (typeof clone.text === "function") {
        return await clone.text();
      }
    } catch {
      // ignore clone failures
    }
  }
  return "[unavailable]";
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse | MailboxProviderError> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errorBody = await readResponseBodyForLog(res);
    console.error("[gmail-provider] exchangeCodeForTokens failed:", {
      status: res.status,
      statusText: res.statusText,
      redirectUri,
      clientId: clientId.substring(0, 10) + "...",
      errorBody,
    });
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse | MailboxProviderError> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

// ─── Userinfo / profile helpers ───────────────────────────────────────────────

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  email_verified?: boolean;
}

async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo | MailboxProviderError> {
  const res = await fetch(GMAIL_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<GoogleUserInfo>;
}

async function fetchGmailProfile(
  accessToken: string,
): Promise<{ emailAddress: string; messagesTotal: number; historyId: string | null } | MailboxProviderError> {
  const res = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<{ emailAddress: string; messagesTotal: number; historyId: string | null }>;
}

function isProviderError(v: unknown): v is MailboxProviderError {
  return (
    typeof v === "object" &&
    v !== null &&
    "category" in v &&
    "safeMessage" in v &&
    "retryable" in v
  );
}

// ─── Safe fetch wrapper ─────────────────────────────────────────────────────

/**
 * Wraps fetch() and normalizes ALL transport-level exceptions into a
 * MailboxProviderError with a safe category string. This prevents raw
 * "fetch failed" / "TypeError: fetch failed" text from leaking into
 * user-visible sync state.
 *
 * Non-OK HTTP responses are NOT treated as errors here — callers must
 * check `res.ok` themselves (or use this wrapper only for the transport
 * layer). This keeps the helper focused on network/transport failures.
 */
async function safeGmailFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response | MailboxProviderError> {
  try {
    const res = await fetch(url, init);
    return res;
  } catch (error) {
    if (isAbortError(error)) {
      return {
        category: "provider_unavailable",
        safeMessage: "Gmail request timed out or was aborted",
        retryable: true,
      };
    }
    if (isNetworkError(error)) {
      return {
        category: "provider_unavailable",
        safeMessage: "Gmail API unreachable (network error)",
        retryable: true,
      };
    }
    return {
      category: "unknown",
      safeMessage: "Gmail request failed (transport error)",
      retryable: true,
    };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnrefused");
  }
  return false;
}

// ─── Adapter implementation ───────────────────────────────────────────────────

const descriptor: MailboxProviderDescriptor = {
  provider: "GMAIL",
  displayName: "Gmail",
  supportsPushSync: true,
  supportsSend: true,
};

export const gmailProviderAdapter: IMailboxProviderAdapter = {
  descriptor,

  /**
   * Exchange an authorization code for Gmail credentials.
   * Fetches user identity, encrypts tokens via the credential store, and
   * returns only the opaque tokenRef in the MailboxConnectionIdentity.
   */
  async connect({ orgId, authorizationCode, redirectUri }) {
    const { clientId, clientSecret } = getGmailConfig();

    const tokens = await exchangeCodeForTokens(
      authorizationCode,
      redirectUri,
      clientId,
      clientSecret,
    );
    if (isProviderError(tokens)) return tokens;

    // Fetch user identity to capture providerAccountId and email.
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    if (isProviderError(userInfo)) return userInfo;

    const expiresAtMs = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null;

    const payload: MailboxCredentialPayload = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAtMs,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    };

    const tokenRef = await storeMailboxCredential(orgId, payload);

    return {
      providerAccountId: userInfo.sub,
      emailAddress: userInfo.email,
      displayName: userInfo.name ?? userInfo.email,
      tokenRef,
      tokenExpiry: expiresAtMs ? new Date(expiresAtMs) : null,
    };
  },

  /**
   * Refresh the access token using the stored refresh token.
   * Updates the credential store in-place (same tokenRef).
   * Returns auth_expired if the refresh token is also expired/revoked.
   */
  async refreshAuthorization({ orgId, tokenRef }) {
    const { clientId, clientSecret } = getGmailConfig();

    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }
    if (!credential.refreshToken) {
      return { category: "auth_expired", safeMessage: "No refresh token available", retryable: false };
    }

    const tokens = await refreshAccessToken(
      credential.refreshToken,
      clientId,
      clientSecret,
    );
    if (isProviderError(tokens)) return tokens;

    const expiresAtMs = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null;

    const newPayload: MailboxCredentialPayload = {
      accessToken: tokens.access_token,
      // Google may or may not return a new refresh token on refresh.
      // If not returned, retain the existing one.
      refreshToken: tokens.refresh_token ?? credential.refreshToken,
      expiresAtMs,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    };

    await rotateMailboxCredential(orgId, tokenRef, newPayload);

    return {
      tokenRef,
      tokenExpiry: expiresAtMs ? new Date(expiresAtMs) : null,
    };
  },

  /**
   * Verify the connection is still valid by fetching the Gmail profile.
   * Returns auth_expired if the token is revoked or expired.
   */
  async verifyConnection({ orgId, tokenRef }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const userInfo = await fetchGoogleUserInfo(credential.accessToken);
    if (isProviderError(userInfo)) return userInfo;

    return {
      providerAccountId: userInfo.sub,
      emailAddress: userInfo.email,
      displayName: userInfo.name ?? userInfo.email,
      isAccessible: true,
    };
  },

  /**
   * Perform a sync run. Supports both initial backfill and incremental delta.
   *
   * - If cursor is null → initial sync using threads.list (page-token pagination).
   * - If cursor exists  → incremental delta using history.list (real Gmail
   *   history-based sync) to avoid re-fetching unchanged threads.
   *
   * Returns normalized thread envelopes and the next cursor to persist.
   */
  async syncDelta({ orgId, tokenRef, cursor, folderCursors }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    if (cursor) {
      // ─── Delta path: use Gmail history.list ───────────────────────────────
      const threadIds = new Set<string>();
      // Gmail messagesDeleted is message-level, not thread-level. Collect
      // provider message IDs so we can reconcile individual message deletion
      // rather than incorrectly removing entire multi-message threads.
      const deletedMessageIds = new Set<string>();
      // Track which threads had any deletion so we know which ones to re-fetch
      // for accurate local state.
      const deletionAffectedThreadIds = new Set<string>();
      let nextPageToken: string | undefined;
      let lastHistoryId = cursor.value;

      do {
        const params = new URLSearchParams({
          startHistoryId: cursor.value,
          maxResults: "100",
        });
        if (nextPageToken) {
          params.set("pageToken", nextPageToken);
        }
        const historyRes = await safeGmailFetch(`${GMAIL_HISTORY_URL}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (isProviderError(historyRes)) return historyRes;
        if (!historyRes.ok) {
          const errorCode = await parseGoogleErrorCode(historyRes);
          return mapGoogleError(historyRes.status, errorCode);
        }

        const historyData = await historyRes.json() as GmailHistoryListResponse;
        if (historyData.historyId) {
          lastHistoryId = historyData.historyId;
        }
        for (const record of historyData.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            if (added.message?.threadId) threadIds.add(added.message.threadId);
          }
          for (const modified of record.labelsAdded ?? []) {
            if (modified.message?.threadId) threadIds.add(modified.message.threadId);
          }
          // Message-level deletion: capture provider message IDs for
          // individual message removal, not whole-thread deletion.
          for (const deleted of record.messagesDeleted ?? []) {
            if (deleted.message?.id) deletedMessageIds.add(deleted.message.id);
            if (deleted.message?.threadId) {
              deletionAffectedThreadIds.add(deleted.message.threadId);
              threadIds.add(deleted.message.threadId);
            }
          }
          // Track label removals: important for spam↔inbox transitions.
          for (const removed of record.labelsRemoved ?? []) {
            if (removed.message?.threadId) threadIds.add(removed.message.threadId);
          }
        }
        nextPageToken = historyData.nextPageToken;
      } while (nextPageToken);

      const threadFetch = await fetchThreadEnvelopes(accessToken, [...threadIds]);

      const nextCursor: MailboxSyncCursor = {
        value: lastHistoryId,
        expiresAt: null,
      };

      return {
        threads: threadFetch.threads,
        nextCursor,
        deletedMessageIds: deletedMessageIds.size > 0 ? [...deletedMessageIds] : undefined,
        deletionAffectedThreadIds: deletionAffectedThreadIds.size > 0 ? [...deletionAffectedThreadIds] : undefined,
      };
    }

    // ─── Initial path: use threads.list ─────────────────────────────────────
    // Gmail-grade bootstrap: fetch all mailbox history across INBOX, SENT, SPAM,
    // DRAFT, and STARRED slices using exhaustive multi-pass pagination
    // (100 threads per page, until exhaustion). Returns per-slice exhaustion
    // status so the sync service can decide folder completeness truthfully.
    const threadIds = new Set<string>();
    let highestHistoryId = "0";
    const bootstrapSliceResults: Array<{
      sliceLabel: string;
      paginationExhausted: boolean;
      threadCount: number;
      lastAdvancedCursor: string;
    }> = [];

    for (const slice of GMAIL_BOOTSTRAP_SLICES) {
      const startPageToken = folderCursors?.[slice.folder] ?? undefined;
      const sliceResult = await fetchBoundedThreadRefsForQuery(accessToken, slice, startPageToken);
      if (isProviderError(sliceResult)) return sliceResult;

      const sliceLabel = slice.folder;
      let sliceThreadCount = 0;
      let sliceHighestHistoryId = highestHistoryId;

      for (const threadRef of sliceResult.threadRefs) {
        threadIds.add(threadRef.id);
        sliceHighestHistoryId = maxHistoryId(sliceHighestHistoryId, threadRef.historyId);
        sliceThreadCount += 1;
      }
      highestHistoryId = maxHistoryId(highestHistoryId, sliceHighestHistoryId);

      bootstrapSliceResults.push({
        sliceLabel,
        paginationExhausted: sliceResult.paginationExhausted,
        threadCount: sliceThreadCount,
        lastAdvancedCursor: sliceResult.nextPageToken ?? null,
      });
    }

    const threadFetch = await fetchThreadEnvelopes(accessToken, [...threadIds], highestHistoryId);
    highestHistoryId = threadFetch.highestHistoryId;

    const profile = await fetchGmailProfile(accessToken);
    if (isProviderError(profile)) return profile;

    const nextCursor: MailboxSyncCursor = {
      value: profile.historyId ?? highestHistoryId,
      expiresAt: null,
    };

    return {
      threads: threadFetch.threads,
      nextCursor,
      bootstrapSliceResults,
    };
  },

  async syncDrafts({ orgId, tokenRef }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    const draftIds = await fetchAllDraftIds(accessToken);
    if (isProviderError(draftIds)) return draftIds;
    console.log(`[mailbox/gmail] syncDrafts start: ${draftIds.length} draft IDs to fetch`);

    if (draftIds.length === 0) {
      return { drafts: [], activeDraftIds: [], failedDraftIds: [] };
    }

    const drafts: MailboxDraftEnvelope[] = [];
    const activeDraftIds: string[] = [];
    const failedDraftIds: string[] = [];

    for (const draftId of draftIds) {
      const draft = await fetchDraftWithRetry(accessToken, draftId);
      if (isProviderError(draft)) {
        if (draft.category === "not_found") {
          continue;
        }
        // Log and continue — do not abort the entire batch for one bad draft.
        // A single malformed or transiently-failing draft should not hide
        // the other N drafts from the user.
        failedDraftIds.push(draftId);
        console.warn(
          `[mailbox/gmail] Draft fetch failed (id=${draftId}, category=${draft.category}): ${draft.safeMessage}`,
        );
        continue;
      }

      const message = draft.message ?? {
        id: `gmail-draft-message:${draftId}`,
        threadId: `gmail-draft-thread:${draftId}`,
        labelIds: ["DRAFT"],
      };

      activeDraftIds.push(draftId);
      const envelope = toDraftEnvelope(draftId, message);
      if (!envelope) {
        continue;
      }
      drafts.push(envelope);
    }

    const successCount = activeDraftIds.length;
    const failCount = failedDraftIds.length;
    const notFoundCount = draftIds.length - successCount - failCount;
    console.log(
      `[mailbox/gmail] syncDrafts summary: total=${draftIds.length}, success=${successCount}, failed=${failCount}, not_found_skipped=${notFoundCount}`,
    );

    if (failedDraftIds.length > 0) {
      console.warn(
        `[mailbox/gmail] Draft sync completed with ${failedDraftIds.length}/${draftIds.length} fetch failures: [${failedDraftIds.join(", ")}]`,
      );
    }

    return {
      drafts,
      activeDraftIds,
      failedDraftIds,
    } satisfies MailboxDraftSyncResult;
  },

  /**
   * Renew the Gmail push watch subscription.
   * Calls the Gmail watch endpoint and returns expiration + metadata.
   * Returns watch_expired if the topic is not configured or the call fails.
   */
  async renewWatch({ orgId, tokenRef }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) {
      return {
        category: "watch_expired",
        safeMessage: "Gmail push topic not configured; cannot renew watch",
        retryable: false,
      };
    }

    const res = await safeGmailFetch(GMAIL_WATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topicName, labelIds: [...GMAIL_WATCH_LABEL_IDS] }),
    });

    if (isProviderError(res)) return res;
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as { historyId?: string; expiration?: string };
    const expiresAt = data.expiration ? new Date(parseInt(data.expiration, 10)) : null;
    return {
      expiresAt,
      metadata: {
        gmailHistoryId: data.historyId ?? null,
        gmailWatchExpiration: data.expiration ?? null,
      },
    };
  },

  /**
   * Fetch full thread detail including message bodies and attachments.
   */
  async fetchThreadDetail({ orgId, tokenRef, providerThreadId }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    const res = await safeGmailFetch(`${GMAIL_THREAD_URL}/${providerThreadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (isProviderError(res)) return res;
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as GmailThreadResponse;
    const messages = (data.messages ?? []).map(toMessageEnvelope).filter(Boolean) as (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null })[];
    return { messages };
  },

  /**
   * Send an outbound message via Gmail.
   *
   * Constructs a MIME message with proper headers, base64url-encodes it, and
   * sends via the Gmail users.messages.send endpoint.
   *
   * Reply threading:
   * - threadContext.providerThreadId is passed as the Gmail threadId.
   * - In-Reply-To and References headers are set from the original message
   *   so Gmail threads the reply correctly.
   */
  async sendMessage({ orgId, tokenRef, from, to, cc, bcc, subject, htmlBody, textBody, threadContext, attachments, correlationKey, rfcMessageId }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    // Check token scope for send permission
    const hasSendScope = credential.scope?.includes("gmail.send") ?? false;
    if (!hasSendScope) {
      return { category: "auth_insufficient", safeMessage: "Gmail token lacks gmail.send scope; reconnect required", retryable: false };
    }

    const mime = buildMimeMessage({ from, to, cc, bcc, subject, htmlBody, textBody, threadContext, attachments, correlationKey, rfcMessageId });
    const raw = encodeBase64Url(mime);

    const payload: Record<string, unknown> = { raw };
    if (threadContext) {
      payload.threadId = threadContext.providerThreadId;
    }

    const res = await safeGmailFetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (isProviderError(res)) return res;
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as { id: string; threadId?: string };

    // Extract the RFC Message-ID from the sent message by re-fetching
    let extractedRfcMessageId: string | null = null;
    try {
      const detailRes = await safeGmailFetch(`${GMAIL_THREAD_URL}/${data.threadId ?? threadContext?.providerThreadId ?? ""}/messages/${data.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!isProviderError(detailRes) && detailRes.ok) {
        const detail = await detailRes.json() as GmailMessage;
        const headers = detail.payload?.headers ?? [];
        extractedRfcMessageId = headers.find((h) => h.name === "Message-ID")?.value ?? null;
      }
    } catch {
      // Best-effort: if re-fetch fails, rfcMessageId stays null.
    }

    return {
      providerMessageId: data.id,
      providerThreadId: data.threadId ?? threadContext?.providerThreadId ?? "",
      rfcMessageId: extractedRfcMessageId ?? rfcMessageId ?? null,
    };
  },

  /**
   * Reconcile a prior send attempt by searching Gmail for the message.
   * Uses the RFC Message-ID header to look up the sent message.
   * Sprint 5.4: resolves PENDING_RECONCILIATION send attempts.
   */
  async reconcileSend({ orgId, tokenRef, correlationKey, rfcMessageId }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    // Search Gmail for the message by its RFC Message-ID header.
    // If no rfcMessageId is available, fall back to correlationKey in the
    // X-Slipwise-Correlation header (less reliable, best-effort).
    const query = rfcMessageId
      ? `rfc822msgid:${rfcMessageId.replace(/[<>]/g, "")}`
      : `X-Slipwise-Correlation:${correlationKey}`;

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
    try {
      const searchRes = await safeGmailFetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (isProviderError(searchRes)) return searchRes;
      if (!searchRes.ok) {
        const errorCode = await parseGoogleErrorCode(searchRes);
        return mapGoogleError(searchRes.status, errorCode);
      }

      const searchData = await searchRes.json() as { messages?: Array<{ id: string; threadId: string }> };
      if (!searchData.messages || searchData.messages.length === 0) {
        return { found: false, providerMessageId: null, providerThreadId: null, rfcMessageId: null };
      }

      const match = searchData.messages[0];
      return {
        found: true,
        providerMessageId: match.id,
        providerThreadId: match.threadId,
        rfcMessageId: rfcMessageId ?? null,
      };
    } catch {
      return { category: "provider_unavailable", safeMessage: "Gmail search failed during reconciliation", retryable: true };
    }
  },

  /**
   * Fetch attachment bytes from Gmail.
   *
   * Uses the Gmail users.messages.attachments.get endpoint.
   * Returns base64url-decoded bytes.
   */
  async fetchAttachment({ orgId, tokenRef, providerMessageId, providerAttachmentId }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/attachments/${providerAttachmentId}`;
    const res = await safeGmailFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (isProviderError(res)) return res;
    if (!res.ok) {
      if (res.status === 401) {
        return { category: "auth_expired", safeMessage: "Gmail auth expired during attachment fetch", retryable: false };
      }
      if (res.status === 404) {
        return { category: "not_found", safeMessage: "Attachment not found on Gmail", retryable: false };
      }
      return { category: "unknown", safeMessage: `Gmail attachment fetch failed: ${res.status}`, retryable: true };
    }

    const data = await res.json() as { data?: string; size?: number };
    if (!data.data) {
      return { category: "unknown", safeMessage: "Gmail attachment response missing data field", retryable: false };
    }

    const bytes = Buffer.from(data.data, "base64url");
    return { bytes, filename: "", mimeType: "application/octet-stream" };
  },

  /**
   * Revoke Gmail authorization and clean up stored credentials.
   * Best-effort: does not throw if the provider revoke call fails.
   */
  async disconnect({ orgId, tokenRef }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (credential) {
      // Attempt to revoke the access token with Google.
      // Best-effort: we always clean up locally regardless of provider response.
      try {
        const tokenToRevoke = credential.refreshToken ?? credential.accessToken;
        await fetch(`${GMAIL_REVOKE_URL}?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: "POST",
        });
      } catch {
        // Provider revoke failure is non-fatal.
      }
    }
    // Always delete the local credential entry.
    await revokeMailboxCredential(orgId, tokenRef);
  },

  /**
   * Query Gmail for thread IDs matching a provider-specific query.
   * Lightweight: returns only thread IDs, no message content.
   * Used for STARRED/TRASH reconciliation after delta sync.
   */
  async queryThreadIdsByLabel({ orgId, tokenRef, query }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    const threadIds: string[] = [];
    let nextPageToken: string | undefined;
    const MAX_PAGES = 5; // Bounded: ~500 threads max for reconciliation

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        q: query,
        maxResults: "100",
      });
      if (nextPageToken) {
        params.set("pageToken", nextPageToken);
      }

      const res = await safeGmailFetch(`${GMAIL_THREADS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (isProviderError(res)) return res;
      if (!res.ok) {
        const errorCode = await parseGoogleErrorCode(res);
        return mapGoogleError(res.status, errorCode);
      }

      const data = await res.json() as GmailThreadsListResponse;
      for (const thread of data.threads ?? []) {
        threadIds.push(thread.id);
      }
      nextPageToken = data.nextPageToken;
      if (!nextPageToken) break;
    }

    return { threadIds };
  },
};

// ─── Gmail API types ──────────────────────────────────────────────────────────

interface GmailThreadsListResponse {
  threads?: GmailThreadRef[];
  nextPageToken?: string;
}

interface GmailDraftsListResponse {
  drafts?: Array<{ id: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailDraftResponse {
  id: string;
  message?: GmailMessage;
}

type GmailBootstrapSlice = (typeof GMAIL_BOOTSTRAP_SLICES)[number];

interface GmailThreadRef {
  id: string;
  historyId?: string;
  snippet?: string;
}

interface GmailHistoryListResponse {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

interface GmailHistoryRecord {
  messagesAdded?: Array<{ message?: { id: string; threadId: string } }>;
  labelsAdded?: Array<{ message?: { id: string; threadId: string } }>;
  messagesDeleted?: Array<{ message?: { id: string; threadId: string } }>;
  labelsRemoved?: Array<{ message?: { id: string; threadId: string } }>;
}

interface GmailThreadResponse {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  historyId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

interface GmailMessagePartBody {
  attachmentId?: string;
  size?: number;
  data?: string;
}

function maxHistoryId(current: string, candidate?: string | null): string {
  if (!candidate) return current;
  try {
    return BigInt(candidate) > BigInt(current) ? candidate : current;
  } catch {
    return current;
  }
}

function parseGmailDate(internalDate: string | null | undefined): Date {
  if (!internalDate) return new Date();
  const ms = parseInt(internalDate, 10);
  if (isNaN(ms)) return new Date();
  const d = new Date(ms);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

async function fetchBoundedThreadRefsForQuery(
  accessToken: string,
  slice: GmailBootstrapSlice,
  startPageToken?: string,
): Promise<{
  threadRefs: GmailThreadRef[];
  paginationExhausted: boolean;
  nextPageToken?: string;
} | MailboxProviderError> {
  const threadRefs: GmailThreadRef[] = [];
  let nextPageToken: string | undefined = startPageToken;
  let pagesFetched = 0;
  // Safety cap: 10,000 pages = ~1M threads max per folder
  const SAFETY_MAX_PAGES = 10_000;

  do {
    pagesFetched += 1;
    if (pagesFetched > SAFETY_MAX_PAGES) break;

    const params = new URLSearchParams({
      maxResults: String(GMAIL_INITIAL_SYNC_MAX_RESULTS),
      includeSpamTrash: String(slice.includeSpamTrash),
      q: slice.query,
    });
    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const res = await safeGmailFetch(`${GMAIL_THREADS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (isProviderError(res)) return res;
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as GmailThreadsListResponse;
    threadRefs.push(...(data.threads ?? []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  // paginationExhausted is true when there are no more pages on the provider
  return { threadRefs, paginationExhausted: !nextPageToken, nextPageToken };
}

async function fetchAllDraftIds(
  accessToken: string,
): Promise<string[] | MailboxProviderError> {
  const draftIds: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      maxResults: "100",
    });
    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const res = await safeGmailFetch(`${GMAIL_DRAFTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (isProviderError(res)) return res;
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as GmailDraftsListResponse;
    const pageDraftIds: string[] = [];
    for (const draft of data.drafts ?? []) {
      if (draft?.id) {
        pageDraftIds.push(draft.id);
      }
    }
    draftIds.push(...pageDraftIds);
    nextPageToken = data.nextPageToken;

    console.log(
      `[mailbox/gmail] fetchAllDraftIds page: resultSizeEstimate=${data.resultSizeEstimate ?? "?"}, extracted=${pageDraftIds.length}, pageToken=${nextPageToken ? "present" : "none"}`,
    );
  } while (nextPageToken);

  console.log(
    `[mailbox/gmail] fetchAllDraftIds total: ${draftIds.length} IDs, sample=[${draftIds.slice(0, 5).join(", ")}]`,
  );

  return draftIds;
}

async function fetchDraft(
  accessToken: string,
  draftId: string,
): Promise<GmailDraftResponse | MailboxProviderError> {
  const res = await safeGmailFetch(`${GMAIL_DRAFTS_URL}/${draftId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (isProviderError(res)) return res;
  if (!res.ok) {
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<GmailDraftResponse>;
}

async function fetchDraftWithRetry(
  accessToken: string,
  draftId: string,
  maxRetries = 3,
): Promise<GmailDraftResponse | MailboxProviderError> {
  let lastError: MailboxProviderError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const result = await fetchDraft(accessToken, draftId);
    if (!isProviderError(result)) return result;
    lastError = result;
    if (!result.retryable) return result;
  }
  return lastError!;
}

async function fetchThreadEnvelopes(
  accessToken: string,
  threadIds: string[],
  initialHighestHistoryId = "0",
): Promise<{ threads: MailboxThreadEnvelope[]; highestHistoryId: string }> {
  const threads: MailboxThreadEnvelope[] = [];
  let highestHistoryId = initialHighestHistoryId;

  for (const threadId of threadIds) {
    const threadRes = await safeGmailFetch(`${GMAIL_THREAD_URL}/${threadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (isProviderError(threadRes) || !threadRes.ok) continue;

    const threadData = await threadRes.json() as GmailThreadResponse;
    highestHistoryId = maxHistoryId(highestHistoryId, threadData.historyId);

    const envelope = toThreadEnvelope(threadData);
    if (envelope) {
      threads.push(envelope);
    }
  }

  return { threads, highestHistoryId };
}

// ─── Gmail parsing helpers ────────────────────────────────────────────────────

function toThreadEnvelope(thread: GmailThreadResponse): MailboxThreadEnvelope | null {
  const firstMessage = thread.messages?.[0];
  if (!firstMessage) return null;

  const headers = firstMessage.payload?.headers ?? [];
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
  const participants = extractParticipants(headers);
  const lastMessage = thread.messages![thread.messages!.length - 1];
  const unreadCount = thread.messages?.filter((m) => m.labelIds?.includes("UNREAD")).length ?? 0;

  return {
    providerThreadId: thread.id,
    subject,
    lastMessageAt: parseGmailDate(lastMessage?.internalDate).toISOString(),
    unreadCount,
    participants,
    providerMetadata: { gmailHistoryId: thread.historyId, messageCount: thread.messages?.length ?? 0 },
  };
}

function toDraftThreadEnvelope(draftId: string, message: GmailMessage): MailboxThreadEnvelope {
  const headers = message.payload?.headers ?? [];
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(No subject)";
  const participants = extractParticipants(headers);
  const lastMessageAt = parseGmailDate(message.internalDate).toISOString();

  return {
    providerThreadId: message.threadId ?? `gmail-draft-thread:${draftId}`,
    subject,
    lastMessageAt,
    unreadCount: 0,
    participants,
    providerMetadata: {
      gmailHistoryId: message.historyId ?? null,
      messageCount: 1,
      source: "draft",
    },
  };
}

function toDraftEnvelope(
  draftId: string,
  message: GmailMessage,
): MailboxDraftEnvelope | null {
  const isUnavailable = !message.payload;
  const thread = toDraftThreadEnvelope(draftId, message);
  const draftMessage = toMessageEnvelope({
    ...message,
    id: message.id ?? `gmail-draft-message:${draftId}`,
    labelIds: [...new Set([...(message.labelIds ?? []), "DRAFT"])],
  });
  if (!draftMessage) return null;

  const finalSubject = draftMessage.subject.trim() || "(No subject)";

  let finalHtmlBody = draftMessage.htmlBody;
  if (!finalHtmlBody && draftMessage.textBody) {
    finalHtmlBody = `<div style="white-space: pre-wrap;">${draftMessage.textBody}</div>`;
  }

  return {
    draftId,
    thread: {
      ...thread,
      subject: finalSubject,
    },
    message: {
      ...draftMessage,
      subject: finalSubject,
      htmlBody: finalHtmlBody,
      // Drafts should not appear in Sent just because they originated from the sender.
      direction: "inbound",
      providerMetadata: {
        ...draftMessage.providerMetadata,
        labelIds: [
          ...new Set([
            ...(((draftMessage.providerMetadata as { labelIds?: string[] }).labelIds) ?? []),
            "DRAFT",
          ]),
        ],
        gmailDraftId: draftId,
        source: "draft",
        isUnavailable,
      },
    },
  };
}

function toMessageEnvelope(msg: GmailMessage): (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null }) | null {
  const headers = msg.payload?.headers ?? [];
  const from = parseAddressHeader(headers.find((h) => h.name === "From")?.value ?? "") ?? { email: "", displayName: "(No sender)" };
  const to = parseAddressListHeader(headers.find((h) => h.name === "To")?.value ?? "");
  const cc = parseAddressListHeader(headers.find((h) => h.name === "Cc")?.value ?? "");
  const bcc = parseAddressListHeader(headers.find((h) => h.name === "Bcc")?.value ?? "");
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
  const messageId = headers.find((h) => h.name === "Message-ID")?.value ?? null;
  const date = parseGmailDate(msg.internalDate);
  const direction = isOutbound(msg.labelIds ?? []) ? "outbound" : "inbound";

  const { htmlBody, textBody } = extractBodies(msg.payload ?? null);
  const attachments = extractAttachments(msg.payload ?? null);

  let snippet = msg.snippet ?? "";
  if (!snippet.trim()) {
    snippet = (textBody || htmlBody.replace(/<[^>]+>/g, "")).slice(0, 150).trim();
  }

  return {
    providerMessageId: msg.id,
    rfcMessageId: messageId,
    direction,
    from,
    to,
    cc,
    bcc,
    subject: subject.trim() || "(No subject)",
    snippet,
    sentAt: date.toISOString(),
    receivedAt: date.toISOString(),
    attachmentCount: attachments.length,
    providerMetadata: { labelIds: msg.labelIds ?? [] },
    htmlBody,
    textBody,
    attachments,
  };
}

function extractParticipants(headers: Array<{ name: string; value: string }>): MailboxParticipantRef[] {
  const from = headers.find((h) => h.name === "From")?.value ?? "";
  const to = headers.find((h) => h.name === "To")?.value ?? "";
  const cc = headers.find((h) => h.name === "Cc")?.value ?? "";
  const all = [from, to, cc].join(", ");
  return parseAddressListHeader(all);
}

/**
 * Parse an RFC-style address-list header into normalized participant refs.
 * Handles quoted display names containing commas and angle-bracket addresses.
 *
 * Exported for unit testing.
 */
export function parseAddressListHeader(value: string): MailboxParticipantRef[] {
  if (!value) return [];

  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngleBrackets = false;

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '<' && !inQuotes) {
      inAngleBrackets = true;
      current += char;
    } else if (char === '>' && !inQuotes) {
      inAngleBrackets = false;
      current += char;
    } else if (char === ',' && !inQuotes && !inAngleBrackets) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts
    .map((part) => parseAddressHeader(part))
    .filter((p): p is MailboxParticipantRef => p !== null);
}

export function parseAddressHeader(value: string): MailboxParticipantRef | null {
  if (!value) return null;
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const displayName = match[1].trim().replace(/^"|"$/g, "");
    return { email: match[2].trim(), displayName: displayName || null };
  }
  if (value.includes("@")) {
    return { email: value.trim(), displayName: null };
  }
  return null;
}

export function isOutbound(labelIds: string[]): boolean {
  // Gmail labels a sent message with "SENT". If present, treat as outbound.
  return labelIds.includes("SENT");
}

function extractBodies(part: GmailMessagePart | null): { htmlBody: string; textBody: string | null } {
  if (!part) return { htmlBody: "", textBody: null };

  const htmlParts: string[] = [];
  const textParts: string[] = [];

  function walk(p: GmailMessagePart) {
    const mimeType = p.mimeType ?? "";

    // Skip forwarded-message subtrees so we don't concatenate
    // the bodies of attached/embedded emails.
    if (mimeType === "message/rfc822") {
      return;
    }

    // Leaf part with inline body data.
    if (p.body?.data) {
      if (mimeType === "text/html") {
        htmlParts.push(decodeBase64(p.body.data));
      } else if (mimeType === "text/plain") {
        textParts.push(decodeBase64(p.body.data));
      }
    }

    // Recurse into child parts for multipart containers.
    if (p.parts) {
      for (const child of p.parts) walk(child);
    }
  }

  walk(part);

  const htmlBody = htmlParts.join("\n").trim();
  const textBody = textParts.join("\n").trim() || null;

  return {
    htmlBody,
    textBody,
  };
}

type GmailAttachment = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
};

function extractAttachments(part: GmailMessagePart | null): GmailAttachment[] {
  if (!part) return [];
  const attachments: GmailAttachment[] = [];

  function walk(p: GmailMessagePart) {
    const mimeType = p.mimeType ?? "";
    const filename = p.filename ?? "";
    if (filename && p.body?.attachmentId) {
      attachments.push({
        providerAttachmentId: p.body.attachmentId,
        filename,
        mimeType,
        size: p.body.size ?? 0,
        isInline: mimeType.startsWith("image/") && (p.headers?.some((h) => h.name === "Content-Disposition" && h.value?.includes("inline")) ?? false),
      });
    }
    if (p.parts) {
      for (const child of p.parts) walk(child);
    }
  }

  walk(part);
  return attachments;
}

function decodeBase64(data: string): string {
  // Gmail uses URL-safe base64 with padding stripped.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, "=");
  try {
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a MIME message for Gmail send.
 *
 * Sprint 5.2 implements text/html and text/plain bodies.
 * Sprint 5.3 adds multipart/mixed attachment support.
 *
 * Reply threading headers (In-Reply-To, References) are included
 * when threadContext is provided.
 */
function buildMimeMessage(params: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  threadContext?: {
    providerThreadId: string;
    inReplyToRfcMessageId?: string | null;
    references?: string[] | null;
  } | null;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    isInline: boolean;
    contentBase64: string;
  }>;
  correlationKey?: string;
  rfcMessageId?: string;
}): string {
  const mixedBoundary = `---- SlipwiseMixed ${Math.random().toString(36).slice(2)}`;
  const relatedBoundary = `---- SlipwiseRelated ${Math.random().toString(36).slice(2)}`;
  const altBoundary = `---- SlipwiseAlt ${Math.random().toString(36).slice(2)}`;
  const { from, to, cc, bcc, subject, htmlBody, textBody, threadContext, attachments, correlationKey, rfcMessageId } = params;
  const hasAttachments = !!attachments && attachments.length > 0;
  const inlineAttachments = attachments?.filter((a) => a.isInline) ?? [];
  const fileAttachments = attachments?.filter((a) => !a.isInline) ?? [];
  const hasInline = inlineAttachments.length > 0;
  const hasFile = fileAttachments.length > 0;
  const hasHtml = !!htmlBody;
  const hasPlain = !!textBody;

  const headers: string[] = [];
  headers.push(`From: ${from}`);
  headers.push(`To: ${to.join(", ")}`);
  if (cc && cc.length > 0) headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc && bcc.length > 0) headers.push(`Bcc: ${bcc.join(", ")}`);
  headers.push(`Subject: ${subject}`);
  headers.push("MIME-Version: 1.0");
  if (rfcMessageId) headers.push(`Message-ID: ${rfcMessageId}`);
  if (correlationKey) headers.push(`X-Slipwise-Correlation: ${correlationKey}`);

  if (threadContext?.inReplyToRfcMessageId) {
    headers.push(`In-Reply-To: ${threadContext.inReplyToRfcMessageId}`);
  }
  if (threadContext?.references && threadContext.references.length > 0) {
    headers.push(`References: ${threadContext.references.join(" ")}`);
  }

  function makeContentId(filename: string, index: number): string {
    const safe = filename.replace(/[^a-zA-Z0-9.-]/g, "_").toLowerCase();
    return `<slipwise-inline-${safe}-${index}>`;
  }

  function buildAlternativePart(): string[] {
    const parts: string[] = [];
    parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    parts.push("");
    parts.push(`--${altBoundary}`);
    parts.push("Content-Type: text/plain; charset=\"UTF-8\"");
    parts.push("Content-Transfer-Encoding: quoted-printable");
    parts.push("");
    parts.push(textBody!);
    parts.push("");
    parts.push(`--${altBoundary}`);
    parts.push("Content-Type: text/html; charset=\"UTF-8\"");
    parts.push("Content-Transfer-Encoding: quoted-printable");
    parts.push("");
    parts.push(htmlBody);
    parts.push("");
    parts.push(`--${altBoundary}--`);
    return parts;
  }

  function buildHtmlPart(): string[] {
    const parts: string[] = [];
    parts.push("Content-Type: text/html; charset=\"UTF-8\"");
    parts.push("Content-Transfer-Encoding: quoted-printable");
    parts.push("");
    parts.push(htmlBody);
    return parts;
  }

  function buildPlainPart(): string[] {
    const parts: string[] = [];
    parts.push("Content-Type: text/plain; charset=\"UTF-8\"");
    parts.push("Content-Transfer-Encoding: quoted-printable");
    parts.push("");
    parts.push(textBody!);
    return parts;
  }

  function buildBodyPart(): string[] {
    if (hasPlain && hasHtml) return buildAlternativePart();
    if (hasHtml) return buildHtmlPart();
    if (hasPlain) return buildPlainPart();
    const parts: string[] = [];
    parts.push("Content-Type: text/plain; charset=\"UTF-8\"");
    parts.push("");
    parts.push("");
    return parts;
  }

  function buildInlineAttachmentPart(att: GmailAttachment, index: number): string[] {
    const cid = makeContentId(att.filename, index);
    const parts: string[] = [];
    parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-ID: ${cid}`);
    parts.push(`Content-Disposition: inline; filename="${att.filename}"`);
    parts.push("");
    parts.push(wrapBase64(att.contentBase64));
    return parts;
  }

  function buildFileAttachmentPart(att: GmailAttachment): string[] {
    const parts: string[] = [];
    parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push("");
    parts.push(wrapBase64(att.contentBase64));
    return parts;
  }

  function buildRelatedPart(): string[] {
    const parts: string[] = [];
    parts.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`);
    parts.push("");
    parts.push(`--${relatedBoundary}`);
    const bodyParts = buildBodyPart();
    for (const part of bodyParts) {
      parts.push(part);
    }
    inlineAttachments.forEach((att, idx) => {
      parts.push("");
      parts.push(`--${relatedBoundary}`);
      const inlineParts = buildInlineAttachmentPart(att, idx);
      for (const part of inlineParts) {
        parts.push(part);
      }
    });
    parts.push("");
    parts.push(`--${relatedBoundary}--`);
    return parts;
  }

  if (hasAttachments) {
    if (hasInline && hasHtml) {
      // Outer multipart/mixed: related part (HTML + inline) + file attachments
      headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      headers.push("");
      headers.push(`--${mixedBoundary}`);
      const relatedParts = buildRelatedPart();
      for (const part of relatedParts) {
        headers.push(part);
      }
      for (const att of fileAttachments) {
        headers.push("");
        headers.push(`--${mixedBoundary}`);
        const fileParts = buildFileAttachmentPart(att);
        for (const part of fileParts) {
          headers.push(part);
        }
      }
      headers.push("");
      headers.push(`--${mixedBoundary}--`);
    } else {
      // No inline attachments or no HTML body: use simple multipart/mixed
      headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      headers.push("");
      headers.push(`--${mixedBoundary}`);
      const bodyParts = buildBodyPart();
      for (const part of bodyParts) {
        headers.push(part);
      }
      for (const att of attachments!) {
        headers.push("");
        headers.push(`--${mixedBoundary}`);
        const fileParts = buildFileAttachmentPart(att);
        for (const part of fileParts) {
          headers.push(part);
        }
      }
      headers.push("");
      headers.push(`--${mixedBoundary}--`);
    }
  } else {
    const bodyParts = buildBodyPart();
    for (const part of bodyParts) {
      headers.push(part);
    }
  }

  return headers.join("\r\n");
}

function wrapBase64(data: string): string {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += 76) {
    lines.push(data.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

async function ensureValidAccessToken(
  orgId: string,
  tokenRef: string,
  credential: MailboxCredentialPayload,
): Promise<string | MailboxProviderError> {
  if (credential.expiresAtMs && Date.now() < credential.expiresAtMs - 60000) {
    return credential.accessToken;
  }
  const { clientId, clientSecret } = getGmailConfig();
  if (!credential.refreshToken) {
    return { category: "auth_expired", safeMessage: "No refresh token available", retryable: false };
  }
  const tokens = await refreshAccessToken(credential.refreshToken, clientId, clientSecret);
  if (isProviderError(tokens)) return tokens;
  const expiresAtMs = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
  const newPayload: MailboxCredentialPayload = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? credential.refreshToken,
    expiresAtMs,
    tokenType: tokens.token_type,
    scope: tokens.scope,
  };
  await rotateMailboxCredential(orgId, tokenRef, newPayload);
  return tokens.access_token;
}

// ─── OAuth URL builder ────────────────────────────────────────────────────────

/**
 * Build the Gmail OAuth authorization URL.
 * Called by the connect route handler to redirect the admin to Google.
 *
 * access_type=offline: required to receive a refresh token.
 * prompt=consent: forces the consent screen so a refresh token is always
 *   returned, even if the user has previously authorized the app.
 *   Without this, Google may not return a refresh token on re-authorization.
 */
export function buildGmailAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGmailConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
