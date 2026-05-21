"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { ConnectFlowStep } from "../types";

interface MailboxConnectFlowProps {
  onClose: () => void;
  /** Pre-set to reconnect mode for an existing connection */
  reconnectEmail?: string;
}

const GMAIL_PERMISSIONS = [
  { label: "Read email messages and metadata", scope: "gmail.readonly" },
  { label: "Send email on your behalf", scope: "gmail.send" },
  { label: "Manage labels and mailbox settings", scope: "gmail.labels" },
  { label: "Access mailbox history and changes", scope: "gmail.history" },
];

export function MailboxConnectFlow({ onClose, reconnectEmail }: MailboxConnectFlowProps) {
  const [step, setStep] = useState<ConnectFlowStep>(
    reconnectEmail ? "reconnect_required" : "pre_connect"
  );

  const isReconnect = !!reconnectEmail;
  const title = isReconnect ? "Reconnect Gmail mailbox" : "Connect a Gmail mailbox";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
      role="dialog"
      aria-label={title}
      aria-modal="true"
      data-testid="connect-flow-modal"
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: "#D1D5DB" }}
      >
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center gap-3 border-b px-5"
          style={{ borderColor: "#E2E5EA" }}
        >
          <Mail className="h-4 w-4 shrink-0 text-[#16294D]" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-bold text-[#0F172A]">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 py-6">
          {step === "pre_connect" && (
            <PreConnectStep
              onAuthorize={() => setStep("authorizing")}
              onCancel={onClose}
            />
          )}
          {step === "reconnect_required" && (
            <ReconnectStep
              email={reconnectEmail!}
              onAuthorize={() => setStep("authorizing")}
              onCancel={onClose}
            />
          )}
          {step === "authorizing" && (
            <AuthorizingStep />
          )}
          {step === "success" && (
            <SuccessStep
              email={reconnectEmail ?? null}
              onDone={onClose}
            />
          )}
          {step === "failed" && (
            <FailedStep
              onRetry={() => setStep(isReconnect ? "reconnect_required" : "pre_connect")}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step: Pre-connect ────────────────────────────────────────────────────────

function PreConnectStep({
  onAuthorize,
  onCancel,
}: {
  onAuthorize: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-testid="connect-step-pre-connect">
      <p className="text-sm text-[#334155]">
        Connect a Gmail mailbox to Slipwise so your team can read, reply, and manage customer email from one place.
      </p>

      {/* Permissions disclosure */}
      <div className="mt-5 rounded-xl border border-[#E2E5EA] bg-[#F7F8FB] p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#16294D]" aria-hidden="true" />
          <p className="text-xs font-semibold text-[#0F172A]">
            Slipwise will request these Gmail permissions
          </p>
        </div>
        <ul className="space-y-1.5" aria-label="Gmail permissions requested">
          {GMAIL_PERMISSIONS.map((p) => (
            <li key={p.scope} className="flex items-start gap-2 text-xs text-[#334155]">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
              {p.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-[#94A3B8]">
          Slipwise does not store your Gmail password. Authorization is managed via Google OAuth 2.0.
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onAuthorize}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          aria-label="Authorize with Google"
          data-testid="authorize-btn"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Authorize with Google
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-[#E2E5EA] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Step: Reconnect ──────────────────────────────────────────────────────────

function ReconnectStep({
  email,
  onAuthorize,
  onCancel,
}: {
  email: string;
  onAuthorize: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-testid="connect-step-reconnect">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Authorization expired</p>
          <p className="mt-1 text-sm text-amber-800">
            The Gmail authorization for <strong>{email}</strong> has expired. Reconnect to resume syncing and sending.
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-[#334155]">
        Reconnecting will re-authorize Slipwise to access this Gmail mailbox. No mailbox data will be lost.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onAuthorize}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#D97706" }}
          aria-label="Reconnect with Google"
          data-testid="reconnect-authorize-btn"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Reconnect with Google
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-[#E2E5EA] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Step: Authorizing ────────────────────────────────────────────────────────

function AuthorizingStep() {
  useEffect(() => {
    // Brief delay so the user sees the redirecting state before navigation
    const timer = window.setTimeout(() => {
      window.location.href = "/api/mailbox/gmail/connect";
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center" data-testid="connect-step-authorizing">
      <Loader2 className="h-10 w-10 animate-spin text-[#16294D]" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">Redirecting to Google…</p>
        <p className="mt-1 text-xs text-[#64748B]">
          Complete the authorization in the Google window. You will return to Slipwise when finished.
        </p>
      </div>
    </div>
  );
}

// ─── Step: Success ────────────────────────────────────────────────────────────

function SuccessStep({
  email,
  onDone,
}: {
  email: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center" data-testid="connect-step-success">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
        <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden="true" />
      </div>
      <div>
        <p className="text-base font-bold text-[#0F172A]">Mailbox connected</p>
        <p className="mt-1 text-sm text-[#64748B]">
          {email ? (
            <>
              <strong>{email}</strong> is now connected to Slipwise.
            </>
          ) : (
            <>Your Gmail mailbox is now connected to Slipwise.</>
          )}{" "}
          Initial sync will begin shortly.
        </p>
      </div>
      <div className="w-full rounded-xl border border-[#E2E5EA] bg-[#F7F8FB] p-4 text-left">
        <p className="text-xs font-semibold text-[#0F172A]">What happens next</p>
        <ul className="mt-2 space-y-1.5 text-xs text-[#64748B]">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
            Slipwise will sync recent threads from this mailbox
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
            Team members with access can start reading and replying
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
            You can configure permissions in mailbox settings
          </li>
        </ul>
      </div>
      <button
        onClick={onDone}
        className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
        style={{ background: "#16294D" }}
        aria-label="Done"
        data-testid="connect-done-btn"
      >
        Done
      </button>
    </div>
  );
}

// ─── Step: Failed ─────────────────────────────────────────────────────────────

function FailedStep({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <div data-testid="connect-step-failed">
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-red-900">Authorization failed</p>
          <p className="mt-1 text-sm text-red-800">
            Google did not grant authorization. This may happen if the request was cancelled or if the Google account does not have permission to authorize this application.
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onRetry}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          aria-label="Try again"
          data-testid="retry-btn"
        >
          Try again
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-[#E2E5EA] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
