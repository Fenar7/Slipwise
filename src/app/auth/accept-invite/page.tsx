"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import {
  getInvitationDetails,
  acceptInvitation,
  type InvitationDetails,
} from "./actions";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      const update = () => setLoading(false);
      update();
      return;
    }
    getInvitationDetails(token).then((details) => {
      if (cancelled) return;
      setInvitation(details);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError("");
    const result = await acceptInvitation(token);
    if (result.success) {
      router.push("/app/home");
    } else {
      setError(result.error ?? "Failed to accept invitation");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: "#79747E" }}>Loading invitation…</p>
      </div>
    );
  }

  if (!token || !invitation) {
    return (
      <AuthCard title="Invalid Invitation" subtitle="This invitation link is invalid or has been removed.">
        <div className="text-center space-y-5">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: "#F9DEDC" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/auth/login")}>
            Go to Login
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <AuthCard title="Already Accepted" subtitle="This invitation has already been accepted.">
        <div className="text-center space-y-5">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: "#E8F5E9" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <Button className="w-full" onClick={() => router.push("/app/home")}>
            Go to Dashboard
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (invitation.expired) {
    return (
      <AuthCard title="Invitation Expired" subtitle="This invitation has expired. Please ask the team admin to send a new invitation.">
        <div className="text-center space-y-5">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: "#FFF8E1" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F9A825" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/auth/login")}>
            Go to Login
          </Button>
        </div>
      </AuthCard>
    );
  }

  const roleLabel = invitation.role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <AuthCard
      title={`Join ${invitation.orgName}`}
      subtitle={`You've been invited to join as a ${roleLabel}.`}
    >
      <div className="text-center mb-6">
        <div
          className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4"
          style={{ background: "#FFDAD6" }}
        >
          <span className="text-lg font-bold" style={{ color: "#DC2626" }}>S</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border p-3 text-sm mb-4" style={{ background: "#F9DEDC", borderColor: "#F2B8B5", color: "#410E0B" }}>
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? "Joining…" : "Join Organization"}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => router.push("/auth/login")}
        >
          Cancel
        </Button>
      </div>
    </AuthCard>
  );
}

function AcceptInviteFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm" style={{ color: "#79747E" }}>Loading invitation…</p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
