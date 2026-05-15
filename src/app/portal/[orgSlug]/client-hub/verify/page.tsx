"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ClientHubVerifyPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = code.trim();
    if (!trimmed || trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    setIsPending(true);
    // Phase 1: static shell — simulate verification delay
    setTimeout(() => {
      setIsPending(false);
      setVerified(true);
    }, 1200);
  }

  if (verified) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-green-900">Identity Verified</h1>
          <p className="mt-2 text-sm text-green-700">
            You have been successfully authenticated.
          </p>
          <p className="mt-1 text-xs text-green-600">
            In a live system, you would now be redirected to the dashboard.
          </p>
          <Link
            href={`/portal/${orgSlug}/client-hub`}
            className="mt-6 inline-flex rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
          >
            Continue to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.36-1.664 7.312m-9.285 4.007A7.5 7.5 0 016 15.756" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Verify Your Identity</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter the 6-digit code we sent to your email
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="hub-otp" className="text-xs font-semibold text-slate-700">
                Verification code
              </label>
              <input
                id="hub-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-center text-lg font-medium tracking-[0.5em] text-slate-900 placeholder:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] focus:border-[var(--hub-accent)] disabled:bg-slate-50 disabled:cursor-not-allowed"
                disabled={isPending}
                aria-describedby={error ? "verify-error" : undefined}
              />
            </div>

            {error && (
              <p id="verify-error" className="text-xs text-red-600" role="alert">
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
                  Verifying…
                </span>
              ) : (
                "Verify Code"
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Code expires in 15 minutes</span>
              <button
                type="button"
                onClick={() => {
                  setCode("");
                  setError("");
                }}
                className="hub-accent-text font-medium hover:underline"
              >
                Resend code
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <Link
              href={`/portal/${orgSlug}/client-hub/login`}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Use a different email address
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
