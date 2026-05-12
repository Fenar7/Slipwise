"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { GoogleButton } from "@/features/auth/components/google-button";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (signUpError) {
        console.error("[signup] signUp error:", signUpError.message, signUpError.code);
        setError(signUpError.message ?? "Could not create account");
      } else if (data.session) {
        console.log("[signup] signed up and session created immediately (no confirmation)");
        router.push("/onboarding");
        router.refresh();
      } else {
        console.log("[signup] user created, awaiting email confirmation");
        router.push("/auth/verify-email?email=" + encodeURIComponent(email));
      }
    } catch (err) {
      console.error("[signup] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Get started with Slipwise for free">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          placeholder="John Doe"
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-[2.05rem] transition-colors"
            style={{ color: "#79747E" }}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="relative">
          <Input
            label="Confirm password"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((s) => !s)}
            className="absolute right-3 top-[2.05rem] transition-colors"
            style={{ color: "#79747E" }}
            tabIndex={-1}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && (
          <div className="rounded-lg border p-3 text-sm" style={{ background: "#F9DEDC", borderColor: "#F2B8B5", color: "#410E0B" }}>
            {error}
          </div>
        )}
        <Button
          type="submit"
          className="h-10 w-full"
          disabled={loading}
        >
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <AuthDivider text="or" />

      <div className="space-y-3">
        <GoogleButton callbackURL="/onboarding" />
      </div>

      <p className="mt-6 text-center text-sm" style={{ color: "#79747E" }}>
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium hover:underline" style={{ color: "#C05092" }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
