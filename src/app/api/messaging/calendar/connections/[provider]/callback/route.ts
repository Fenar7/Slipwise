import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getCalendarProviderAdapter } from "@/lib/messaging/calendar-providers";
import {
  readCalendarOAuthState,
  getClearedCalendarOAuthStateCookieOptions,
  getCalendarOAuthStateCookieName,
} from "@/lib/messaging/oauth-state";
import { connectCalendar } from "@/lib/messaging/calendar-connection-service";
import { encryptIntegrationSecret } from "@/lib/integrations/secrets";
import { CalendarProvider } from "@/lib/messaging/domain-types";

export const runtime = "nodejs";

function redirectWithError(request: NextRequest, error: string) {
  // Redirect back to main messaging page with a descriptive error
  const response = NextResponse.redirect(
    new URL(`/app/messaging?error=${encodeURIComponent(error)}`, request.url),
  );
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  const providerKey = rawProvider.toUpperCase();

  if (providerKey !== "GOOGLE" && providerKey !== "OUTLOOK") {
    return redirectWithError(request, "invalid_provider");
  }

  const provider = providerKey as CalendarProvider;
  const cookieName = getCalendarOAuthStateCookieName(provider);

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const providerError = searchParams.get("error") || searchParams.get("error_description");

    // 1. Handle provider-side errors
    if (providerError) {
      console.warn(`[api/messaging/calendar/callback] Provider error:`, providerError);
      return redirectWithError(request, `provider_error: ${providerError}`);
    }

    if (!code || !state) {
      return redirectWithError(request, "missing_callback_params");
    }

    // 2. Validate current logged-in user session
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return redirectWithError(request, "auth_required");
    }

    // 3. Read and validate secure cookie state
    const cookieState = request.cookies.get(cookieName)?.value;
    const stateResult = readCalendarOAuthState(provider, cookieState);

    if (!stateResult.ok) {
      console.warn(`[api/messaging/calendar/callback] State validation failed:`, stateResult.error);
      const response = redirectWithError(request, `state_${stateResult.error}`);
      response.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
      return response;
    }

    const { orgId, userId: stateUserId, state: expectedState } = stateResult.data;

    // Validate anti-forgery state and user session binding
    if (expectedState !== state || stateUserId !== user.id) {
      console.warn(`[api/messaging/calendar/callback] State/User mismatch.`);
      const response = redirectWithError(request, "invalid_state");
      response.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
      return response;
    }

    // 4. Validate Org Membership & Admin / Owner Role
    const member = await db.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      select: { role: true },
    });

    if (!member) {
      console.warn(`[api/messaging/calendar/callback] Org membership not found.`);
      const response = redirectWithError(request, "unauthorized_org");
      response.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
      return response;
    }

    const orgRole = member.role?.toLowerCase() ?? "";
    const isAdmin = orgRole === "owner" || orgRole === "admin";
    if (!isAdmin) {
      console.warn(`[api/messaging/calendar/callback] Caller is not an org admin.`);
      const response = redirectWithError(request, "admin_role_required");
      response.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
      return response;
    }

    // 5. Exchange code for credentials using provider-safe adapter
    const baseUrl = new URL(request.url).origin;
    const redirectUri = `${baseUrl}/api/messaging/calendar/connections/${rawProvider.toLowerCase()}/callback`;
    const adapter = getCalendarProviderAdapter(provider);
    
    const tokens = await adapter.exchangeCode(code, redirectUri);

    // 6. Secure Token Persistence (Opaque token store reference pattern)
    // Encrypt raw tokens before persisting to DB
    const encryptedTokenRef = JSON.stringify({
      accessToken: encryptIntegrationSecret(tokens.accessToken),
      refreshToken: encryptIntegrationSecret(tokens.refreshToken),
    });

    const tokenExpiry = tokens.expiresInSeconds
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : null;

    // 7. Save Connection via Service layer
    await connectCalendar({
      orgId,
      provider,
      providerAccountId: tokens.providerAccountId,
      emailAddress: tokens.emailAddress,
      displayName: tokens.displayName ?? null,
      tokenRef: encryptedTokenRef,
      tokenExpiry,
      connectedBy: user.id,
    });

    // 8. Redirect back to messaging workspace with success
    const successResponse = NextResponse.redirect(
      new URL(`/app/messaging?connected=${rawProvider.toLowerCase()}`, request.url),
    );
    successResponse.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
    return successResponse;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "callback_failed";
    console.error(`[api/messaging/calendar/callback] Exception:`, error);
    const errResponse = redirectWithError(request, message);
    errResponse.cookies.set(cookieName, "", getClearedCalendarOAuthStateCookieOptions(provider));
    return errResponse;
  }
}
