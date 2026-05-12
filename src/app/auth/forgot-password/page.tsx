"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="If an account exists, we sent a reset link"
      >
        <div className="text-center space-y-5">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: "#E8F5E9" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: "#79747E" }}>
            Check your inbox (and spam) for the password reset link.
          </p>
          <Link
            href="/auth/login"
            className="block text-sm font-medium hover:underline"
            style={{ color: "#DC2626" }}
          >
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="text-center text-sm mt-5" style={{ color: "#79747E" }}>
        <Link
          href="/auth/login"
          className="font-medium hover:underline"
          style={{ color: "#DC2626" }}
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
