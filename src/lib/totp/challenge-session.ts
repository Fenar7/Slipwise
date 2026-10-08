/**
 * MFA challenge session cookie helpers.
 *
 * Edge-compatible: verify with the Web Crypto API (crypto.subtle) which is
 * available in the Next.js Edge Runtime.
 *
 * Originally TOTP-specific, now generalized for any MFA factor (TOTP, passkey,
 * recovery code). The cookie name stays stable to avoid migration friction.
 */

export const MFA_CHALLENGE_COOKIE = "sw_2fa";
/** How long a verified MFA session stays valid (12 hours). */
export const MFA_SESSION_DURATION_SECONDS = 12 * 60 * 60;

// Legacy aliases for backward compatibility during transition
export const TOTP_CHALLENGE_COOKIE = MFA_CHALLENGE_COOKIE;
export const TOTP_SESSION_DURATION_SECONDS = MFA_SESSION_DURATION_SECONDS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function base64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getSecret(): string | null {
  return process.env.TOTP_SESSION_SECRET ?? process.env.PORTAL_JWT_SECRET ?? null;
}

// ─── Edge-compatible: sign via crypto.subtle ─────────────────────────────────

/**
 * Create a signed challenge cookie value tied to a specific user.
 * Call this after successfully verifying any MFA factor (TOTP, passkey, recovery).
 */
export async function signChallengeToken(userId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error("TOTP_SESSION_SECRET is not configured. Add it to your environment variables.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(
    JSON.stringify({ sub: userId, iat: now, exp: now + MFA_SESSION_DURATION_SECONDS })
  );

  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${header}.${body}`)
  );
  return `${header}.${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

// ─── Edge-compatible: verify via crypto.subtle ───────────────────────────────

/**
 * Verify the challenge cookie in the Edge Runtime (Next.js middleware).
 * Returns the userId on success, null on any failure.
 */
export async function verifyChallengeToken(
  token: string,
  secret: string
): Promise<string | null> {
  if (!secret) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;

    // Import the signing key using the Web Crypto API
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // base64url → Uint8Array
    const sigBytes = base64urlDecode(sig);

    const isValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(`${header}.${body}`)
    );
    if (!isValid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(body))
    ) as { sub?: string; exp?: number };

    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || payload.exp <= now) return null;

    return payload.sub;
  } catch {
    return null;
  }
}
