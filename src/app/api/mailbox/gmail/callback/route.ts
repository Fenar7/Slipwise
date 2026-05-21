import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  readIntegrationOAuthState,
  getIntegrationOAuthStateCookieName,
  getClearedIntegrationOAuthStateCookieOptions,
} from "@/lib/integrations/oauth-state";
import { handleGmailCallback } from "@/lib/mailbox/gmail-oauth-service";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";

const REDIRECT_BASE = "/app/mailbox/settings";

function redirectWithError(request: NextRequest, error: string): NextResponse {
  const response = NextResponse.redirect(
    new URL(`${REDIRECT_BASE}?error=${error}`, request.url),
  );
  clearStateCookie(response);
  return response;
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(
    getIntegrationOAuthStateCookieName("gmail"),
    "",
    getClearedIntegrationOAuthStateCookieOptions("gmail", "/api/mailbox"),
  );
}

/**
 * GET /api/mailbox/gmail/callback
 *
 * Handles the Gmail OAuth callback after the admin grants consent.
 *
 * Security checks (in order):
 *   1. Validate required query params (code, state).
 *   2. Verify the caller is authenticated (Supabase session).
 *   3. Validate the state cookie: provider match, expiry, CSRF token match,
 *      userId match. Any mismatch → reject.
 *   4. Verify org membership for the orgId in the state cookie.
 *   5. Apply org-scoped rate limit.
 *   6. Delegate to handleGmailCallback (code exchange + connection persistence).
 *   7. Clear the state cookie on success or failure.
 *
 * On success: redirect to mailbox settings with ?connected=gmail.
 * On failure: redirect to mailbox settings with ?error=<safe_code>.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return redirectWithError(request, "gmail_missing_params");
    }

    // Verify Supabase session.
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return redirectWithError(request, "gmail_auth_required");
    }

    // Validate state cookie (CSRF + expiry + provider match).
    const stateResult = readIntegrationOAuthState(
      "gmail",
      request.cookies.get(getIntegrationOAuthStateCookieName("gmail"))?.value,
    );
    if (!stateResult.ok) {
      return redirectWithError(
        request,
        stateResult.error === "expired" ? "gmail_state_expired" : "gmail_invalid_state",
      );
    }

    // Verify state token and userId match.
    if (stateResult.data.state !== state || stateResult.data.userId !== user.id) {
      return redirectWithError(request, "gmail_invalid_state");
    }

    // Verify org membership (prevents state-cookie forgery from a different org).
    const member = await db.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: stateResult.data.orgId,
          userId: user.id,
        },
      },
      select: { organizationId: true },
    });
    if (!member) {
      return redirectWithError(request, "gmail_invalid_state");
    }

    // Rate-limit callback processing per org.
    const rl = await rateLimitByOrg(stateResult.data.orgId, RATE_LIMITS.mailboxConnect);
    if (!rl.success) {
      return redirectWithError(request, "gmail_rate_limited");
    }

    // Exchange code and persist connection.
    const result = await handleGmailCallback({
      orgId: stateResult.data.orgId,
      actorId: user.id,
      authorizationCode: code,
      redirectUri: process.env.GMAIL_REDIRECT_URI ?? "",
    });

    if (!result.ok) {
      return redirectWithError(request, `gmail_${result.error}`);
    }

    const successParam = result.isReconnect ? "gmail_reconnected" : "gmail";
    const response = NextResponse.redirect(
      new URL(`${REDIRECT_BASE}?connected=${successParam}`, request.url),
    );
    clearStateCookie(response);
    return response;
  } catch (error) {
    console.error("[mailbox/gmail/callback] Unexpected error:", error);
    return redirectWithError(request, "gmail_failed");
  }
}
