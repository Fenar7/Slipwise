import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Realtime session token contract.
 *
 * Tokens are short-lived, org-scoped, user-bound, and signed with HMAC-SHA256.
 * The format is consistent with existing Slipwise webhook signature patterns:
 *   base64url(header).base64url(payload).base64url(signature)
 *
 * Tokens must never contain sensitive content (passwords, long-lived secrets,
 * message bodies). The payload carries identity and scoping claims only.
 */

export const REALTIME_TOKEN_ALGORITHM = "HS256" as const;
export const REALTIME_TOKEN_VERSION = "rt.v1" as const;

/** Default token lifetime: 5 minutes. */
export const DEFAULT_REALTIME_TOKEN_TTL_SECONDS = 300;

/** Maximum token lifetime allowed: 10 minutes. */
export const MAX_REALTIME_TOKEN_TTL_SECONDS = 600;

export interface RealtimeSessionClaims {
  /** Token version for forward compatibility. */
  v: typeof REALTIME_TOKEN_VERSION;
  /** Slipwise user id (auth subject). */
  sub: string;
  /** Organization id. */
  org: string;
  /** Effective role in the org. */
  role: string;
  /** Who this user represents, if proxying. */
  rep: string | null;
  /** Proxy grant id, if applicable. */
  pg: string | null;
  /** Proxy scope array. */
  ps: string[];
  /** Session id (nonce) for traceability and revocation. */
  sid: string;
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiration timestamp (seconds since epoch). */
  exp: number;
}

export interface MintTokenInput {
  userId: string;
  orgId: string;
  role: string;
  representedId: string | null;
  proxyGrantId: string | null;
  proxyScope: string[];
  sessionId: string;
  /** Seconds until expiry. Defaults to DEFAULT_REALTIME_TOKEN_TTL_SECONDS. */
  ttlSeconds?: number;
}

export interface MintTokenResult {
  token: string;
  sessionId: string;
  expiresAt: number;
  issuedAt: number;
}

export interface VerifyTokenResult {
  valid: boolean;
  claims?: RealtimeSessionClaims;
  error?: TokenVerificationError;
}

export type TokenVerificationError =
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "future_token"
  | "wrong_version"
  | "missing_claims";

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url")
    .toString("utf8");
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

export function mintRealtimeSessionToken(
  input: MintTokenInput,
  secret: string,
): MintTokenResult {
  const ttl = Math.min(
    input.ttlSeconds ?? DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
    MAX_REALTIME_TOKEN_TTL_SECONDS,
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ttl;

  const claims: RealtimeSessionClaims = {
    v: REALTIME_TOKEN_VERSION,
    sub: input.userId,
    org: input.orgId,
    role: input.role,
    rep: input.representedId ?? null,
    pg: input.proxyGrantId ?? null,
    ps: input.proxyScope ?? [],
    sid: input.sessionId,
    iat: nowSeconds,
    exp,
  };

  const header = JSON.stringify({ alg: REALTIME_TOKEN_ALGORITHM, typ: "RT" });
  const payload = JSON.stringify(claims);

  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return {
    token: `${signingInput}.${signature}`,
    sessionId: input.sessionId,
    expiresAt: exp,
    issuedAt: nowSeconds,
  };
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export function verifyRealtimeSessionToken(
  token: string,
  secret: string,
  options?: {
    /** Accept tokens issued up to this many seconds in the future (clock skew). */
    clockSkewSeconds?: number;
  },
): VerifyTokenResult {
  const clockSkew = options?.clockSkewSeconds ?? 30;

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "malformed" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let headerJson: string;
  let payloadJson: string;
  try {
    headerJson = base64urlDecode(encodedHeader);
    payloadJson = base64urlDecode(encodedPayload);
  } catch {
    return { valid: false, error: "malformed" };
  }

  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(headerJson);
    claims = JSON.parse(payloadJson);
  } catch {
    return { valid: false, error: "malformed" };
  }

  // Header validation
  if (
    typeof header !== "object" ||
    header === null ||
    (header as Record<string, unknown>).alg !== REALTIME_TOKEN_ALGORITHM
  ) {
    return { valid: false, error: "malformed" };
  }

  // Signature validation
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signingInput)
    .digest();

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return { valid: false, error: "malformed" };
  }

  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return { valid: false, error: "invalid_signature" };
  }

  // Claims validation
  const c = claims as Record<string, unknown>;
  if (c.v !== REALTIME_TOKEN_VERSION) {
    return { valid: false, error: "wrong_version" };
  }

  const required = ["sub", "org", "role", "sid", "iat", "exp"];
  for (const key of required) {
    if (typeof c[key] === "undefined") {
      return { valid: false, error: "missing_claims" };
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const iat = Number(c.iat);
  const exp = Number(c.exp);

  if (Number.isNaN(iat) || Number.isNaN(exp)) {
    return { valid: false, error: "missing_claims" };
  }

  if (nowSeconds > exp + clockSkew) {
    return { valid: false, error: "expired" };
  }

  if (nowSeconds < iat - clockSkew) {
    return { valid: false, error: "future_token" };
  }

  const typedClaims: RealtimeSessionClaims = {
    v: REALTIME_TOKEN_VERSION,
    sub: String(c.sub),
    org: String(c.org),
    role: String(c.role),
    rep: c.rep == null ? null : String(c.rep),
    pg: c.pg == null ? null : String(c.pg),
    ps: Array.isArray(c.ps) ? c.ps.filter((s): s is string => typeof s === "string") : [],
    sid: String(c.sid),
    iat,
    exp,
  };

  return { valid: true, claims: typedClaims };
}

// ---------------------------------------------------------------------------
// Safe trace helpers (for logs — never log the full token)
// ---------------------------------------------------------------------------

export function tokenFingerprint(token: string): string {
  if (token.length < 12) return "[short]";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
