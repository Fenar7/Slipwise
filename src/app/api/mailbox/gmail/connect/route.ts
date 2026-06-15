import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import {
  createIntegrationOAuthState,
  getIntegrationOAuthStateCookieName,
  getIntegrationOAuthStateCookieOptions,
} from "@/lib/integrations/oauth-state";
import { initiateGmailConnect } from "@/lib/mailbox/gmail-oauth-service";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/mailbox/gmail/connect
 *
 * Initiates the Gmail OAuth flow for a mailbox connection.
 * Admin-only. Rate-limited per org.
 *
 * Flow:
 *   1. Verify the caller is an org admin.
 *   2. Apply org-scoped rate limit (5 attempts / 60 s).
 *   3. Generate a CSRF-protected OAuth state token and set it as an httpOnly cookie.
 *   4. Redirect the admin to the Gmail OAuth consent screen.
 *
 * Error handling:
 *   On any server-side failure (including missing env vars), redirects back to
 *   /app/mailbox/settings?error=<code> so the user sees the error banner rather
 *   than a blank browser error page (which happens when a GET navigation returns 500).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxConnect);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many connection attempts. Please wait before trying again." },
        { status: 429 },
      );
    }

    const connectionId = request.nextUrl.searchParams.get("connectionId") ?? undefined;

    const { state, cookieValue } = createIntegrationOAuthState(
      "gmail",
      auth.ctx.orgId,
      auth.ctx.userId,
      Date.now(),
      connectionId,
    );

    const authUrl = initiateGmailConnect(state);
    const response = NextResponse.redirect(authUrl);
    response.cookies.set(
      getIntegrationOAuthStateCookieName("gmail"),
      cookieValue,
      getIntegrationOAuthStateCookieOptions("gmail", "/api/mailbox"),
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotConfigured = message.includes("not configured") || message.includes("GMAIL_CLIENT_ID");
    const errorCode = isNotConfigured ? "gmail_not_configured" : "gmail_connect_failed";

    console.error("[mailbox/gmail/connect] Failed to initiate Gmail connect:", error);

    // Redirect back to settings with a safe error code rather than returning a raw
    // 500 JSON response — the browser renders a blank error page for GET navigations.
    const settingsUrl = new URL("/app/mailbox/settings", request.url);
    settingsUrl.searchParams.set("error", errorCode);
    return NextResponse.redirect(settingsUrl);
  }
}
