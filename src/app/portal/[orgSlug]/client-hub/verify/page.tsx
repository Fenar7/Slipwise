"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

function OtpSlots({ value }: { value: string }) {
  const slots = useMemo(() => Array.from({ length: 6 }, (_, index) => value[index] ?? ""), [value]);

  return (
    <div className="grid grid-cols-6 gap-2">
      {slots.map((slot, index) => (
        <div
          key={index}
          className="flex h-12 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-[#fbfaf6] text-lg font-semibold text-[var(--hub-text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:h-14"
        >
          {slot || <span className="text-[var(--hub-text-muted)]">•</span>}
        </div>
      ))}
    </div>
  );
}

export default function ClientHubVerifyPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    setIsPending(true);
    setTimeout(() => {
      setVerified(true);
      setIsPending(false);
    }, 1200);
  }

  if (verified) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center py-12 sm:py-16">
        <div className="w-full rounded-[32px] border border-emerald-100 bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.12),_transparent_42%),linear-gradient(180deg,#f3fff8_0%,#ffffff_100%)] p-8 text-center shadow-[var(--hub-card-shadow)] sm:p-10">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-3xl">
            You&apos;re ready to continue
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--hub-text-soft)]">
            In the live product, this is where the authenticated client session would continue to the hub dashboard.
          </p>
          <Link
            href={`/portal/${orgSlug}/client-hub`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-[#152033] shadow-[0_12px_32px_rgba(var(--hub-accent-rgb),0.22)] transition hover:-translate-y-0.5"
          >
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center py-12 sm:py-16">
      {/* Brand mark */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-bold text-[var(--hub-accent)] shadow-sm ring-1 ring-[var(--hub-border)]">
        {orgSlug.charAt(0).toUpperCase()}
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--hub-text-strong)]">{orgSlug}</p>

      <div className="mt-8 w-full rounded-[32px] border border-[var(--hub-border)] bg-white/90 p-8 shadow-[var(--hub-card-shadow)] sm:p-10">
        <div className="text-center">
          <span className="inline-flex rounded-full bg-[var(--hub-accent-faint)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-accent)]">
            Step 2 of 2
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-3xl">
            Enter your verification code
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--hub-text-soft)]">
            We sent a six-digit code to your email. Enter it below to complete the static sign-in preview.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="client-hub-otp" className="text-sm font-semibold text-[var(--hub-text-strong)]">
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
              className="mt-3 w-full rounded-2xl border border-[var(--hub-border)] bg-[#fbfaf6] px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-[var(--hub-text-strong)] transition focus:border-[var(--hub-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent-faint)]"
              placeholder="000000"
            />
          </div>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-[#152033] shadow-[0_12px_32px_rgba(var(--hub-accent-rgb),0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Verifying…" : "Verify code"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--hub-border)] pt-5 text-sm">
          <span className="text-[var(--hub-text-muted)]">Code expires in 15 minutes</span>
          <button
            type="button"
            onClick={() => setCode("")}
            className="font-semibold text-[var(--hub-accent)] transition hover:underline"
          >
            Resend code
          </button>
        </div>

        <div className="mt-4 text-center text-sm">
          <Link
            href={`/portal/${orgSlug}/client-hub/login`}
            className="font-medium text-[var(--hub-text-muted)] transition hover:text-[var(--hub-text-strong)]"
          >
            Use a different email
          </Link>
        </div>
      </div>
    </div>
  );
}
