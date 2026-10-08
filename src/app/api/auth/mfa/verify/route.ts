import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTotpCode, decryptTotpSecret, findRecoveryCodeIndex } from "@/lib/totp";
import {
  signChallengeToken,
  MFA_CHALLENGE_COOKIE,
  MFA_SESSION_DURATION_SECONDS,
} from "@/lib/totp/challenge-session";
import { signMfaToken } from "@/lib/mfa/token";
import { sanitizeMfaCallbackUrl } from "@/lib/mfa/token";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  getPasskeyByCredentialId,
  updatePasskeyCounter,
} from "@/lib/passkey/db";
import { verifyAuthentication } from "@/lib/passkey/server";
import { logAudit } from "@/lib/audit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

const MAX_AGE = MFA_SESSION_DURATION_SECONDS;

function sanitizeCallbackUrl(raw: string): string {
  return sanitizeMfaCallbackUrl(raw, "/app");
}

function issueCookie(userId: string): [string, string, Record<string, unknown>] {
  const value = await signChallengeToken(userId);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
  return [MFA_CHALLENGE_COOKIE, value, options];
}

function buildSuccessResponse(
  userId: string,
  callbackUrl: string,
  setCookie: boolean
): NextResponse {
  const mfaToken = await signMfaToken(userId);
  const response = NextResponse.json({ success: true, callbackUrl, mfaToken });
  if (setCookie) {
    const [name, value, options] = issueCookie(userId);
    response.cookies.set(name, value, options);
  }
  return response;
}

type VerifyRequest =
  | { type: "passkey"; response: AuthenticationResponseJSON; callbackUrl: string }
  | { type: "totp"; code: string; callbackUrl: string }
  | { type: "recovery"; code: string; callbackUrl: string };

export async function POST(request: NextRequest) {
  let body: VerifyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const callbackUrl = sanitizeCallbackUrl(body.callbackUrl ?? "/app");

  try {
    if (body.type === "passkey") {
      const credentialId = body.response.id;
      const credential = await getPasskeyByCredentialId(credentialId);
      if (!credential || credential.userId !== user.id) {
        return NextResponse.json({ success: false, error: "Unknown passkey credential" }, { status: 400 });
      }

      const verification = await verifyAuthentication(user.id, body.response, {
        credentialId: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
      });

      if (!verification.verified) {
        try {
          const member = await db.member.findFirst({
            where: { userId: user.id },
            select: { organizationId: true },
          });
          if (member) {
            await logAudit({
              orgId: member.organizationId,
              actorId: user.id,
              action: "passkey.challenge_failed",
              entityType: "PasskeyCredential",
              entityId: credential.id,
              metadata: { purpose: "mfa_challenge", reason: "verification_failed" },
            });
          }
        } catch {
          // ignore audit failures
        }
        return NextResponse.json({ success: false, error: "Passkey verification failed" }, { status: 400 });
      }

      if (verification.authenticationInfo) {
        await updatePasskeyCounter(credential.credentialId, BigInt(verification.authenticationInfo.newCounter));
      }

      return buildSuccessResponse(user.id, callbackUrl, true);
    }

    if (body.type === "totp") {
      const profile = await db.profile.findUnique({
        where: { id: user.id },
        select: { totpSecret: true, totpEnabled: true },
      });

      if (!profile?.totpEnabled || !profile.totpSecret) {
        return NextResponse.json(
          {
            success: false,
            error: "Two-factor authentication is not configured for this account. Complete enrollment from Security Settings first.",
          },
          { status: 400 }
        );
      }

      const plainSecret = decryptTotpSecret(profile.totpSecret);
      if (!verifyTotpCode(plainSecret, body.code)) {
        return NextResponse.json({ success: false, error: "Invalid code. Please try again." }, { status: 400 });
      }

      return buildSuccessResponse(user.id, callbackUrl, true);
    }

    if (body.type === "recovery") {
      const profile = await db.profile.findUnique({
        where: { id: user.id },
        select: { recoveryCodes: true, totpEnabled: true, passkeyEnabled: true },
      });

      const hasMfa = profile?.totpEnabled || profile?.passkeyEnabled;
      if (!hasMfa) {
        return NextResponse.json({ success: false, error: "MFA is not enabled for this account" }, { status: 400 });
      }

      const storedHashes = (profile.recoveryCodes as string[] | null) ?? [];
      if (storedHashes.length === 0) {
        return NextResponse.json({ success: false, error: "No recovery codes available" }, { status: 400 });
      }

      const idx = findRecoveryCodeIndex(body.code, storedHashes);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "Invalid recovery code" }, { status: 400 });
      }

      const updated = storedHashes.filter((_, i) => i !== idx);
      await db.profile.update({
        where: { id: user.id },
        data: { recoveryCodes: updated },
      });

      return buildSuccessResponse(user.id, callbackUrl, true);
    }

    return NextResponse.json({ success: false, error: "Unknown MFA type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
