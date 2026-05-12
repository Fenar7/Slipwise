"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser, signOutSupabaseBrowser } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { initiate2faSetup, verify2faSetup, disable2fa } from "./actions";
import {
  getMfaStatus,
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  listPasskeys,
  renamePasskey,
  removePasskey,
  getStepUpFactors,
  verifyStepUpPassword,
  verifyStepUpTotp,
  beginStepUpPasskey,
  verifyStepUpPasskey,
} from "./passkey-actions";
import { registerPasskey, authenticatePasskey, browserSupportsWebAuthn } from "@/lib/passkey/client";
import QRCode from "qrcode";
import { ShieldCheck, ShieldOff, KeyRound, Fingerprint, Trash2, Pencil } from "lucide-react";

type TwoFaStep = "idle" | "setup" | "verify" | "done";

type PasskeyListItem = {
  id: string;
  credentialId: string;
  deviceName: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StepUpMethod = "none" | "password" | "totp" | "passkey";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // MFA state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [twoFaEnforced, setTwoFaEnforced] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<TwoFaStep>("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeySuccess, setPasskeySuccess] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [webauthnSupported, setWebauthnSupported] = useState(true);

  // Step-up verification state for passkey removal
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [stepUpMethod, setStepUpMethod] = useState<StepUpMethod>("none");
  const [stepUpFactors, setStepUpFactors] = useState<{ hasPassword: boolean; hasTotp: boolean; hasPasskey: boolean } | null>(null);
  const [stepUpToken, setStepUpToken] = useState("");
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpTotpCode, setStepUpTotpCode] = useState("");
  const [stepUpBusy, setStepUpBusy] = useState(false);

  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
    loadMfaStatus();
  }, []);

  async function loadMfaStatus() {
    const res = await getMfaStatus();
    if (res.success) {
      setTotpEnabled(res.data.totpEnabled);
      setPasskeyEnabled(res.data.passkeyEnabled);
      setTwoFaEnforced(res.data.twoFaEnforcedByOrg);
    }
    const listRes = await listPasskeys();
    if (listRes.success) {
      setPasskeys(listRes.data);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message ?? "Could not change password");
      } else {
        setSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Could not change password.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutAll() {
    await signOutSupabaseBrowser();
    router.push("/");
  }

  async function handleEnable2fa() {
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      const res = await initiate2faSetup();
      if (!res.success) { setTwoFaError(res.error); return; }
      const dataUrl = await QRCode.toDataURL(res.data.uri);
      setQrDataUrl(dataUrl);
      setTwoFaStep("setup");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      const res = await verify2faSetup(totpCode);
      if (!res.success) { setTwoFaError(res.error); return; }
      setRecoveryCodes(res.data.recoveryCodes);
      setTotpEnabled(true);
      setTwoFaStep("done");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function handleDisable2fa(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      const res = await disable2fa(disablePassword);
      if (!res.success) { setTwoFaError(res.error); return; }
      setTotpEnabled(false);
      setTwoFaStep("idle");
      setDisablePassword("");
    } finally {
      setTwoFaBusy(false);
    }
  }

  // ─── Passkey handlers ──────────────────────────────────────────────────────

  async function handleAddPasskey() {
    setPasskeyError("");
    setPasskeySuccess("");
    setPasskeyBusy(true);
    try {
      const beginRes = await beginPasskeyRegistration();
      if (!beginRes.success) {
        setPasskeyError(beginRes.error);
        return;
      }
      const options = beginRes.data.options as unknown as import("@simplewebauthn/browser").PublicKeyCredentialCreationOptionsJSON;
      const response = await registerPasskey(options);
      const finishRes = await finishPasskeyRegistration(
        response,
        `Passkey ${new Date().toLocaleDateString()}`
      );
      if (!finishRes.success) {
        setPasskeyError(finishRes.error);
        return;
      }
      await loadMfaStatus();
      setPasskeySuccess("Passkey added. It will be offered as your preferred MFA method on your next sign-in.");
      router.refresh();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : "Passkey registration failed");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function handleRenamePasskey(id: string) {
    if (!renameValue.trim()) {
      setRenameId(null);
      return;
    }
    const res = await renamePasskey(id, renameValue.trim());
    if (!res.success) {
      setPasskeyError(res.error);
      return;
    }
    setRenameId(null);
    setRenameValue("");
    await loadMfaStatus();
  }

  // ─── Step-up verification for passkey removal ──────────────────────────────

  async function startRemovePasskey(id: string) {
    setPasskeyError("");
    setRemoveId(id);
    setStepUpToken("");
    setStepUpPassword("");
    setStepUpTotpCode("");
    setStepUpMethod("none");
    const res = await getStepUpFactors();
    if (res.success) {
      setStepUpFactors(res.data);
      // Auto-select the first available method
      if (res.data.hasPassword) {
        setStepUpMethod("password");
      } else if (res.data.hasTotp) {
        setStepUpMethod("totp");
      } else if (res.data.hasPasskey) {
        setStepUpMethod("passkey");
      }
    }
  }

  async function handleStepUpPassword() {
    setPasskeyError("");
    setStepUpBusy(true);
    try {
      const res = await verifyStepUpPassword(stepUpPassword);
      if (!res.success) {
        setPasskeyError(res.error);
        return;
      }
      setStepUpToken(res.data.stepUpToken);
    } finally {
      setStepUpBusy(false);
    }
  }

  async function handleStepUpTotp() {
    setPasskeyError("");
    setStepUpBusy(true);
    try {
      const res = await verifyStepUpTotp(stepUpTotpCode);
      if (!res.success) {
        setPasskeyError(res.error);
        return;
      }
      setStepUpToken(res.data.stepUpToken);
    } finally {
      setStepUpBusy(false);
    }
  }

  async function handleStepUpPasskey() {
    setPasskeyError("");
    setStepUpBusy(true);
    try {
      const beginRes = await beginStepUpPasskey();
      if (!beginRes.success) {
        setPasskeyError(beginRes.error);
        return;
      }
      const options = beginRes.data.options as unknown as import("@simplewebauthn/browser").PublicKeyCredentialRequestOptionsJSON;
      const response = await authenticatePasskey(options);
      const finishRes = await verifyStepUpPasskey(response);
      if (!finishRes.success) {
        setPasskeyError(finishRes.error);
        return;
      }
      setStepUpToken(finishRes.data.stepUpToken);
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : "Passkey step-up failed");
    } finally {
      setStepUpBusy(false);
    }
  }

  async function handleRemovePasskeyConfirmed() {
    setPasskeyError("");
    setStepUpBusy(true);
    try {
      const res = await removePasskey(removeId!, stepUpToken);
      if (!res.success) {
        setPasskeyError(res.error);
        return;
      }
      setRemoveId(null);
      setStepUpToken("");
      setStepUpPassword("");
      setStepUpTotpCode("");
      setStepUpMethod("none");
      await loadMfaStatus();
    } finally {
      setStepUpBusy(false);
    }
  }

  function cancelRemove() {
    setRemoveId(null);
    setStepUpToken("");
    setStepUpPassword("");
    setStepUpTotpCode("");
    setStepUpMethod("none");
    setPasskeyError("");
  }

  const anyMfaEnabled = totpEnabled || passkeyEnabled;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Security</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Manage your password, multi-factor authentication, and active sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Change password</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {success && (
              <p className="text-sm text-[var(--state-success)]">&#10003; Password changed successfully.</p>
            )}
            {error && <p className="text-sm text-[var(--state-danger)]">{error}</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving&#8230;" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Multi-Factor Authentication ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {anyMfaEnabled
              ? <ShieldCheck className="h-4 w-4 text-[var(--state-success)]" />
              : <ShieldOff className="h-4 w-4 text-[var(--text-muted)]" />
            }
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Multi-factor authentication</h2>
            {anyMfaEnabled && (
              <span className="ml-2 rounded-full bg-[var(--state-success-soft)] px-2 py-0.5 text-xs font-medium text-[var(--state-success)]">
                Enabled
              </span>
            )}
            {twoFaEnforced && !anyMfaEnabled && (
              <span className="ml-2 rounded-full bg-[var(--state-warning-soft)] px-2 py-0.5 text-xs font-medium text-[var(--state-warning)]">
                Required by org
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Passkeys are the preferred second factor. Authenticator app and recovery codes remain available as fallback.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {passkeyError && <p className="text-sm text-red-600">{passkeyError}</p>}
          {passkeySuccess && <p className="text-sm text-green-600">{passkeySuccess}</p>}
          {twoFaError && <p className="text-sm text-red-600">{twoFaError}</p>}

          {/* ── Passkeys ── */}
          <div className="rounded-lg border border-[var(--border-brand)] bg-[var(--surface-selected)] p-4">
            <div className="mb-3 flex items-start gap-3">
              <Fingerprint className="mt-0.5 h-4 w-4 text-[var(--brand-primary)]" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Passkeys</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Use Face ID, Touch ID, Windows Hello, Android fingerprint, or a security key after sign-in.
                </p>
              </div>
            </div>
            {webauthnSupported ? (
              <>
                <Button
                  variant="primary"
                  onClick={handleAddPasskey}
                  disabled={passkeyBusy}
                  className="mb-3"
                >
                  {passkeyBusy ? "Loading&#8230;" : "Add passkey"}
                </Button>
                {passkeys.length > 0 && (
                  <ul className="space-y-2">
                    {passkeys.map((pk) => (
                      <li
                        key={pk.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          {renameId === pk.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="rounded border border-input bg-background px-2 py-1 text-sm"
                                autoFocus
                                maxLength={100}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRenamePasskey(pk.id)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setRenameId(null); setRenameValue(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : removeId === pk.id && stepUpToken ? (
                            /* ── Confirmation after step-up verified ── */
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-[#1a1a1a]">
                                Remove &ldquo;{pk.deviceName || "Unnamed passkey"}&rdquo;?
                              </p>
                              <p className="text-sm text-[#666]">This action cannot be undone.</p>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={handleRemovePasskeyConfirmed}
                                  disabled={stepUpBusy}
                                >
                                  {stepUpBusy ? "Removing&#8230;" : "Confirm removal"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelRemove}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : removeId === pk.id && !stepUpToken ? (
                            /* ── Step-up verification (not yet verified) ── */
                            <div className="space-y-3">
                              <p className="text-sm font-medium text-[#1a1a1a]">
                                Verify your identity to remove &ldquo;{pk.deviceName || "Unnamed passkey"}&rdquo;
                              </p>
                              {stepUpFactors && (
                                <div className="space-y-2">
                                  {stepUpFactors.hasPassword && (
                                    <div className="space-y-2">
                                      <button
                                        type="button"
                                        className={`text-sm font-medium ${stepUpMethod === "password" ? "text-blue-700" : "text-slate-600 underline"}`}
                                        onClick={() => { setStepUpMethod("password"); setPasskeyError(""); }}
                                      >
                                        Verify with password
                                      </button>
                                      {stepUpMethod === "password" && (
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="password"
                                            value={stepUpPassword}
                                            onChange={(e) => setStepUpPassword(e.target.value)}
                                            placeholder="Current password"
                                            className="rounded border border-input bg-background px-2 py-1 text-sm w-48"
                                            autoFocus
                                            autoComplete="current-password"
                                          />
                                          <Button
                                            size="sm"
                                            onClick={handleStepUpPassword}
                                            disabled={stepUpBusy || !stepUpPassword.trim()}
                                          >
                                            Verify
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {stepUpFactors.hasTotp && (
                                    <div className="space-y-2">
                                      <button
                                        type="button"
                                        className={`text-sm font-medium ${stepUpMethod === "totp" ? "text-blue-700" : "text-slate-600 underline"}`}
                                        onClick={() => { setStepUpMethod("totp"); setPasskeyError(""); }}
                                      >
                                        Verify with authenticator app
                                      </button>
                                      {stepUpMethod === "totp" && (
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={6}
                                            value={stepUpTotpCode}
                                            onChange={(e) => setStepUpTotpCode(e.target.value.replace(/\D/g, ""))}
                                            placeholder="6-digit code"
                                            className="rounded border border-input bg-background px-2 py-1 text-sm w-32"
                                            autoFocus
                                            autoComplete="one-time-code"
                                          />
                                          <Button
                                            size="sm"
                                            onClick={handleStepUpTotp}
                                            disabled={stepUpBusy || stepUpTotpCode.length !== 6}
                                          >
                                            Verify
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {stepUpFactors.hasPasskey && (
                                    <div className="space-y-2">
                                      <button
                                        type="button"
                                        className={`text-sm font-medium ${stepUpMethod === "passkey" ? "text-blue-700" : "text-slate-600 underline"}`}
                                        onClick={() => { setStepUpMethod("passkey"); setPasskeyError(""); }}
                                      >
                                        Verify with passkey
                                      </button>
                                      {stepUpMethod === "passkey" && (
                                        <Button
                                          size="sm"
                                          onClick={handleStepUpPasskey}
                                          disabled={stepUpBusy}
                                        >
                                          {stepUpBusy ? "Waiting&#8230;" : "Authenticate with passkey"}
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelRemove}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-[#1a1a1a]">{pk.deviceName || "Unnamed passkey"}</p>
                              <p className="text-xs text-[#666]">
                                Added {new Date(pk.createdAt).toLocaleDateString()}
                                {pk.lastUsedAt && ` \u00B7 Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { setRenameId(pk.id); setRenameValue(pk.deviceName || ""); setRemoveId(null); }}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { startRemovePasskey(pk.id); setRenameId(null); }}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Your browser does not support passkeys. Use the authenticator app option below.
              </p>
            )}
          </div>

          <div className="border-t border-[var(--border-soft)] pt-4">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-[#1a1a1a]">Authenticator app</h3>
            </div>

            {/* ── idle: not enabled ── */}
            {!totpEnabled && twoFaStep === "idle" && (
              <Button onClick={handleEnable2fa} disabled={twoFaBusy}>
                {twoFaBusy ? "Loading&#8230;" : "Enable authenticator app"}
              </Button>
            )}

            {/* ── setup: show QR code ── */}
            {twoFaStep === "setup" && (
              <div className="max-w-sm space-y-4">
                <p className="text-sm text-slate-600">
                  Scan this QR code with your authenticator app, then enter the 6-digit code below.
                </p>
                {qrDataUrl && (
                  <Image
                    src={qrDataUrl}
                    alt="TOTP QR code"
                    className="rounded-lg border p-2"
                    width={200}
                    height={200}
                    unoptimized
                  />
                )}
                <form onSubmit={handleVerify2fa} className="flex gap-2">
                  <Input
                    label="6-digit code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    required
                    autoComplete="one-time-code"
                    className="w-32"
                  />
                  <Button type="submit" disabled={twoFaBusy || totpCode.length !== 6} className="mt-6">
                    {twoFaBusy ? "Verifying&#8230;" : "Verify"}
                  </Button>
                </form>
              </div>
            )}

            {/* ── done: show recovery codes ── */}
            {twoFaStep === "done" && recoveryCodes.length > 0 && (
              <div className="max-w-md space-y-3">
                <p className="text-sm font-medium text-green-700">&#10003; Authenticator app enabled successfully.</p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-medium text-amber-800">
                    Save these recovery codes in a secure place. Each code can only be used once.
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {recoveryCodes.map((code) => (
                      <code key={code} className="block rounded bg-white px-2 py-1 text-xs font-mono text-slate-800">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => { setTwoFaStep("idle"); setRecoveryCodes([]); }}>
                  Done
                </Button>
              </div>
            )}

            {/* ── enabled: allow disable ── */}
            {totpEnabled && twoFaStep === "idle" && (
              <form onSubmit={handleDisable2fa} className="max-w-sm space-y-3">
                <p className="text-sm text-slate-500">
                  To disable the authenticator app, confirm your password.
                </p>
                <Input
                  label="Current password"
                  type="password"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <Button variant="danger" type="submit" disabled={twoFaBusy}>
                  {twoFaBusy ? "Disabling&#8230;" : "Disable authenticator app"}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Sessions</h2>
          <p className="text-sm text-[var(--text-muted)]">Sign out of all active sessions on all devices</p>
        </CardHeader>
        <CardContent>
          <Button variant="danger" onClick={handleSignOutAll}>
            Sign out all sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
