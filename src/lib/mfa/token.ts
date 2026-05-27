/**
 * MFA verification token helpers.
 *
 * These tokens are short-lived (5 minutes) signed JWTs used to pass MFA state
 * from the /api/auth/mfa/verify route handler to middleware via URL query
 * parameters. This bypasses the unreliable Set-Cookie mechanism in Next.js 16
 * dev mode when cookies are set inside a fetch() response.
 *
 * Server-side (Node.js): sign with crypto.createHmac (HS256).
 * Edge/middleware: verify with the Web Crypto API (crypto.subtle).
 */

import crypto from "crypto";

export const MFA_TOKEN_DURATION_SECONDS = 5 * 60; // 5 minutes
export const MFA_TOKEN_QUERY_PARAM = "mfaToken";

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getWebCrypto() {
  if (globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  return crypto.webcrypto;
}

function getSecret(): string {
  const s = process.env.TOTP_SESSION_SECRET ?? process.env.PORTAL_JWT_SECRET ?? "";
  if (!s) {
    throw new Error(
      "TOTP_SESSION_SECRET is not configured. Add it to your environment variables."
    );
  }
  return s;
}

/**
 * Create a short-lived MFA verification token tied to a specific user.
 * Call this after successfully verifying any MFA factor (TOTP, passkey, recovery).
 */
export function signMfaToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + MFA_TOKEN_DURATION_SECONDS,
      typ: "mfa",
    })
  );
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

/**
 * Edge-compatible cookie signing for MFA challenge cookie.
 * Uses the Web Crypto API so it works in Next.js Edge Runtime.
 */
export async function signMfaCookieEdge(
  userId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + 12 * 60 * 60, // 12 hours (same as challenge session)
    })
  );

  const enc = new TextEncoder();
  const webCrypto = getWebCrypto();
  const key = await webCrypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await webCrypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${header}.${body}`)
  );

  const sigBase64 = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${header}.${body}.${sigBase64}`;
}

/**
 * Verify the MFA token in the Edge Runtime (Next.js middleware).
 * Returns the userId on success, null on any failure.
 */
export async function verifyMfaToken(
  token: string,
  secret: string
): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;

    const enc = new TextEncoder();
    const webCrypto = getWebCrypto();
    const key = await webCrypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = decodeBase64Url(sig);

    const isValid = await webCrypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(`${header}.${body}`)
    );
    if (!isValid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(body))
    ) as { sub?: string; exp?: number; typ?: string };

    const now = Math.floor(Date.now() / 1000);
    if (
      !payload.sub ||
      !payload.exp ||
      payload.exp <= now ||
      payload.typ !== "mfa"
    ) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

export function sanitizeMfaCallbackUrl(raw: string, fallback = "/app"): string {
  try {
    if (!raw.startsWith("/") || raw.startsWith("//")) {
      return fallback;
    }

    const url = new URL(raw, "http://localhost");
    url.searchParams.delete(MFA_TOKEN_QUERY_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    return next || fallback;
  } catch {
    return fallback;
  }
}
