"use server";

import { db } from "@/lib/db";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  signChallengeToken,
  MFA_CHALLENGE_COOKIE,
  MFA_SESSION_DURATION_SECONDS,
} from "@/lib/totp/challenge-session";
import {
  createRegistrationOptions,
  verifyRegistration,
  createAuthenticationOptions,
  verifyAuthentication,
} from "@/lib/passkey/server";
import {
  getPasskeysForUser,
  createPasskeyCredential,
  renamePasskeyCredential,
  removePasskeyCredential,
  countPasskeysForUser,
  getPasskeyByCredentialId,
  updatePasskeyCounter,
} from "@/lib/passkey/db";
import { logAudit } from "@/lib/audit";
import { signStepUpToken, verifyStepUpToken } from "@/lib/step-up";
import { verifyTotpCode, decryptTotpSecret } from "@/lib/totp";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/browser";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

const SECURITY_PATH = "/app/settings/security";

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

async function issueMfaCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(MFA_CHALLENGE_COOKIE, await signChallengeToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_SESSION_DURATION_SECONDS,
  });
}

function sanitizeCallbackUrl(raw: string): string {
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return raw;
    }
  } catch {
    // fall through
  }
  return "/app";
}

// ─── Registration ────────────────────────────────────────────────────────────

export async function beginPasskeyRegistration(): Promise<
  ActionResult<{ options: Record<string, unknown> }>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { success: false, error: "Not authenticated" };

    const existing = await getPasskeysForUser(user.id);
    const options = await createRegistrationOptions(
      user.id,
      user.email,
      existing.map((p) => p.credentialId)
    );

    return { success: true, data: { options: options as unknown as Record<string, unknown> } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Registration start failed" };
  }
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  deviceName?: string
): Promise<ActionResult<{ passkeyId: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const verification = await verifyRegistration(user.id, response);
    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: "Passkey verification failed" };
    }

    const info = verification.registrationInfo;
    const credential = await createPasskeyCredential(user.id, {
      credentialId: info.credential.id,
      publicKey: info.credential.publicKey,
      counter: BigInt(info.credential.counter),
      transports: info.credential.transports ?? [],
      deviceName: deviceName || `Passkey ${new Date().toLocaleDateString()}`,
      deviceType: info.credentialDeviceType ?? undefined,
      backedUp: info.credentialBackedUp ?? false,
    });

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, twoFaEnforcedByOrg: true },
    });

    await db.profile.update({
      where: { id: user.id },
      data: {
        passkeyEnabled: true,
        passkeyEnabledAt: new Date(),
      },
    });

    await syncMfaMetadata(user.id, {
      hasTotp: profile?.totpEnabled ?? false,
      hasPasskey: true,
      twoFaEnforcedByOrg: profile?.twoFaEnforcedByOrg ?? false,
    });

    await issueMfaCookie(user.id);

    try {
      const member = await db.member.findFirst({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      if (member) {
        await logAudit({
          orgId: member.organizationId,
          actorId: user.id,
          action: "passkey.added",
          entityType: "PasskeyCredential",
          entityId: credential.id,
          metadata: { deviceName: credential.deviceName, deviceType: credential.deviceType },
        });
      }
    } catch {
      // ignore audit failures in settings
    }

    revalidatePath(SECURITY_PATH);
    return { success: true, data: { passkeyId: credential.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Registration finish failed" };
  }
}

// ─── Authentication (MFA challenge) ──────────────────────────────────────────

export async function beginPasskeyAuthentication(): Promise<
  ActionResult<{ options: Record<string, unknown> }>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const passkeys = await getPasskeysForUser(user.id);
    if (passkeys.length === 0) {
      return { success: false, error: "No passkeys enrolled" };
    }

    const options = await createAuthenticationOptions(
      user.id,
      passkeys.map((p) => ({ id: p.credentialId, transports: p.transports }))
    );

    return { success: true, data: { options: options as unknown as Record<string, unknown> } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Authentication start failed" };
  }
}

export async function finishPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  rawCallbackUrl?: string
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
      // Best-effort audit of failed challenge
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

    await issueMfaCookie(user.id);

    try {
      const member = await db.member.findFirst({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      if (member) {
        await logAudit({
          orgId: member.organizationId,
          actorId: user.id,
          action: "passkey.used",
          entityType: "PasskeyCredential",
          entityId: credential.id,
          metadata: { purpose: "mfa_challenge" },
        });
      }
    } catch {
      // ignore
    }

    return { success: true, data: { callbackUrl: sanitizeCallbackUrl(rawCallbackUrl ?? "/app") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Authentication finish failed" };
  }
}

// ─── Management ──────────────────────────────────────────────────────────────

export async function listPasskeys(): Promise<
  ActionResult<
    {
      id: string;
      credentialId: string;
      deviceName: string | null;
      deviceType: string | null;
      backedUp: boolean;
      transports: string[];
      lastUsedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const passkeys = await getPasskeysForUser(user.id);
    return { success: true, data: passkeys };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to list passkeys" };
  }
}

export async function renamePasskey(
  id: string,
  deviceName: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const result = await renamePasskeyCredential(user.id, id, deviceName.slice(0, 100));
    if (result.count === 0) {
      return { success: false, error: "Passkey not found" };
    }

    try {
      const member = await db.member.findFirst({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      if (member) {
        await logAudit({
          orgId: member.organizationId,
          actorId: user.id,
          action: "passkey.renamed",
          entityType: "PasskeyCredential",
          entityId: id,
          metadata: { deviceName: deviceName.slice(0, 100) },
        });
      }
    } catch {
      // ignore
    }

    revalidatePath(SECURITY_PATH);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Rename failed" };
  }
}

// ─── Step-up verification (auth-method-agnostic re-auth) ─────────────────────

/**
 * Returns which step-up methods are available to the current user.
 * Used by the UI to show the appropriate verification options.
 */
export async function getStepUpFactors(): Promise<
  ActionResult<{ hasPassword: boolean; hasTotp: boolean; hasPasskey: boolean }>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const hasPassword = user.identities?.some(
      (id) => id.provider === "email"
    ) ?? false;

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true },
    });

    const passkeyCount = await countPasskeysForUser(user.id);

    return {
      success: true,
      data: {
        hasPassword,
        hasTotp: profile?.totpEnabled ?? false,
        hasPasskey: passkeyCount > 0,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load factors" };
  }
}

/**
 * Step-up verification via password re-auth.
 * Only works for users who have an email/password identity.
 */
export async function verifyStepUpPassword(
  currentPassword: string
): Promise<ActionResult<{ stepUpToken: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { success: false, error: "Not authenticated" };

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (authError) {
      return { success: false, error: "Incorrect password." };
    }

    return { success: true, data: { stepUpToken: signStepUpToken(user.id, "password") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

/**
 * Step-up verification via TOTP code.
 * Only works for users who have TOTP enrolled.
 */
export async function verifyStepUpTotp(
  code: string
): Promise<ActionResult<{ stepUpToken: string }>> {
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
      return { success: false, error: "Authenticator app is not enabled." };
    }

    const plainSecret = decryptTotpSecret(profile.totpSecret);
    if (!verifyTotpCode(plainSecret, code)) {
      return { success: false, error: "Invalid code. Please try again." };
    }

    return { success: true, data: { stepUpToken: signStepUpToken(user.id, "totp") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

/**
 * Begin step-up verification via passkey authentication.
 * Returns WebAuthn authentication options for the user's enrolled passkeys.
 */
export async function beginStepUpPasskey(): Promise<
  ActionResult<{ options: Record<string, unknown> }>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const passkeys = await getPasskeysForUser(user.id);
    if (passkeys.length === 0) {
      return { success: false, error: "No passkeys enrolled" };
    }

    const options = await createAuthenticationOptions(
      user.id,
      passkeys.map((p) => ({ id: p.credentialId, transports: p.transports }))
    );

    return { success: true, data: { options: options as unknown as Record<string, unknown> } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Step-up start failed" };
  }
}

/**
 * Finish step-up verification via passkey authentication.
 * Verifies the WebAuthn response and, on success, issues a step-up token.
 */
export async function verifyStepUpPasskey(
  response: AuthenticationResponseJSON
): Promise<ActionResult<{ stepUpToken: string }>> {
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
      return { success: false, error: "Passkey verification failed" };
    }

    if (verification.authenticationInfo) {
      await updatePasskeyCounter(credential.credentialId, BigInt(verification.authenticationInfo.newCounter));
    }

    return { success: true, data: { stepUpToken: signStepUpToken(user.id, "passkey") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Step-up verification failed" };
  }
}

// ─── Passkey removal (auth-method-agnostic via step-up token) ────────────────

/**
 * Remove a passkey after step-up verification.
 * Requires a valid step-up token proving the user re-authenticated
 * via password, TOTP, or another passkey — regardless of their auth provider.
 */
export async function removePasskey(
  id: string,
  stepUpToken: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const method = verifyStepUpToken(stepUpToken, user.id);
    if (!method) {
      return { success: false, error: "Step-up verification required. Please verify your identity first." };
    }

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, twoFaEnforcedByOrg: true },
    });

    const passkeyCount = await countPasskeysForUser(user.id);
    const isLastFactor = passkeyCount <= 1 && !profile?.totpEnabled;

    if (isLastFactor && profile?.twoFaEnforcedByOrg) {
      return {
        success: false,
        error:
          "Cannot remove your last MFA factor while your organization requires it. Enable an authenticator app first.",
      };
    }

    const result = await removePasskeyCredential(user.id, id);
    if (result.count === 0) {
      return { success: false, error: "Passkey not found" };
    }

    const remainingCount = await countPasskeysForUser(user.id);
    if (remainingCount === 0) {
      await db.profile.update({
        where: { id: user.id },
        data: { passkeyEnabled: false, passkeyEnabledAt: null },
      });
    }

    await syncMfaMetadata(user.id, {
      hasTotp: profile?.totpEnabled ?? false,
      hasPasskey: remainingCount > 0,
      twoFaEnforcedByOrg: profile?.twoFaEnforcedByOrg ?? false,
    });

    try {
      const member = await db.member.findFirst({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      if (member) {
        await logAudit({
          orgId: member.organizationId,
          actorId: user.id,
          action: "passkey.removed",
          entityType: "PasskeyCredential",
          entityId: id,
          metadata: { stepUpMethod: method },
        });
      }
    } catch {
      // ignore
    }

    revalidatePath(SECURITY_PATH);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Remove failed" };
  }
}

// ─── MFA status ──────────────────────────────────────────────────────────────

export async function getMfaStatus(): Promise<
  ActionResult<{
    totpEnabled: boolean;
    passkeyEnabled: boolean;
    twoFaEnforcedByOrg: boolean;
    passkeyCount: number;
  }>
> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const profile = await db.profile.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, passkeyEnabled: true, twoFaEnforcedByOrg: true },
    });
    if (!profile) return { success: false, error: "Profile not found" };

    const passkeyCount = await countPasskeysForUser(user.id);
    return {
      success: true,
      data: {
        totpEnabled: profile.totpEnabled,
        passkeyEnabled: profile.passkeyEnabled && passkeyCount > 0,
        twoFaEnforcedByOrg: profile.twoFaEnforcedByOrg,
        passkeyCount,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load MFA status" };
  }
}
