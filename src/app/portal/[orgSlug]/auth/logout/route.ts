import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, revokeCurrentPortalSession } from "@/lib/portal-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  // Retrieve current session and perform server-side revocation in DB for the current session only
  const session = await getPortalSession(orgSlug);
  if (session) {
    await revokeCurrentPortalSession(session.jti, session.customerId, session.orgId);
  }

  // Determine redirection based on the explicit origin query parameter
  const origin = _request.nextUrl.searchParams.get("origin") || "";
  const loginUrl = origin === "client-hub"
    ? `/portal/${orgSlug}/client-hub/login`
    : `/portal/${orgSlug}/auth/login`;

  const response = NextResponse.redirect(new URL(loginUrl, _request.url));

  // Clear the portal session cookie
  response.cookies.set("portal_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
