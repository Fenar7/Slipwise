"use server";

import { db } from "@/lib/db";
import { verifyTotpCode, decryptTotpSecret, findRecoveryCodeIndex } from "@/lib/totp";
import {
  signChallengeToken,
  MFA_CHALLENGE_COOKIE,
  MFA_SESSION_DURATION_SECONDS,
} from "@/lib/totp/challenge-session";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { sanitizeMfaCallbackUrl } from "@/lib/mfa/token";
import {
  getPasskeysForUser,
  getPasskeyByCredentialId,
  updatePasskeyCounter,
} from "@/lib/passkey/db";
import { verifyAuthentication } from "@/lib/passkey/server";
import { logAudit } from "@/lib/audit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const MAX_AGE = MFA_SESSION_DURATION_SECONDS;

type MfaChallengeState = {
  status: "challenge" | "skip" | "setup";
  callbackUrl: string;
  setupUrl?: string;
  hasPasskey: boolean;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
};

async function issueCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(MFA_CHALLENGE_COOKIE, await signChallengeToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

function sanitizeCallbackUrl(raw: string): string {
  return sanitizeMfaCallbackUrl(raw, "/app");
}

function buildSetupUrl(callbackUrl: string): string {
  const params = new URLSearchParams({
    setupMfa: "1",
    callbackUrl,
  });
  return `/app/settings/security?${params.toString()}`;
}

async function syncMfaMetadata(
  userId: string,
  metadata: { hasTotp: boolean; hasPasskey: boolean; twoFaEnforcedByOrg: boolean }
) {
  const admin = await createSupabaseAdmin();
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      totpEnabled: metadata.hasTotp,
      passkeyEnabled: metadata.hasPasskey,
      hasTotp: metadata.hasTotp,
      hasPasskey: metadata.hasPasskey,
      mfaEnabled: metadata.hasTotp || metadata.hasPasskey,
      twoFaEnforcedByOrg: metadata.twoFaEnforcedByOrg,
    },
  });
}

export async function verifyTotpChallenge(
  code: string,
  rawCallbackUrl: string
): Promise<ActionResult<{ callbackUrl: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!profile?.totpEnabled || !profile.totpSecret) {
      return {
        success: false,
        error:
          "Two-factor authentication is not configured for this account. Complete enrollment from Security Settings first.",
      };
    }

    const plainSecret = decryptTotpSecret(profile.totpSecret);
    if (!verifyTotpCode(plainSecret, code)) {
      return { success: false, error: "Invalid code. Please try again." };
    }

    await issueCookie(user.id);
    return { success: true, data: { callbackUrl: sanitizeCallbackUrl(rawCallbackUrl) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

export async function verifyRecoveryChallenge(
  inputCode: string,
  rawCallbackUrl: string
): Promise<ActionResult<{ callbackUrl: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { recoveryCodes: true, totpEnabled: true, passkeyEnabled: true },
    });

    const hasMfa = profile?.totpEnabled || profile?.passkeyEnabled;
    if (!hasMfa) {
      return { success: false, error: "MFA is not enabled for this account" };
    }

    const storedHashes = (profile.recoveryCodes as string[] | null) ?? [];
    if (storedHashes.length === 0) {
      return { success: false, error: "No recovery codes available" };
    }

    const idx = findRecoveryCodeIndex(inputCode, storedHashes);
    if (idx === -1) {
      return { success: false, error: "Invalid recovery code" };
    }

    const updated = storedHashes.filter((_, i) => i !== idx);
    await db.profile.update({
      where: { id: user.id },
      data: { recoveryCodes: updated },
    });

    await issueCookie(user.id);
    return { success: true, data: { callbackUrl: sanitizeCallbackUrl(rawCallbackUrl) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Recovery failed" };
  }
}

export async function verifyPasskeyChallenge(
  response: AuthenticationResponseJSON,
  rawCallbackUrl: string
): Promise<ActionResult<{ callbackUrl: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const credentialId = response.id;
    const credential = await getPasskeyByCredentialId(credentialId);
    if (!credential || credential.userId !== user.id) {
      return { success: false, error: "Unknown passkey credential" };
    }

    const verification = await verifyAuthentication(user.id, response, {
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
      return { success: false, error: "Passkey verification failed" };
    }

    if (verification.authenticationInfo) {
      await updatePasskeyCounter(credential.credentialId, BigInt(verification.authenticationInfo.newCounter));
    }

    await issueCookie(user.id);
    return { success: true, data: { callbackUrl: sanitizeCallbackUrl(rawCallbackUrl) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Passkey challenge failed" };
  }
}

export async function getMfaFactors(rawCallbackUrl = "/app"): Promise<
  ActionResult<MfaChallengeState>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: {
        totpEnabled: true,
        passkeyEnabled: true,
        recoveryCodes: true,
        twoFaEnforcedByOrg: true,
      },
    });
    const passkeys = await getPasskeysForUser(user.id);
    const storedHashes = (profile?.recoveryCodes as string[] | null) ?? [];
    const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl);
    const hasPasskey = passkeys.length > 0;
    const hasTotp = profile?.totpEnabled ?? false;
    const twoFaEnforcedByOrg = profile?.twoFaEnforcedByOrg ?? false;

    if (profile?.passkeyEnabled && !hasPasskey) {
      await db.profile.update({
        where: { id: user.id },
        data: { passkeyEnabled: false, passkeyEnabledAt: null },
      });
      await syncMfaMetadata(user.id, {
        hasTotp,
        hasPasskey: false,
        twoFaEnforcedByOrg,
      });
    }

    const hasPrimaryMfa = hasPasskey || hasTotp;

    return {
      success: true,
      data: {
        status: hasPrimaryMfa ? "challenge" : twoFaEnforcedByOrg ? "setup" : "skip",
        callbackUrl,
        setupUrl: twoFaEnforcedByOrg && !hasPrimaryMfa ? buildSetupUrl(callbackUrl) : undefined,
        hasPasskey,
        hasTotp,
        hasRecoveryCodes: storedHashes.length > 0,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load factors" };
  }
}
