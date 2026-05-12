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

/**
 * Least-privilege scopes for Sprint 2.2 (auth lifecycle only).
 * Sprint 2.3+ will extend this list when send/reply is implemented.
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
  if (status === 404 && (errorCode === "historyNotFound" || errorCode === "notFound")) {
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
): Promise<{ emailAddress: string; messagesTotal: number } | MailboxProviderError> {
  const res = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorCode = await parseGoogleErrorCode(res);
    return mapGoogleError(res.status, errorCode);
  }

  return res.json() as Promise<{ emailAddress: string; messagesTotal: number }>;
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
  async syncDelta({ orgId, tokenRef, cursor }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }

    const accessToken = await ensureValidAccessToken(orgId, tokenRef, credential);
    if (isProviderError(accessToken)) return accessToken;

    if (cursor) {
      // ─── Delta path: use Gmail history.list ───────────────────────────────
      const threadIds = new Set<string>();
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
        const historyRes = await fetch(`${GMAIL_HISTORY_URL}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
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
        }
        nextPageToken = historyData.nextPageToken;
      } while (nextPageToken);

      const threads: MailboxThreadEnvelope[] = [];
      for (const threadId of threadIds) {
        const threadRes = await fetch(`${GMAIL_THREAD_URL}/${threadId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!threadRes.ok) continue;
        const threadData = await threadRes.json() as GmailThreadResponse;
        const envelope = toThreadEnvelope(threadData);
        if (envelope) threads.push(envelope);
      }

      const nextCursor: MailboxSyncCursor = {
        value: lastHistoryId,
        expiresAt: null,
      };

      return { threads, nextCursor };
    }

    // ─── Initial path: use threads.list ─────────────────────────────────────
    const threads: MailboxThreadEnvelope[] = [];
    let nextPageToken: string | undefined;
    let highestHistoryId = "0";

    do {
      const params = new URLSearchParams({
        maxResults: "50",
        includeSpamTrash: "false",
      });
      if (nextPageToken) {
        params.set("pageToken", nextPageToken);
      }
      const res = await fetch(`${GMAIL_THREADS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const errorCode = await parseGoogleErrorCode(res);
        return mapGoogleError(res.status, errorCode);
      }

      const data = await res.json() as GmailThreadsListResponse;
      for (const threadRef of data.threads ?? []) {
        if (threadRef.historyId && BigInt(threadRef.historyId) > BigInt(highestHistoryId)) {
          highestHistoryId = threadRef.historyId;
        }
        const threadRes = await fetch(`${GMAIL_THREAD_URL}/${threadRef.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!threadRes.ok) continue;
        const threadData = await threadRes.json() as GmailThreadResponse;
        if (threadData.historyId && BigInt(threadData.historyId) > BigInt(highestHistoryId)) {
          highestHistoryId = threadData.historyId;
        }
        const envelope = toThreadEnvelope(threadData);
        if (envelope) threads.push(envelope);
      }
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    const nextCursor: MailboxSyncCursor = { value: highestHistoryId, expiresAt: null };

    return { threads, nextCursor };
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

    const res = await fetch(GMAIL_WATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topicName, labelIds: ["INBOX"] }),
    });

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

    const res = await fetch(`${GMAIL_THREAD_URL}/${providerThreadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errorCode = await parseGoogleErrorCode(res);
      return mapGoogleError(res.status, errorCode);
    }

    const data = await res.json() as GmailThreadResponse;
    const messages = (data.messages ?? []).map(toMessageEnvelope).filter(Boolean) as (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null })[];
    return { messages };
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
};

// ─── Gmail API types ──────────────────────────────────────────────────────────

interface GmailThreadsListResponse {
  threads?: GmailThreadRef[];
  nextPageToken?: string;
}

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
    lastMessageAt: lastMessage?.internalDate
      ? new Date(parseInt(lastMessage.internalDate, 10)).toISOString()
      : new Date().toISOString(),
    unreadCount,
    participants,
    providerMetadata: { gmailHistoryId: thread.historyId, messageCount: thread.messages?.length ?? 0 },
  };
}

function toMessageEnvelope(msg: GmailMessage): (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null }) | null {
  const headers = msg.payload?.headers ?? [];
  const from = parseAddressHeader(headers.find((h) => h.name === "From")?.value ?? "") ?? { email: "unknown@unknown.com", displayName: null };
  const to = parseAddressListHeader(headers.find((h) => h.name === "To")?.value ?? "");
  const cc = parseAddressListHeader(headers.find((h) => h.name === "Cc")?.value ?? "");
  const bcc = parseAddressListHeader(headers.find((h) => h.name === "Bcc")?.value ?? "");
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
  const messageId = headers.find((h) => h.name === "Message-ID")?.value ?? null;
  const date = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)) : new Date();
  const direction = isOutbound(msg.labelIds ?? []) ? "outbound" : "inbound";

  const { htmlBody, textBody } = extractBodies(msg.payload ?? null);
  const attachments = extractAttachments(msg.payload ?? null);

  return {
    providerMessageId: msg.id,
    rfcMessageId: messageId,
    direction,
    from,
    to,
    cc,
    bcc,
    subject,
    snippet: msg.snippet ?? "",
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
    if (mimeType === "text/html" && p.body?.data) {
      htmlParts.push(decodeBase64(p.body.data));
    } else if (mimeType === "text/plain" && p.body?.data) {
      textParts.push(decodeBase64(p.body.data));
    }
    if (p.parts) {
      for (const child of p.parts) walk(child);
    }
  }

  walk(part);

  return {
    htmlBody: htmlParts.join("\n") || "",
    textBody: textParts.join("\n") || null,
  };
}

function extractAttachments(part: GmailMessagePart | null): Array<{ providerAttachmentId: string; filename: string; mimeType: string; size: number; isInline: boolean }> {
  if (!part) return [];
  const attachments: Array<{ providerAttachmentId: string; filename: string; mimeType: string; size: number; isInline: boolean }> = [];

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
