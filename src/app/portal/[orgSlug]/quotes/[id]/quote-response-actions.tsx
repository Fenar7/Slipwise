"use client";

import { useState, useTransition } from "react";
import { acceptPortalQuote, declinePortalQuote } from "../../actions";
import { getStaleOutcomeMessage } from "@/lib/portal-quote-helpers";

interface QuoteResponseActionsProps {
  orgSlug: string;
  quoteId: string;
}

export function QuoteResponseActions({ orgSlug, quoteId }: QuoteResponseActionsProps) {
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
          setResult({ type: "success", message: `Quote #${res.data.quoteNumber} accepted. We'll be in touch shortly.` });
        }
      } else {
        setResult({ type: "error", message: res.error });
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
          setResult({ type: "success", message: `Quote #${res.data.quoteNumber} declined.` });
        }
      } else {
        setResult({ type: "error", message: res.error });
      }
    });
  }

  if (result) {
    return (
      <div
        className={`rounded-xl border p-4 ${
          result.type === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
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
            className="block text-sm font-medium text-slate-700"
          >
            Reason for declining{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="declineReason"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            placeholder="Let us know why you're declining…"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={declinePending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {declinePending ? "Submitting…" : "Confirm Decline"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleAccept}
        disabled={acceptPending}
        className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        {acceptPending ? "Accepting…" : "Accept Quote"}
      </button>
      <button
        onClick={() => setMode("declining")}
        className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Decline
      </button>
    </div>
  );
}
