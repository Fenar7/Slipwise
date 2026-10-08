import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getAndConsumeChallenge } from "@/lib/passkey/challenge-store";
import { getPasskeyByCredentialId, updatePasskeyCounter } from "@/lib/passkey/db";
import { getRpId, getOrigin } from "@/lib/passkey/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { signMfaToken, sanitizeMfaCallbackUrl } from "@/lib/mfa/token";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

const CALLBACK_URL_DEFAULT = "/app";

function sanitizeCallbackUrl(raw: string): string {
  return sanitizeMfaCallbackUrl(raw, CALLBACK_URL_DEFAULT);
}

/**
 * Complete primary passkey sign-in.
 *
 * 1. Looks up the challenge by signinSessionId
 * 2. Looks up the credential by response.id
 * 3. Verifies the WebAuthn response
 * 4. Creates a Supabase session via admin-generated magiclink + verifyOtp
 * 5. Returns callbackUrl + mfaToken so middleware can promote MFA state
 *    deterministically on the next navigation.
 */
export async function POST(request: NextRequest) {
  let body: {
    response: AuthenticationResponseJSON;
    signinSessionId: string;
    callbackUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { response, signinSessionId } = body;
  if (!response?.id || !signinSessionId) {
    return NextResponse.json(
      { success: false, error: "Missing response or signinSessionId" },
      { status: 400 }
    );
  }

  const callbackUrl = sanitizeCallbackUrl(body.callbackUrl ?? CALLBACK_URL_DEFAULT);

  try {
    // 1. Retrieve and consume the challenge
    const expectedChallenge = await getAndConsumeChallenge(signinSessionId, "authentication");
    if (!expectedChallenge) {
      return NextResponse.json(
        { success: false, error: "Challenge expired or invalid. Please try again." },
        { status: 400 }
      );
    }

    // 2. Look up the credential and user
    const credential = await getPasskeyByCredentialId(response.id);
    if (!credential) {
      return NextResponse.json(
        { success: false, error: "Unknown passkey credential" },
        { status: 400 }
      );
    }

    // 3. Verify the WebAuthn response
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpId(),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      // Best-effort audit
      try {
        const member = await db.member.findFirst({
          where: { userId: credential.userId },
          select: { organizationId: true },
        });
        if (member) {
          await logAudit({
            orgId: member.organizationId,
            actorId: credential.userId,
            action: "passkey.signin_failed",
            entityType: "PasskeyCredential",
            entityId: credential.id,
            metadata: { reason: "verification_failed" },
          });
        }
      } catch {
        // ignore audit failures
      }

      return NextResponse.json(
        { success: false, error: "Passkey verification failed" },
        { status: 400 }
      );
    }

    // 4. Update counter
    if (verification.authenticationInfo) {
      await updatePasskeyCounter(
        credential.credentialId,
        BigInt(verification.authenticationInfo.newCounter)
      );
    }

    // 5. Get user email from profile
    const profile = await db.profile.findUnique({
      where: { id: credential.userId },
      select: { email: true, totpEnabled: true, passkeyEnabled: true, twoFaEnforcedByOrg: true },
    });

    if (!profile?.email) {
      return NextResponse.json(
        { success: false, error: "User account not found" },
        { status: 400 }
      );
    }

    // 6. Create Supabase session via admin magiclink + verifyOtp
    const supabaseAdmin = await createSupabaseAdmin();
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[passkey-signin] generateLink error:", linkError);
      return NextResponse.json(
        { success: false, error: "Unable to create session. Please try again." },
        { status: 500 }
      );
    }

    // Create a server client to capture session cookies
    const responseObj = NextResponse.json({ success: true, callbackUrl });
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return [];
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              responseObj.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error: verifyError } = await supabaseServer.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError) {
      console.error("[passkey-signin] verifyOtp error:", verifyError);
      return NextResponse.json(
        { success: false, error: "Session verification failed. Please try again." },
        { status: 500 }
      );
    }

    // 7. The passkey authentication itself satisfies MFA. Return a short-lived
    // handoff token so middleware can set the sw_2fa cookie on the next page
    // load instead of relying on a fetch() Set-Cookie response.
    const mfaToken = await signMfaToken(credential.userId);
    const finalResponse = NextResponse.json({ success: true, callbackUrl, mfaToken });
    responseObj.cookies.getAll().forEach(({ name, value }) => {
      finalResponse.cookies.set(name, value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    });

    // Audit success
    try {
      const member = await db.member.findFirst({
        where: { userId: credential.userId },
        select: { organizationId: true },
      });
      if (member) {
        await logAudit({
          orgId: member.organizationId,
          actorId: credential.userId,
          action: "passkey.signed_in",
          entityType: "PasskeyCredential",
          entityId: credential.id,
          metadata: { purpose: "primary_signin" },
        });
      }
    } catch {
      // ignore
    }

    return finalResponse;
  } catch (err) {
    console.error("[passkey-signin] unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Sign-in failed" },
      { status: 500 }
    );
  }
}
