"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ClientHubLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsPending(true);
    // Phase 1: static shell — simulate OTP request delay
    setTimeout(() => {
      setIsPending(false);
      setSent(true);
    }, 1200);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Client Hub Login</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email to receive a one-time verification code
            </p>
          </div>

          {sent ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <svg className="mx-auto mb-2 h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-green-800">
                If an account exists with that email, we&apos;ve sent a verification code.
              </p>
              <p className="mt-2 text-xs text-green-600">Please check your inbox. The code will expire in 15 minutes.</p>
              <Link
                href={`/portal/${orgSlug}/client-hub/verify`}
                className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                Enter Code
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="hub-email" className="text-xs font-semibold text-slate-700">
                  Email address
                </label>
                <input
                  id="hub-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] focus:border-[var(--hub-accent)] disabled:bg-slate-50 disabled:cursor-not-allowed"
                  disabled={isPending}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              {error && (
                <p id="login-error" className="text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="hub-accent-bg w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </span>
                ) : (
                  "Send Verification Code"
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                We&apos;ll never share your email. No password required.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
