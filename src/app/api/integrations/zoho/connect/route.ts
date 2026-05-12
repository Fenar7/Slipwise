import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/integrations/zoho";
import {
  createIntegrationOAuthState,
  getIntegrationOAuthStateCookieName,
  getIntegrationOAuthStateCookieOptions,
} from "@/lib/integrations/oauth-state";
import { requireIntegrationAdminRoute } from "../../_auth";
import { responseCookiesToRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export async function GET() {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) {
      return auth.response;
    }

    const { state, cookieValue } = createIntegrationOAuthState(
      "zoho",
      auth.ctx.orgId,
      auth.ctx.userId,
    );
    const response = NextResponse.redirect(getAuthUrl(state));
    response.cookies.set(
      getIntegrationOAuthStateCookieName("zoho"),
      cookieValue,
      getIntegrationOAuthStateCookieOptions("zoho"),
    );
    return response;
  } catch (error) {
    console.error("Zoho connect failed:", error);
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 }
    );

  }
}
