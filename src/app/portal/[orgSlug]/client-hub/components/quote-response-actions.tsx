"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptPortalQuote, declinePortalQuote } from "../../actions";
import { getStaleOutcomeMessage } from "@/lib/portal-quote-helpers";

interface QuoteResponseActionsProps {
  orgSlug: string;
  quoteId: string;
}

export function QuoteResponseActions({ orgSlug, quoteId }: QuoteResponseActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [declineReason, setDeclineReason] = useState("");
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [acceptPending, startAccept] = useTransition();
  const [declinePending, startDecline] = useTransition();

  function handleAccept() {
    startAccept(async () => {
      const res = await acceptPortalQuote(orgSlug, quoteId);
      if (res.success) {
        if (res.data.staleOutcome) {
          setResult({ type: "success", message: getStaleOutcomeMessage(res.data.staleOutcome) });
        } else {
          setResult({ type: "success", message: "Quote accepted successfully." });
        }
        router.refresh();
      } else {
        const errorMsg = "error" in res ? res.error : "Failed to accept quote";
        setResult({ type: "error", message: errorMsg });
      }
    });
  }

  function handleDeclineSubmit(e: React.FormEvent) {
    e.preventDefault();
    startDecline(async () => {
      const res = await declinePortalQuote(orgSlug, quoteId, declineReason || undefined);
      if (res.success) {
        if (res.data.staleOutcome) {
          setResult({ type: "success", message: getStaleOutcomeMessage(res.data.staleOutcome) });
        } else {
          setResult({ type: "success", message: "Quote declined." });
        }
        router.refresh();
      } else {
        const errorMsg = "error" in res ? res.error : "Failed to decline quote";
        setResult({ type: "error", message: errorMsg });
      }
    });
  }

  if (result) {
    return (
      <div
        className={`rounded-xl border p-4 text-[13px] font-semibold ${
          result.type === "success"
            ? "border-emerald-100 bg-emerald-50 text-emerald-800"
            : "border-rose-100 bg-rose-50 text-rose-800"
        }`}
        role="status"
      >
        {result.message}
      </div>
    );
  }

  if (mode === "declining") {
    return (
      <form onSubmit={handleDeclineSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="declineReason"
            className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]"
          >
            Reason for declining{" "}
            <span className="font-normal lowercase text-[var(--hub-text-muted)]">(optional)</span>
          </label>
          <textarea
            id="declineReason"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            placeholder="Let us know why you're declining…"
            className="mt-1 block w-full rounded-xl border border-[var(--hub-border)] bg-white px-3 py-2 text-sm text-[var(--hub-text-strong)] focus:border-[var(--hub-accent)] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={declinePending}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-6 py-3 text-[13px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {declinePending ? "Submitting…" : "Confirm Decline"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-6 py-3 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        onClick={handleAccept}
        disabled={acceptPending}
        className="inline-flex items-center justify-center rounded-xl bg-[var(--hub-accent)] px-6 py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {acceptPending ? "Accepting…" : "Accept Quote"}
      </button>
      <button
        onClick={() => setMode("declining")}
        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        Decline
      </button>
    </div>
  );
}
