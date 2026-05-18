"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ClientHubLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsPending(true);
    setTimeout(() => {
      setSent(true);
      setIsPending(false);
    }, 1200);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center py-14 sm:py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--hub-border)] bg-white text-xl font-bold text-[var(--hub-accent)]">
        {orgSlug.charAt(0).toUpperCase()}
      </div>
      <p className="mt-4 text-sm font-semibold capitalize text-[var(--hub-text-strong)]">{orgSlug}</p>

      <div className="mt-8 w-full rounded-[22px] border border-[var(--hub-border)] bg-white p-8 sm:p-10">
        {!sent ? (
          <>
            <div className="text-center">
              <span className="inline-flex rounded-full border border-[var(--hub-border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-accent)]">
                Passwordless sign in
              </span>
              <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-3xl">
                Sign in to your client hub
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--hub-text-soft)]">
                We&apos;ll send a one-time code to your email so you can review invoices, quotes, and support details securely.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="client-hub-email" className="text-sm font-semibold text-[var(--hub-text-strong)]">
                  Work email
                </label>
                <input
                  id="client-hub-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-2xl border border-[var(--hub-border)] bg-white px-4 py-3.5 text-sm text-[var(--hub-text-strong)] placeholder:text-[var(--hub-text-muted)] transition focus:border-[var(--hub-accent)] focus:outline-none"
                />
              </div>
              {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-[#152033] transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Sending code…" : "Send verification code"}
              </button>
            </form>

            <div className="mt-6 border-t border-[var(--hub-border)] pt-5">
              <div className="flex items-center justify-center gap-6 text-xs text-[var(--hub-text-muted)]">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  No password needed
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Code expires in 15 min
                </span>
              </div>
              <p className="mt-4 text-center text-xs text-[var(--hub-text-muted)]">
                Static Phase 1 shell — this button simulates delivery only.
              </p>
            </div>
          </>
        ) : (
          <div className="text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">
              Check your email
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--hub-text-soft)]">
              We sent a verification code to <span className="font-semibold text-[var(--hub-text-strong)]">{email}</span>.
              Enter it on the next screen to continue.
            </p>
            <Link
              href={`/portal/${orgSlug}/client-hub/verify`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-[#152033] shadow-[0_12px_32px_rgba(var(--hub-accent-rgb),0.22)] transition hover:-translate-y-0.5"
            >
              Continue to verification
            </Link>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 text-sm font-medium text-[var(--hub-text-muted)] transition hover:text-[var(--hub-text-strong)]"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
      <p className="mt-8 text-center text-xs text-[var(--hub-text-muted)]">© 2026 Slipwise. All rights reserved.</p>
    </div>
  );
}
