import crypto from "node:crypto";

export type IntegrationOAuthProvider = "quickbooks" | "zoho" | "gmail";

interface IntegrationOAuthStatePayload {
  provider: IntegrationOAuthProvider;
  orgId: string;
  userId: string;
  state: string;
  expiresAt: number;
}

export type IntegrationOAuthStateResult =
  | { ok: true; data: IntegrationOAuthStatePayload }
  | { ok: false; error: "missing" | "invalid" | "expired" | "provider_mismatch" };

export const INTEGRATION_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const INTEGRATION_OAUTH_STATE_TTL_SECONDS = Math.ceil(
  INTEGRATION_OAUTH_STATE_TTL_MS / 1000,
);

export function getIntegrationOAuthStateCookieName(
  provider: IntegrationOAuthProvider,
): string {
  return `slipwise_oauth_state_${provider}`;
}

export function getIntegrationOAuthStateCookieOptions(
  provider: IntegrationOAuthProvider,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/api/integrations/${provider}/callback`,
    maxAge: INTEGRATION_OAUTH_STATE_TTL_SECONDS,
  };
}

export function getClearedIntegrationOAuthStateCookieOptions(
  provider: IntegrationOAuthProvider,
) {
  return {
    ...getIntegrationOAuthStateCookieOptions(provider),
    maxAge: 0,
  };
}

export function createIntegrationOAuthState(
  provider: IntegrationOAuthProvider,
  orgId: string,
  userId: string,
  now = Date.now(),
) {
  const payload: IntegrationOAuthStatePayload = {
    provider,
    orgId,
    userId,
    state: crypto.randomBytes(24).toString("hex"),
    expiresAt: now + INTEGRATION_OAUTH_STATE_TTL_MS,
  };

  return {
    state: payload.state,
    cookieValue: Buffer.from(JSON.stringify(payload)).toString("base64url"),
  };
}

export function readIntegrationOAuthState(
  provider: IntegrationOAuthProvider,
  cookieValue: string | undefined,
  now = Date.now(),
): IntegrationOAuthStateResult {
  if (!cookieValue) {
    return { ok: false, error: "missing" };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8"),
    ) as Partial<IntegrationOAuthStatePayload>;

    if (
      typeof parsed.provider !== "string" ||
      typeof parsed.orgId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return { ok: false, error: "invalid" };
    }

    if (parsed.provider !== provider) {
      return { ok: false, error: "provider_mismatch" };
    }

    if (parsed.expiresAt <= now) {
      return { ok: false, error: "expired" };
    }

    return {
      ok: true,
      data: parsed as IntegrationOAuthStatePayload,
    };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
