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
    <div className="mx-auto flex min-h-[72vh] w-full max-w-6xl items-center px-4 py-10 sm:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="overflow-hidden rounded-[32px] border border-[var(--hub-border)] bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.2),_transparent_48%),linear-gradient(135deg,rgba(255,248,239,0.96),rgba(255,255,255,0.92)_52%,rgba(var(--hub-accent-rgb),0.06)_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-strong)] ring-1 ring-[var(--hub-border)]">
            Passwordless sign in
          </span>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)] sm:text-5xl">
            Sign in to your client hub without a password.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-8 text-[var(--hub-text-soft)]">
            We’ll send a one-time code to the email connected to your client account so you can review invoices, quotes, and support details securely.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              "One-time verification code",
              "No password to remember",
              "Client portal access only",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-[var(--hub-border)] bg-white/78 px-4 py-3 text-sm font-medium text-[var(--hub-text-strong)]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--hub-border)] bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Client access</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">Enter your email</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">
            We’ll send a six-digit code if this email belongs to a valid client contact.
          </p>

          {sent ? (
            <div className="mt-8 rounded-[28px] border border-emerald-100 bg-emerald-50/80 p-6">
              <p className="text-lg font-semibold text-emerald-900">Verification code sent</p>
              <p className="mt-2 text-sm leading-7 text-emerald-800">
                If an account exists for <span className="font-semibold">{email}</span>, the code should arrive shortly.
              </p>
              <Link
                href={`/portal/${orgSlug}/client-hub/verify`}
                className="mt-5 inline-flex rounded-2xl bg-[var(--hub-accent)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(var(--hub-accent-rgb),0.28)]"
              >
                Continue to verification
              </Link>
            </div>
          ) : (
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
                  className="w-full rounded-2xl border border-[var(--hub-border)] bg-[#fbfaf6] px-4 py-3 text-sm text-[var(--hub-text-strong)] placeholder:text-[var(--hub-text-soft)] focus:border-[var(--hub-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent-wash)]"
                />
              </div>
              {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-2xl bg-[var(--hub-accent)] px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(var(--hub-accent-rgb),0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Sending code…" : "Send verification code"}
              </button>
              <p className="text-sm leading-7 text-[var(--hub-text-soft)]">
                Static Phase 1 shell: this button simulates delivery only. Real authentication comes in a later phase.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
