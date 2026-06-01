"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { verifyPortalOtpAction, requestPortalOtpAction } from "../../actions";

function OtpSlots({ value }: { value: string }) {
  const slots = useMemo(() => Array.from({ length: 6 }, (_, index) => value[index] ?? ""), [value]);

  return (
    <div className="grid grid-cols-6 gap-2">
      {slots.map((slot, index) => (
        <div
          key={index}
          className="flex h-11 items-center justify-center rounded-lg border border-[var(--hub-border)] bg-white text-base font-semibold text-[var(--hub-text-strong)] sm:h-12"
        >
          {slot || <span className="text-[var(--hub-text-muted)]">•</span>}
        </div>
      ))}
    </div>
  );
}

export default function ClientHubVerifyPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const email = searchParams?.get("email") || "";

  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(email ? "" : "No matching login request was found. Please request a new verification code.");
  const [resendStatus, setResendStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResendStatus("");

    if (!email) {
      setError("Email context is missing. Please go back to the login page.");
      return;
    }

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await verifyPortalOtpAction(email, trimmed, orgSlug);
        if (res.success) {
          setVerified(true);
        } else {
          setError(res.error || "Invalid or expired verification code.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function handleResend() {
    if (!email) return;
    setError("");
    setResendStatus("");
    startResend(async () => {
      try {
        const res = await requestPortalOtpAction(email, orgSlug);
        if (res.success) {
          setResendStatus("A new verification code has been sent!");
        } else {
          setError("Failed to resend code. Please try again.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (verified) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center py-14 sm:py-20">
        <div className="w-full rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-[var(--hub-card-shadow)] sm:p-10">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[28px]">
            You&apos;re ready to continue
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-[var(--hub-text-soft)]">
            In the live product, this is where the authenticated client session would continue to the hub dashboard.
          </p>
          <Link
            href={`/portal/${orgSlug}/client-hub`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[var(--hub-accent)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-[0.97]"
          >
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center py-14 sm:py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-lg font-bold text-[var(--hub-accent)] shadow-[var(--hub-card-shadow)]">
        {orgSlug.charAt(0).toUpperCase()}
      </div>
      <p className="mt-3 text-sm font-semibold capitalize text-[var(--hub-text-strong)]">{orgSlug}</p>

      <div className="mt-8 w-full rounded-2xl border border-[var(--hub-border)] bg-white p-8 shadow-[var(--hub-card-shadow)] sm:p-10">
        <div className="text-center">
          <span className="inline-flex rounded-full border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-accent)]">
            Step 2 of 2
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[28px]">
            Enter your verification code
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-[var(--hub-text-soft)]">
            We sent a six-digit code to your email. Enter it below to complete the static sign-in preview.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="client-hub-otp" className="text-[13px] font-semibold text-[var(--hub-text-strong)]">
              Verification code
            </label>
            <div className="mt-3">
              <OtpSlots value={code} />
            </div>
            <input
              id="client-hub-otp"
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="sr-only"
              aria-hidden="true"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="mt-3 w-full rounded-xl border border-[var(--hub-border)] bg-white px-4 py-3 text-center text-base font-semibold tracking-[0.3em] text-[var(--hub-text-strong)] transition focus:border-[var(--hub-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--hub-accent-soft)]"
              placeholder="000000"
            />
          </div>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-[var(--hub-accent)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Verifying…" : "Verify code"}
          </button>
        </form>

        {resendStatus && (
          <p className="mt-4 text-center text-xs font-semibold text-emerald-600">
            {resendStatus}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--hub-border)] pt-5 text-[13px]">
          <span className="text-[var(--hub-text-muted)]">Code expires in 15 minutes</span>
          <button
            type="button"
            disabled={resending || !email}
            onClick={handleResend}
            className="font-semibold text-[var(--hub-accent)] transition hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending ? "Resending..." : "Resend code"}
          </button>
        </div>

        <div className="mt-4 text-center text-[13px]">
          <Link
            href={`/portal/${orgSlug}/client-hub/login`}
            className="font-medium text-[var(--hub-text-muted)] transition hover:text-[var(--hub-text-strong)]"
          >
            Use a different email
          </Link>
        </div>
      </div>
      <p className="mt-8 text-center text-[11px] text-[var(--hub-text-muted)]">© 2026 Slipwise. All rights reserved.</p>
    </div>
  );
}
