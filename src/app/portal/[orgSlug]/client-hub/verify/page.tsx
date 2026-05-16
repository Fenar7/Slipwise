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
          className="flex h-14 items-center justify-center rounded-2xl border border-[var(--hub-border)] bg-[#fbfaf6] text-lg font-semibold text-[var(--hub-text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
        >
          {slot || <span className="text-[var(--hub-text-soft)]">•</span>}
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
      <div className="mx-auto flex min-h-[72vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-[32px] border border-emerald-100 bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.16),_transparent_42%),linear-gradient(180deg,#f3fff8_0%,#ffffff_100%)] p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 ring-1 ring-emerald-100">
            Verified
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">You’re ready to continue</h1>
          <p className="mt-4 text-base leading-8 text-[var(--hub-text-soft)]">
            In the live product, this is where the authenticated client session would continue to the hub dashboard.
          </p>
          <Link
            href={`/portal/${orgSlug}/client-hub`}
            className="mt-8 inline-flex rounded-2xl bg-[var(--hub-accent)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(var(--hub-accent-rgb),0.28)]"
          >
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[72vh] w-full max-w-5xl items-center px-4 py-10 sm:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[32px] border border-[var(--hub-border)] bg-white/84 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <span className="inline-flex rounded-full bg-[var(--hub-accent-wash)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-strong)]">
            Step 2 of 2
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">Enter your verification code</h1>
          <p className="mt-4 text-base leading-8 text-[var(--hub-text-soft)]">
            We sent a six-digit code to your email. Enter it below to complete the static sign-in preview.
          </p>
          <div className="mt-8 rounded-[28px] border border-[var(--hub-border)] bg-[#fbfaf6] p-6">
            <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Tips</p>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-[var(--hub-text-soft)]">
              <li>Use the latest code you received.</li>
              <li>The static shell treats codes as 6 digits only.</li>
              <li>Real expiry and rate limiting arrive in later phases.</li>
            </ul>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-[32px] border border-[var(--hub-border)] bg-white/92 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <label htmlFor="client-hub-otp" className="text-sm font-semibold text-[var(--hub-text-strong)]">
            Verification code
          </label>
          <div className="mt-4">
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
            className="mt-4 w-full rounded-2xl border border-[var(--hub-border)] bg-[#fbfaf6] px-4 py-3 text-center text-xl font-semibold tracking-[0.42em] text-[var(--hub-text-strong)] focus:border-[var(--hub-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent-wash)]"
            placeholder="000000"
          />
          {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="mt-6 w-full rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(var(--hub-accent-rgb),0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Verifying…" : "Verify code"}
          </button>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-[var(--hub-text-soft)]">
            <span>Code expires in 15 minutes</span>
            <button type="button" onClick={() => setCode("")} className="font-semibold text-[var(--hub-accent)]">
              Resend code
            </button>
          </div>
          <div className="mt-6 border-t border-[var(--hub-border)] pt-5 text-sm">
            <Link href={`/portal/${orgSlug}/client-hub/login`} className="font-medium text-[var(--hub-text-soft)] hover:text-[var(--hub-text-strong)]">
              Use a different email
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
