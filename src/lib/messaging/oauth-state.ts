import "server-only";
import crypto from "node:crypto";
import { CalendarProvider } from "./domain-types";

interface CalendarOAuthStatePayload {
  provider: CalendarProvider;
  orgId: string;
  userId: string;
  state: string;
  expiresAt: number;
}

export type CalendarOAuthStateResult =
  | { ok: true; data: CalendarOAuthStatePayload }
  | { ok: false; error: "missing" | "invalid" | "expired" | "provider_mismatch" };

export const CALENDAR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getCalendarOAuthStateCookieName(provider: CalendarProvider): string {
  return `slipwise_calendar_oauth_${provider.toLowerCase()}`;
}

export function getCalendarOAuthStateCookieOptions(provider: CalendarProvider) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/api/messaging/calendar/connections/${provider.toLowerCase()}/callback`,
    maxAge: Math.ceil(CALENDAR_OAUTH_STATE_TTL_MS / 1000),
  };
}

export function getClearedCalendarOAuthStateCookieOptions(provider: CalendarProvider) {
  return {
    ...getCalendarOAuthStateCookieOptions(provider),
    maxAge: 0,
  };
}

export function createCalendarOAuthState(
  provider: CalendarProvider,
  orgId: string,
  userId: string,
  now = Date.now(),
) {
  const payload: CalendarOAuthStatePayload = {
    provider,
    orgId,
    userId,
    state: crypto.randomBytes(24).toString("hex"),
    expiresAt: now + CALENDAR_OAUTH_STATE_TTL_MS,
  };

  return {
    state: payload.state,
    cookieValue: Buffer.from(JSON.stringify(payload)).toString("base64url"),
  };
}

export function readCalendarOAuthState(
  provider: CalendarProvider,
  cookieValue: string | undefined,
  now = Date.now(),
): CalendarOAuthStateResult {
  if (!cookieValue) {
    return { ok: false, error: "missing" };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8"),
    ) as Partial<CalendarOAuthStatePayload>;

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
      data: parsed as CalendarOAuthStatePayload,
    };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
