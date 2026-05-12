import { notFound } from "next/navigation";
import Link from "next/link";
import { getQuote, sendQuoteAction, convertQuoteAction, duplicateQuote, deleteQuote } from "../actions";
import { DocumentAttachments } from "@/components/docs/document-attachments";
import { getDocAttachments } from "@/app/app/docs/attachment-actions";
import { getDocumentTimelineForPage } from "@/lib/document-events";
import { DocumentTimeline } from "@/components/docs/document-timeline";
import { DocumentActionBar } from "@/components/docs/document-action-bar";
import { StatusBadge } from "@/components/dashboard/status-badge";

export const metadata = {
  title: "Quote Detail | Slipwise",
};

const STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CONVERTED: "success",
};

function formatCurrency(amount: number, currency: string = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quote, attachments, events] = await Promise.all([
    getQuote(id),
    getDocAttachments(id, "quote"),
    getDocumentTimelineForPage("quote", id).catch(() => []),
  ]);

  if (!quote) {
    notFound();
  }

  const isExpired = quote.status === "SENT" && quote.validUntil < new Date();
  const statusVariant = STATUS_VARIANTS[quote.status] ?? "neutral";
  const displayStatus = isExpired && quote.status === "SENT" ? "EXPIRED" : quote.status;

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 lg:px-5 lg:py-7 space-y-5">
        <DocumentActionBar
          backHref="/app/docs/quotes"
          backLabel="Quotes"
          documentType="Quote"
          documentNumber={`#${quote.quoteNumber}`}
          title={quote.title}
          status={displayStatus}
          statusVariant={isExpired && quote.status === "SENT" ? "warning" : statusVariant}
          primaryActions={[
            ...(quote.status === "DRAFT"
              ? [
                  {
                    id: "send",
                    label: "Send Quote",
                    icon: "send" as const,
                    variant: "primary" as const,
                    formAction: async () => {
                      "use server";
                      await sendQuoteAction(id);
                    },
                  },
                ]
              : []),
            ...(quote.status === "ACCEPTED"
              ? [
                  {
                    id: "convert",
                    label: "Convert to Invoice",
                    icon: "convert" as const,
                    variant: "primary" as const,
                    formAction: async () => {
                      "use server";
                      await convertQuoteAction(id);
                    },
                  },
                ]
              : []),
            {
              id: "duplicate",
              label: "Duplicate",
              icon: "duplicate",
              variant: "secondary",
              formAction: async () => {
                "use server";
                await duplicateQuote(id);
              },
            },
          ]}
          secondaryActions={[
            ...(quote.status === "DRAFT"
              ? [
                  {
                    id: "edit",
                    label: "Edit",
                    icon: "edit" as const,
                    variant: "subtle" as const,
                    href: `/app/docs/quotes/${quote.id}?edit=true`,
                  },
                  {
                    id: "delete",
                    label: "Delete",
                    icon: "delete" as const,
                    variant: "danger" as const,
                    formAction: async () => {
                      "use server";
                      await deleteQuote(id);
                    },
                  },
                ]
              : []),
          ]}
          contextMeta={[
            { label: "Customer", value: quote.customer.name },
            { label: "Issue Date", value: formatDate(quote.issueDate) },
            { label: "Valid Until", value: formatDate(quote.validUntil) },
            { label: "Total", value: formatCurrency(quote.totalAmount, quote.currency) },
          ]}
        />

        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Main Content */}
          <div className="flex-1">
            <div className="rounded-2xl border border-[var(--border-default)] bg-white shadow-[var(--shadow-card)] overflow-hidden">
              {/* Accent Bar */}
              <div className="h-1.5 bg-[var(--brand-cta)]" />

              {/* Header Section */}
              <div className="px-6 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">{quote.org.name}</h1>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-[var(--brand-cta)]">Quote</h2>
                    <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">#{quote.quoteNumber}</p>
                    <StatusBadge variant={isExpired && quote.status === "SENT" ? "warning" : statusVariant} className="mt-2">
                      {displayStatus}
                    </StatusBadge>
                  </div>
                </div>
                <p className="mt-2 text-lg text-[var(--text-secondary)]">{quote.title}</p>
              </div>

              {/* Meta */}
              <div className="border-t border-[var(--border-soft)] px-6 py-5 sm:px-8 grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Customer</h3>
                  <Link href={`/app/data/customers/${quote.customer.id}`} className="font-medium text-[var(--brand-primary)] hover:underline">
                    {quote.customer.name}
                  </Link>
                  {quote.customer.email && (
                    <p className="text-sm text-[var(--text-secondary)]">{quote.customer.email}</p>
                  )}
                  {quote.customer.phone && (
                    <p className="text-sm text-[var(--text-secondary)]">{quote.customer.phone}</p>
                  )}
                </div>
                <div className="text-right space-y-1.5">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Issue Date: </span>
                    <span className="text-sm text-[var(--text-secondary)]">{formatDate(quote.issueDate)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Valid Until: </span>
                    <span className={`text-sm ${isExpired ? "text-[var(--state-danger)] font-medium" : "text-[var(--text-secondary)]"}`}>
                      {formatDate(quote.validUntil)}
                      {isExpired && " (Expired)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="px-6 pb-5 sm:px-8">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[var(--brand-cta)]">
                      <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Description</th>
                      <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Qty</th>
                      <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Unit Price</th>
                      <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tax %</th>
                      <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-soft)]">
                    {quote.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 text-sm text-[var(--text-primary)]">{item.description}</td>
                        <td className="py-3 text-right text-sm text-[var(--text-secondary)]">{item.quantity}</td>
                        <td className="py-3 text-right text-sm text-[var(--text-secondary)]">{formatCurrency(item.unitPrice, quote.currency)}</td>
                        <td className="py-3 text-right text-sm text-[var(--text-secondary)]">{item.taxRate}%</td>
                        <td className="py-3 text-right text-sm font-medium text-[var(--text-primary)]">{formatCurrency(item.amount, quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t border-[var(--border-default)] px-6 py-6 sm:px-8">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Subtotal</span>
                      <span className="text-[var(--text-secondary)]">{formatCurrency(quote.subtotal, quote.currency)}</span>
                    </div>
                    {quote.taxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Tax</span>
                        <span className="text-[var(--text-secondary)]">{formatCurrency(quote.taxAmount, quote.currency)}</span>
                      </div>
                    )}
                    {quote.discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Discount</span>
                        <span className="text-[var(--text-secondary)]">−{formatCurrency(quote.discountAmount, quote.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[var(--border-default)] pt-2">
                      <span className="text-base font-semibold text-[var(--text-primary)]">Total</span>
                      <span className="text-base font-bold text-[var(--brand-cta)]">
                        {formatCurrency(quote.totalAmount, quote.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {(quote.notes || quote.termsAndConditions) && (
                <div className="border-t border-[var(--border-soft)] px-6 py-5 sm:px-8 grid grid-cols-2 gap-6">
                  {quote.notes && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</h3>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">{quote.notes}</p>
                    </div>
                  )}
                  {quote.termsAndConditions && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Terms & Conditions</h3>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">{quote.termsAndConditions}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="w-full shrink-0 lg:w-80 space-y-4">
            <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)] space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Quote Details</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Status</span>
                  <StatusBadge variant={statusVariant}>{displayStatus}</StatusBadge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Currency</span>
                  <span className="text-[var(--text-primary)]">{quote.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Created</span>
                  <span className="text-[var(--text-primary)]">{formatDate(quote.createdAt)}</span>
                </div>
                {quote.acceptedAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Accepted</span>
                    <span className="text-[var(--state-success)]">{formatDate(quote.acceptedAt)}</span>
                  </div>
                )}
                {quote.declinedAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Declined</span>
                    <span className="text-[var(--state-danger)]">{formatDate(quote.declinedAt)}</span>
                  </div>
                )}
                {quote.declineReason && (
                  <div>
                    <span className="text-[var(--text-muted)] block mb-1">Decline Reason</span>
                    <p className="text-sm text-[var(--state-danger)] bg-[var(--state-danger-soft)] rounded-lg px-3 py-2">{quote.declineReason}</p>
                  </div>
                )}
                {quote.convertedInvoiceId && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Invoice</span>
                    <Link
                      href={`/app/docs/invoices/${quote.convertedInvoiceId}`}
                      className="text-[var(--brand-primary)] hover:underline transition-colors"
                    >
                      View Invoice →
                    </Link>
                  </div>
                )}
              </div>

              {/* Public Link */}
              {quote.publicToken && quote.status !== "DRAFT" && (
                <div className="border-t border-[var(--border-soft)] pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Public Link</h4>
                  <p className="text-xs text-[var(--text-muted)] break-all bg-[var(--surface-subtle)] rounded-lg p-2.5">
                    {process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app"}/quote/{quote.publicToken}
                  </p>
                </div>
              )}
            </div>

            <DocumentAttachments docId={quote.id} docType="quote" attachments={attachments} />
          </aside>
        </div>

        {/* Quote lifecycle timeline */}
        <div className="rounded-xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
          <DocumentTimeline events={events} title="History" />
        </div>
      </div>
    </div>
  );
}
