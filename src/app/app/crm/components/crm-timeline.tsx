"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { FileText, StickyNote, Send } from "lucide-react";

export interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  amount?: number | null;
  status?: string | null;
  timestamp: Date;
  referenceType?: string;
  referenceId?: string;
}

interface CrmTimelineProps {
  events: TimelineEvent[];
  emptyMessage?: string;
}

const REFERENCE_ROUTE: Record<string, (id: string) => string> = {
  invoice: (id) => `/app/docs/invoices/${id}`,
  quote: (id) => `/app/docs/quotes/${id}`,
  vendor_bill: (id) => `/app/books/vendor-bills/${id}`,
  salary_slip: (id) => `/app/docs/salary-slips/${id}`,
};

const EVENT_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  INVOICE_CREATED: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "Invoice",
    color: "text-[var(--brand-primary)] bg-[var(--surface-selected)]",
  },
  QUOTE_SENT: {
    icon: <Send className="h-3.5 w-3.5" />,
    label: "Quote",
    color: "text-[var(--state-info)] bg-[var(--state-info-soft)]",
  },
  NOTE_ADDED: {
    icon: <StickyNote className="h-3.5 w-3.5" />,
    label: "Note",
    color: "text-[var(--state-warning)] bg-[var(--state-warning-soft)]",
  },
  VENDOR_BILL_CREATED: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "Bill",
    color: "text-[var(--brand-primary)] bg-[var(--surface-selected)]",
  },
  PO_CREATED: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "PO",
    color: "text-[var(--state-info)] bg-[var(--state-info-soft)]",
  },
};

function formatINR(amount?: number | null) {
  if (amount == null) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusVariant(status?: string | null): Parameters<typeof StatusBadge>[0]["variant"] {
  if (!status) return "neutral";
  const s = status.toLowerCase();
  if (s.includes("paid") || s.includes("active") || s.includes("verified") || s.includes("won") || s.includes("sent")) return "success";
  if (s.includes("pending") || s.includes("draft") || s.includes("prospect")) return "warning";
  if (s.includes("overdue") || s.includes("declined") || s.includes("blocked") || s.includes("churned") || s.includes("expired")) return "danger";
  return "neutral";
}

export function CrmTimeline({ events, emptyMessage = "No events yet." }: CrmTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="slipwise-panel p-8 text-center text-sm text-[var(--text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="slipwise-panel overflow-hidden">
      <div className="border-b border-[var(--border-soft)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Timeline</h3>
      </div>
      <div className="divide-y divide-[var(--border-soft)]">
        {events.map((ev) => {
          const meta = EVENT_META[ev.eventType] ?? {
            icon: <span className="h-3.5 w-3.5 rounded-full bg-[var(--border-soft)]" />,
            label: "Event",
            color: "text-[var(--text-muted)] bg-[var(--surface-subtle)]",
          };

          return (
            <div
              key={ev.id}
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.color}`}
              >
                {meta.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {ev.referenceType && ev.referenceId && REFERENCE_ROUTE[ev.referenceType] ? (
                    <Link
                      href={REFERENCE_ROUTE[ev.referenceType](ev.referenceId)}
                      className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      {ev.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {ev.title}
                    </span>
                  )}
                  {ev.status && (
                    <StatusBadge variant={statusVariant(ev.status)}>
                      {ev.status.replace(/_/g, " ")}
                    </StatusBadge>
                  )}
                </div>
                {ev.amount != null && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {formatINR(ev.amount)}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {new Date(ev.timestamp).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
