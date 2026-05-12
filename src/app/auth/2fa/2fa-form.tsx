"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMfaFactors } from "./actions";
import { authenticatePasskey, browserSupportsWebAuthn } from "@/lib/passkey/client";
import { beginPasskeyAuthentication } from "@/app/app/settings/security/passkey-actions";
import { signOutSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

type MfaMode = "passkey" | "totp" | "recovery";
const PASSKEY_VERIFY_TIMEOUT_MS = 20_000;
const MFA_VERIFY_ENDPOINT = "/api/auth/mfa/verify";

type MfaFactors = {
  status: "challenge" | "skip" | "setup";
  callbackUrl: string;
  setupUrl?: string;
  hasPasskey: boolean;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
};

type VerifyResult =
  | { success: true; callbackUrl: string; mfaToken: string }
  | { success: false; error: string };

function hardNavigate(url: string) {
  window.location.href = url;
}

async function verifyMfa(
  type: "passkey" | "totp" | "recovery",
  payload: { response?: AuthenticationResponseJSON; code?: string },
  rawCallbackUrl: string
): Promise<VerifyResult> {
  const res = await fetch(MFA_VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ type, ...payload, callbackUrl: rawCallbackUrl }),
  });

  const data = (await res.json()) as VerifyResult;
  return data;
}

export function TwoChallengeForm() {
  const router = useRouter();
  const { refresh, replace } = router;
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";

  const [mode, setMode] = useState<MfaMode>("passkey");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [factors, setFactors] = useState<MfaFactors | null>(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [webauthnSupported, setWebauthnSupported] = useState(true);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyAttempted, setPasskeyAttempted] = useState(false);
  const navigatingAway = useRef(false);

  useEffect(() => {
    if (navigatingAway.current) return;
    const supportsWebAuthn = browserSupportsWebAuthn();
    setWebauthnSupported(supportsWebAuthn);
    getMfaFactors(callbackUrl).then((res) => {
      if (navigatingAway.current) return;
      if (res.success) {
        if (res.data.status === "skip") {
          navigatingAway.current = true;
          hardNavigate(res.data.callbackUrl);
          return;
        }
        if (res.data.status === "setup") {
          navigatingAway.current = true;
          hardNavigate(res.data.setupUrl ?? "/app/settings/security?setupMfa=1");
          return;
        }
        setFactors(res.data);
        if (res.data.hasPasskey && supportsWebAuthn) {
          setMode("passkey");
        } else if (res.data.hasTotp) {
          setMode("totp");
        } else {
          setMode("recovery");
        }
      } else {
        setError(res.error);
      }
    }).finally(() => {
      setLoadingFactors(false);
    });
  }, [callbackUrl]);

  async function triggerPasskey() {
    if (navigatingAway.current) return;
    setError(null);
    setPasskeyLoading(true);
    setPasskeyAttempted(true);
    try {
      const beginRes = await beginPasskeyAuthentication();
      if (!beginRes.success) {
        setError(beginRes.error);
        return;
      }
      const options = beginRes.data.options as unknown as import("@simplewebauthn/browser").PublicKeyCredentialRequestOptionsJSON;
      const response = await authenticatePasskey(options);
      const result = await withTimeout(
        verifyMfa("passkey", { response }, callbackUrl),
        PASSKEY_VERIFY_TIMEOUT_MS,
        "Passkey verification took too long. Try again."
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

      navigatingAway.current = true;
      const separator = result.callbackUrl.includes("?") ? "&" : "?";
      hardNavigate(
        `${result.callbackUrl}${separator}mfaToken=${encodeURIComponent(result.mfaToken)}`
      );
    } catch (err) {
      if (navigatingAway.current) return;
      setError(getPasskeyErrorMessage(err));
    } finally {
      if (!navigatingAway.current) {
        setPasskeyLoading(false);
      }
    }
  }

  async function backToSignIn() {
    await signOutSupabaseBrowser();
    replace("/auth/login");
    refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (navigatingAway.current) return;
    setError(null);
    startTransition(async () => {
      if (navigatingAway.current) return;
      const result = await verifyMfa(
        mode === "totp" ? "totp" : "recovery",
        { code: code.trim() },
        callbackUrl
      );

      if (!result.success) {
        setError(result.error);
        setCode("");
        return;
      }

      navigatingAway.current = true;
      const separator = result.callbackUrl.includes("?") ? "&" : "?";
      hardNavigate(
        `${result.callbackUrl}${separator}mfaToken=${encodeURIComponent(result.mfaToken)}`
      );
    });
  }

  const showPasskey = factors?.hasPasskey && webauthnSupported;
  const showTotp = factors?.hasTotp;
  const showRecovery = factors?.hasRecoveryCodes;

  const subtitle = loadingFactors
    ? "Checking your verification methods…"
    : mode === "passkey"
    ? "Verify your identity with your passkey."
    : mode === "totp"
    ? "Enter the 6-digit code from your authenticator app."
    : "Enter one of your recovery codes.";

  return (
    <AuthCard title="Multi-factor authentication" subtitle={subtitle}>
      {error && (
        <div className="rounded-lg border p-3 text-sm text-center mb-4" style={{ background: "#F9DEDC", borderColor: "#F2B8B5", color: "#410E0B" }} role="alert">
          {error}
        </div>
      )}

      {loadingFactors && (
        <div className="rounded-lg border px-4 py-3 text-center text-sm" style={{ background: "#F5F5F5", borderColor: "#E0E0E0", color: "#79747E" }}>
          Checking your account before showing a verification method.
        </div>
      )}

      {!loadingFactors && mode === "passkey" && showPasskey && (
        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            onClick={triggerPasskey}
            disabled={passkeyLoading || isPending}
          >
            {passkeyLoading ? "Waiting for passkey…" : "Use passkey"}
          </Button>
          {passkeyAttempted && error && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={triggerPasskey}
              disabled={passkeyLoading || isPending}
            >
              Try passkey again
            </Button>
          )}
          <div className="flex flex-col gap-2 text-center">
            {showTotp && (
              <button
                type="button"
                onClick={() => { setMode("totp"); setError(null); }}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Use authenticator app instead
              </button>
            )}
            {showRecovery && (
              <button
                type="button"
                onClick={() => { setMode("recovery"); setError(null); }}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Use a recovery code instead
              </button>
            )}
            {!showTotp && !showRecovery && (
              <button
                type="button"
                onClick={backToSignIn}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      )}

      {!loadingFactors && mode === "passkey" && factors?.hasPasskey && !webauthnSupported && (
        <div className="space-y-4 text-center">
          <p className="text-sm" style={{ color: "#79747E" }}>
            This browser does not support passkeys. Use another enrolled verification method or sign in from a supported device.
          </p>
          {showTotp && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setMode("totp")}>
              Use authenticator app
            </Button>
          )}
          {showRecovery && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setMode("recovery")}>
              Use recovery code
            </Button>
          )}
          {!showTotp && !showRecovery && (
            <button
              type="button"
              onClick={backToSignIn}
              className="text-xs underline-offset-4 hover:underline transition-colors"
              style={{ color: "#79747E" }}
            >
              Back to sign in
            </button>
          )}
        </div>
      )}

      {!loadingFactors && !showPasskey && !showTotp && !showRecovery && (
        <div className="space-y-4 text-center">
          <p className="text-sm" style={{ color: "#79747E" }}>
            No verification method is available for this account. Sign in again or contact your administrator.
          </p>
          <Button type="button" variant="secondary" className="w-full" onClick={backToSignIn}>
            Back to sign in
          </Button>
        </div>
      )}

      {!loadingFactors && (mode === "totp" || mode === "recovery") && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="code" style={{ color: "#1C1B1F" }}>
              {mode === "totp" ? "Authenticator code" : "Recovery code"}
            </label>
            <input
              id="code"
              type="text"
              inputMode={mode === "totp" ? "numeric" : "text"}
              pattern={mode === "totp" ? "[0-9]{6}" : undefined}
              autoComplete={mode === "totp" ? "one-time-code" : "off"}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm placeholder:text-[#79747E] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/25 focus:border-[#DC2626] transition-colors"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              placeholder={mode === "totp" ? "000000" : "xxxxxxxxxxxxxxxx"}
            />
          </div>

          <button
            type="submit"
            disabled={isPending || code.length < 6}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#DC2626" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#B91C1C")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#DC2626")}
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>

          <div className="flex flex-col gap-2 text-center">
            {showPasskey && (
              <button
                type="button"
                onClick={() => { setMode("passkey"); setError(null); setCode(""); }}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Use passkey instead
              </button>
            )}
            {mode === "totp" && showRecovery && (
              <button
                type="button"
                onClick={() => { setMode("recovery"); setError(null); setCode(""); }}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Use a recovery code instead
              </button>
            )}
            {mode === "recovery" && showTotp && (
              <button
                type="button"
                onClick={() => { setMode("totp"); setError(null); setCode(""); }}
                className="text-xs underline-offset-4 hover:underline transition-colors"
                style={{ color: "#79747E" }}
              >
                Use authenticator app instead
              </button>
            )}
          </div>
        </form>
      )}
    </AuthCard>
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getPasskeyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Passkey authentication failed. Try again.";

  if (error.name === "NotAllowedError") {
    return "Passkey verification was cancelled or timed out. Try again.";
  }

  return error.message || "Passkey authentication failed. Try again.";
}
