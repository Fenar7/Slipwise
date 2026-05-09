import { NextResponse } from "next/server";
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
 */
export async function GET() {
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

    const { state, cookieValue } = createIntegrationOAuthState(
      "gmail",
      auth.ctx.orgId,
      auth.ctx.userId,
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
    console.error("[mailbox/gmail/connect] Failed to initiate Gmail connect:", error);
    return NextResponse.json(
      { error: "Failed to initiate Gmail connection" },
      { status: 500 },
    );
  }
}
