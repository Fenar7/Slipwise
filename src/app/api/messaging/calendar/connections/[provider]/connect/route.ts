import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMessagingApiContext } from "../../../../_utils";
import { getCalendarProviderAdapter } from "@/lib/messaging/calendar-providers";
import {
  createCalendarOAuthState,
  getCalendarOAuthStateCookieName,
  getCalendarOAuthStateCookieOptions,
} from "@/lib/messaging/oauth-state";
import { CalendarProvider } from "@/lib/messaging/domain-types";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { provider: rawProvider } = await params;
    const providerKey = rawProvider.toUpperCase();

    if (providerKey !== "GOOGLE" && providerKey !== "OUTLOOK") {
      return NextResponse.json(
        { success: false, error: "Invalid calendar provider" },
        { status: 400 },
      );
    }

    const provider = providerKey as CalendarProvider;

    // Verify Admin / Owner role
    const member = await db.member.findFirst({
      where: { organizationId: orgId, userId },
      select: { role: true },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Access denied: organization membership required" },
        { status: 403 },
      );
    }

    const orgRole = member.role?.toLowerCase() ?? "";
    const isAdmin = orgRole === "owner" || orgRole === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Access denied: admin or owner role required" },
        { status: 403 },
      );
    }

    // Generate secure state
    const { state, cookieValue } = createCalendarOAuthState(provider, orgId, userId);

    // Compute redirect URI (matches standard callback route)
    const baseUrl = new URL(request.url).origin;
    const redirectUri = `${baseUrl}/api/messaging/calendar/connections/${rawProvider.toLowerCase()}/callback`;

    const adapter = getCalendarProviderAdapter(provider);
    const authUrl = adapter.getAuthUrl(state, redirectUri);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(
      getCalendarOAuthStateCookieName(provider),
      cookieValue,
      getCalendarOAuthStateCookieOptions(provider),
    );

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initiate OAuth flow";
    console.error("[api/messaging/calendar/connect] OAuth initiation failed:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
