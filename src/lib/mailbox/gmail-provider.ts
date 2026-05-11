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
} from "./provider-contracts";
import { storeMailboxCredential, readMailboxCredential, rotateMailboxCredential, revokeMailboxCredential } from "./credential-store";
import type { MailboxCredentialPayload } from "./credential-store";

// ─── Config ───────────────────────────────────────────────────────────────────

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

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
   * Perform an incremental sync delta.
   * Sprint 2.2 scope: stub that returns empty results.
   * Phase 3 (Sprint 3.1/3.2) implements real Gmail history/list sync.
   *
   * The method signature and return shape are real and contract-compliant so
   * Phase 3 can implement against this without redesign.
   */
  async syncDelta({ orgId, tokenRef, cursor: _cursor }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }
    // Phase 3 implements real delta sync. Sprint 2.2 returns empty to satisfy
    // the contract without implementing sync logic.
    return { threads: [] as MailboxThreadEnvelope[], nextCursor: null };
  },

  /**
   * Fetch full thread detail.
   * Sprint 2.2 scope: stub that returns empty messages.
   * Phase 3 implements real message body fetching.
   */
  async fetchThreadDetail({ orgId, tokenRef, providerThreadId: _providerThreadId }) {
    const credential = await readMailboxCredential(orgId, tokenRef);
    if (!credential) {
      return { category: "auth_expired", safeMessage: "Credential not found for tokenRef", retryable: false };
    }
    return { messages: [] as (MailboxMessageEnvelope & { htmlBody: string; textBody: string | null })[] };
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
