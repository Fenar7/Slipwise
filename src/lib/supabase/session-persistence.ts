export const SESSION_PERSISTENCE_COOKIE = "slipwise-session-persistence";
export const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 3;

export type SessionPersistenceMode = "remembered" | "session";

export type CookieRecord = {
  name: string;
  value: string;
};

export type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none" | boolean;
  secure?: boolean;
};

type SetCookieRecord = CookieRecord & {
  options?: CookieOptions;
};

const TERMINAL_AUTH_ERROR_PATTERNS = [
  "session not found",
  "session_not_found",
  "user not found",
  "user_not_found",
  "jwt malformed",
  "bad jwt",
  "invalid jwt",
  "auth session missing",
];

export function resolveSessionPersistenceMode(
  value: string | null | undefined,
  fallback: SessionPersistenceMode = "session",
): SessionPersistenceMode {
  return value === "remembered" || value === "session" ? value : fallback;
}

export function getSessionPersistenceCookieOptions(
  maxAge: number = REMEMBER_ME_MAX_AGE,
): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function getSessionPersistenceCookie(
  mode: SessionPersistenceMode,
): SetCookieRecord {
  if (mode === "remembered") {
    return {
      name: SESSION_PERSISTENCE_COOKIE,
      value: mode,
      options: getSessionPersistenceCookieOptions(),
    };
  }

  return {
    name: SESSION_PERSISTENCE_COOKIE,
    value: mode,
    options: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export function getClearedSessionPersistenceCookie(): SetCookieRecord {
  return {
    name: SESSION_PERSISTENCE_COOKIE,
    value: "",
    options: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    },
  };
}

export function getSessionPersistenceModeFromCookies(
  cookies: CookieRecord[],
  fallback: SessionPersistenceMode = "session",
): SessionPersistenceMode {
  const value = cookies.find(
    (cookie) => cookie.name === SESSION_PERSISTENCE_COOKIE,
  )?.value;

  return resolveSessionPersistenceMode(value, fallback);
}

export function applySessionPersistenceToCookieOptions(
  mode: SessionPersistenceMode,
  options?: CookieOptions,
): CookieOptions | undefined {
  if (!options) {
    return mode === "remembered"
      ? getSessionPersistenceCookieOptions()
      : undefined;
  }

  if (mode === "remembered") {
    return {
      ...options,
      ...getSessionPersistenceCookieOptions(),
    };
  }

  const sessionOptions = { ...options };
  delete sessionOptions.expires;
  delete sessionOptions.maxAge;
  return sessionOptions;
}

export function isSupabaseAuthCookie(name: string): boolean {
  return /^(?:__Host-)?sb-/.test(name);
}

export function getRememberedSupabaseCookieRefreshes(
  cookies: CookieRecord[],
): SetCookieRecord[] {
  return cookies
    .filter((cookie) => isSupabaseAuthCookie(cookie.name) && cookie.value)
    .map((cookie) => ({
      ...cookie,
      options: getSessionPersistenceCookieOptions(),
    }));
}

export function isTerminalSupabaseAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    message?: string;
    name?: string;
    status?: number;
  };

  if (typeof maybeError.status === "number" && maybeError.status >= 500) {
    return false;
  }

  const summary = `${maybeError.name ?? ""} ${maybeError.code ?? ""} ${
    maybeError.message ?? ""
  }`
    .trim()
    .toLowerCase();

  return TERMINAL_AUTH_ERROR_PATTERNS.some((pattern) =>
    summary.includes(pattern),
  );
}
