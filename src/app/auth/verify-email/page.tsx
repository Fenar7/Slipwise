"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) {
        console.error("[verify-email] resend error:", error.message, error.code);
        setSent(false);
      } else {
        console.log("[verify-email] resend success for:", email);
        setSent(true);
      }
    } catch (err) {
      console.error("[verify-email] unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Check your inbox"
      subtitle={
        email ? `We sent a verification link to ${email}` : "We sent you a verification link"
      }
    >
      <div className="text-center space-y-5">
        <div
          className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
          style={{ background: "#E3F2FD" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1565C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: "#79747E" }}>
          Click the link in your email to verify your account. Check your spam folder if you
          don&apos;t see it.
        </p>
        {sent ? (
          <p className="text-sm font-medium" style={{ color: "#2E7D32" }}>
            Verification email resent!
          </p>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleResend}
            disabled={loading || !email}
          >
            {loading ? "Sending…" : "Resend verification email"}
          </Button>
        )}
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

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
