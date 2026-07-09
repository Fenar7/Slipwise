import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  applySessionPersistenceToCookieOptions,
  getClearedSessionPersistenceCookie,
  getRememberedSupabaseCookieRefreshes,
  getSessionPersistenceCookie,
  getSessionPersistenceModeFromCookies,
  isSupabaseAuthCookie,
  isTerminalSupabaseAuthError,
} from "@/lib/supabase/session-persistence";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const requestCookies = request.cookies.getAll();
  const persistenceMode = getSessionPersistenceModeFromCookies(requestCookies);
  const hasSupabaseAuthCookies = requestCookies.some((cookie) =>
    isSupabaseAuthCookie(cookie.name),
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              value === ""
                ? options
                : applySessionPersistenceToCookieOptions(
                    persistenceMode,
                    options,
                  ),
            )
          );
        },
      },
    }
  );

  // Refresh session — IMPORTANT: do not remove
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Clear stale/invalid sessions (e.g. old Better Auth JWTs or deleted users).
  // Without this, the client loops on 403 user_not_found on every request.
  if (authError && !user) {
    if (!hasSupabaseAuthCookies && authError.message === "Auth session missing!") {
      return { user: null, supabaseResponse };
    }

    if (isTerminalSupabaseAuthError(authError) && hasSupabaseAuthCookies) {
      console.warn("[middleware] Clearing invalid session:", authError.message);
      await supabase.auth.signOut({ scope: "local" });
      const clearedCookie = getClearedSessionPersistenceCookie();
      request.cookies.set(clearedCookie.name, clearedCookie.value);
      supabaseResponse.cookies.set(
        clearedCookie.name,
        clearedCookie.value,
        clearedCookie.options,
      );
    } else {
      console.warn("[middleware] Transient auth refresh failure:", authError.message);
    }
  }

  if (user && persistenceMode === "remembered") {
    const persistenceCookie = getSessionPersistenceCookie("remembered");
    request.cookies.set(persistenceCookie.name, persistenceCookie.value);
    supabaseResponse.cookies.set(
      persistenceCookie.name,
      persistenceCookie.value,
      persistenceCookie.options,
    );
  }

  return { user: authError ? null : user, supabaseResponse };
}
