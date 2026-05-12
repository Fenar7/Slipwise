"use client";

import { useState, useTransition } from "react";
import { InvoiceTimeline } from "@/features/docs/invoice/components/invoice-timeline";
import {
  issueInvoice,
  markInvoicePaid,
  cancelInvoice,
  disputeInvoice,
  recordPayment,
} from "../actions";
import { createPaymentLink, cancelPaymentLink } from "../payment-link-actions";
import { DocumentActionRail } from "@/components/docs/document-action-bar";
import type { DocAction } from "@/components/docs/document-action-bar";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

interface TimelineEvent {
  id: string;
  invoiceId: string;
  fromStatus: string;
  toStatus: string;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  metadata: unknown;
  createdAt: Date | string;
}

interface PaymentEntry {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
  note: string | null;
  source: string;
  status: string;
  externalPaymentId: string | null;
  paymentMethodDisplay: string | null;
  plannedNextPaymentDate: string | null;
}

interface InvoiceSummary {
  totalAmount: number;
  amountPaid: number;
  remainingAmount: number;
  lastPaymentAt: string | null;
  lastPaymentMethod: string | null;
  paymentPromiseDate: string | null;
  razorpayPaymentLinkUrl: string | null;
  paymentLinkStatus: string | null;
  paymentLinkExpiresAt: string | null;
  paymentLinkLastEventAt: string | null;
}

interface InvoiceDetailClientProps {
  invoiceId: string;
  status: string;
  events: TimelineEvent[];
  invoiceSummary?: InvoiceSummary;
  payments?: PaymentEntry[];
}

const SOURCE_LABELS: Record<string, string> = {
  admin_manual: "Manual",
  public_proof: "Proof Upload",
  razorpay_payment_link: "Payment Link",
  smart_collect: "Smart Collect",
  api: "API",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  SETTLED: "bg-[var(--state-success-soft)] text-[var(--state-success)]",
  PENDING_REVIEW: "bg-[var(--state-warning-soft)] text-[var(--state-warning)]",
  REJECTED: "bg-[var(--state-danger-soft)] text-[var(--state-danger)]",
  OVERPAID_REVIEW: "bg-[var(--state-warning-soft)] text-[var(--state-warning)]",
};

const ACTION_CONFIG: Record<string, { label: string; allowedFrom: string[]; variant: DocAction["variant"]; icon: DocAction["icon"] }> = {
  ISSUE: {
    label: "Issue Invoice",
    allowedFrom: ["DRAFT"],
    variant: "primary",
    icon: "confirm",
  },
  PAID: {
    label: "Mark Paid",
    allowedFrom: ["ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "OVERDUE"],
    variant: "primary",
    icon: "confirm",
  },
  CANCEL: {
    label: "Cancel",
    allowedFrom: ["DRAFT", "ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "OVERDUE", "DISPUTED"],
    variant: "danger",
    icon: "cancel",
  },
  DISPUTE: {
    label: "Dispute",
    allowedFrom: ["ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "PAID", "OVERDUE"],
    variant: "danger",
    icon: "cancel",
  },
  RECORD_PAYMENT: {
    label: "Record Payment",
    allowedFrom: ["ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "OVERDUE"],
    variant: "primary",
    icon: "confirm",
  },
};

export function InvoiceDetailClient({
  invoiceId,
  status,
  events,
  invoiceSummary,
  payments = [],
}: InvoiceDetailClientProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReasonInput, setShowReasonInput] = useState<"cancel" | "dispute" | null>(null);
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [reason, setReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const handleAction = (action: string) => {
    setError(null);
    if (action === "CANCEL") {
      setShowReasonInput("cancel");
      return;
    }
    if (action === "DISPUTE") {
      setShowReasonInput("dispute");
      return;
    }
    if (action === "RECORD_PAYMENT") {
      setShowPaymentInput(true);
      return;
    }

    startTransition(async () => {
      let result;
      if (action === "ISSUE") {
        result = await issueInvoice(invoiceId);
      } else if (action === "PAID") {
        result = await markInvoicePaid(invoiceId);
      }
      if (result && !result.success) {
        setError(result.error);
      }
    });
  };

  const submitReason = () => {
    if (!reason.trim()) return;
    startTransition(async () => {
      const result =
        showReasonInput === "cancel"
          ? await cancelInvoice(invoiceId, reason)
          : await disputeInvoice(invoiceId, reason);
      if (!result.success) {
        setError(result.error);
      }
      setShowReasonInput(null);
      setReason("");
    });
  };

  const submitPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    startTransition(async () => {
      const result = await recordPayment(invoiceId, {
        amount,
        method: paymentMethod || undefined,
      });
      if (!result.success) {
        setError(result.error);
      }
      setShowPaymentInput(false);
      setPaymentAmount("");
      setPaymentMethod("");
    });
  };

  const availableActions = Object.entries(ACTION_CONFIG).filter(
    ([, config]) => config.allowedFrom.includes(status)
  );

  const actionItems: DocAction[] = availableActions.map(([key, config]) => ({
    id: key,
    label: config.label,
    variant: config.variant,
    icon: config.icon,
    onClick: () => handleAction(key),
    disabled: isPending,
  }));

  return (
    <div className="space-y-5">
      {/* Action Buttons */}
      {actionItems.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Lifecycle Actions
          </h3>
          <DocumentActionRail actions={actionItems} />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      {/* Reason Input Modal */}
      {showReasonInput && (
        <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)]">
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
            {showReasonInput === "cancel" ? "Cancellation Reason" : "Dispute Reason"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
            rows={2}
            placeholder="Enter reason..."
          />
          <div className="flex gap-2">
            <button
              onClick={submitReason}
              disabled={isPending || !reason.trim()}
              className="rounded-full bg-[var(--brand-cta)] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#B91C1C] disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setShowReasonInput(null);
                setReason("");
              }}
              className="rounded-full border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment Input */}
      {showPaymentInput && (
        <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)]">
          <h4 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Record Payment</h4>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Amount</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Method</label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                placeholder="e.g. UPI, NEFT"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={submitPayment}
              disabled={isPending || !paymentAmount}
              className="rounded-full bg-[var(--state-success)] px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              Record
            </button>
            <button
              onClick={() => {
                setShowPaymentInput(false);
                setPaymentAmount("");
                setPaymentMethod("");
              }}
              className="rounded-full border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment Summary */}
      {invoiceSummary && (
        <div>
          <h3 className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Payment Summary
          </h3>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Total</span>
              <span className="font-medium text-[var(--text-primary)]">{formatCurrency(invoiceSummary.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Paid</span>
              <span className="font-medium text-[var(--state-success)]">{formatCurrency(invoiceSummary.amountPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Remaining</span>
              <span className={cn("font-medium", invoiceSummary.remainingAmount > 0 ? "text-[var(--state-warning)]" : "text-[var(--text-muted)]")}>
                {invoiceSummary.remainingAmount > 0 ? formatCurrency(invoiceSummary.remainingAmount) : "—"}
              </span>
            </div>
            {invoiceSummary.lastPaymentAt && (
              <div className="flex justify-between pt-2 border-t border-[var(--border-soft)]">
                <span className="text-[var(--text-muted)]">Last payment</span>
                <span className="text-[var(--text-secondary)] text-xs">
                  {new Date(invoiceSummary.lastPaymentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {invoiceSummary.lastPaymentMethod && ` via ${invoiceSummary.lastPaymentMethod}`}
                </span>
              </div>
            )}
            {invoiceSummary.paymentPromiseDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Next promised</span>
                <span className="text-[var(--text-secondary)]">{invoiceSummary.paymentPromiseDate}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Ledger */}
      {payments.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Payment Ledger
          </h3>
          <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]">
                  <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-muted)] uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[var(--text-muted)] uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-muted)] uppercase tracking-wider">Source</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-subtle)] transition-colors">
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {new Date(p.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{SOURCE_LABELS[p.source] ?? p.source}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
                        PAYMENT_STATUS_COLORS[p.status] ?? "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                      )}>
                        {p.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Link Card */}
      {invoiceSummary?.razorpayPaymentLinkUrl && (
        <div>
          <h3 className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Payment Link
          </h3>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4 space-y-2.5 text-sm">
            {invoiceSummary.paymentLinkStatus && (
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-muted)]">Status</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    invoiceSummary.paymentLinkStatus === "paid"
                      ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
                      : invoiceSummary.paymentLinkStatus === "expired" || invoiceSummary.paymentLinkStatus === "cancelled"
                      ? "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                      : "bg-[var(--state-info-soft)] text-[var(--state-info)]"
                  )}
                >
                  {invoiceSummary.paymentLinkStatus}
                </span>
              </div>
            )}
            {invoiceSummary.paymentLinkExpiresAt && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Expires</span>
                <span className="text-[var(--text-secondary)]">{new Date(invoiceSummary.paymentLinkExpiresAt).toLocaleDateString("en-IN")}</span>
              </div>
            )}
            {invoiceSummary.paymentLinkLastEventAt && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Last event</span>
                <span className="text-[var(--text-secondary)]">{new Date(invoiceSummary.paymentLinkLastEventAt).toLocaleDateString("en-IN")}</span>
              </div>
            )}
            <div className="pt-2 border-t border-[var(--border-soft)] space-y-2.5">
              <p className="text-xs text-[var(--text-muted)] truncate">{invoiceSummary.razorpayPaymentLinkUrl}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(invoiceSummary.razorpayPaymentLinkUrl!)}
                  className="text-xs font-medium text-[var(--brand-primary)] hover:text-[#0F1D36] transition-colors"
                >
                  Copy Link
                </button>
                {invoiceSummary.paymentLinkStatus &&
                  ["created", "partially_paid"].includes(invoiceSummary.paymentLinkStatus) && (
                    <GatewayLinkActions
                      invoiceId={invoiceId}
                      mode="cancel"
                    />
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Payment Link button — shown when no active link exists */}
      {!invoiceSummary?.razorpayPaymentLinkUrl ||
        (invoiceSummary.paymentLinkStatus &&
          !["created", "partially_paid"].includes(invoiceSummary.paymentLinkStatus)) ? (
        ["ISSUED", "DUE", "OVERDUE", "PARTIALLY_PAID"].includes(status) && (
          <GatewayLinkActions invoiceId={invoiceId} mode="create" />
        )
      ) : null}

      {/* Timeline */}
      <div>
        <h3 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
          Timeline
        </h3>
        <InvoiceTimeline events={events} />
      </div>
    </div>
  );
}

function GatewayLinkActions({
  invoiceId,
  mode,
}: {
  invoiceId: string;
  mode: "create" | "cancel";
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleCreate() {
    startTransition(async () => {
      const res = await createPaymentLink(invoiceId);
      if (res.success) {
        setResult({ ok: true, message: "Payment link created." });
        // Trigger full page reload to show the new link
        window.location.reload();
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  function handleCancel() {
    if (!confirm("Cancel this payment link? The customer will no longer be able to pay via this link.")) return;
    startTransition(async () => {
      const res = await cancelPaymentLink(invoiceId);
      if (res.success) {
        window.location.reload();
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {mode === "create" ? (
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#0F1D36] disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Payment Link"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs font-medium text-[var(--state-danger)] hover:text-[#B91C1C] transition-colors disabled:opacity-50"
        >
          {isPending ? "Cancelling…" : "Cancel Link"}
        </button>
      )}
      {result && !result.ok && (
        <span className="text-xs text-[var(--state-danger)]">{result.message}</span>
      )}
    </span>
  );
}
