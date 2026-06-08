import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalQuoteDetail } from "../../actions";
import { QuoteResponseActions } from "./quote-response-actions";

export const metadata: Metadata = {
  title: "Quote Detail | Customer Portal",
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-slate-200 text-slate-500",
  CONVERTED: "bg-teal-100 text-teal-700",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

import { checkLegacyRouteRedirect } from "@/lib/portal-eligibility";

export default async function PortalQuoteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  await checkLegacyRouteRedirect(orgSlug, `/quotes/${id}`);

  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  const result = await getPortalQuoteDetail(orgSlug, id);

  if (!result.success) {
    if (result.error === "not_found") notFound();
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-red-700">
        <p>Error: {result.error}</p>
      </div>
    );
  }

  const { data: quote } = result;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/quotes`} className="hover:text-slate-700">
          Quotes
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-800">#{quote.quoteNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{quote.title}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${QUOTE_STATUS_COLORS[quote.status] ?? "bg-slate-100 text-slate-700"}`}
            >
              {quote.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Quote #{quote.quoteNumber} · Issued {formatDate(quote.issueDate)} · Valid until{" "}
            <span className={quote.status === "SENT" && new Date(quote.validUntil) < new Date() ? "text-red-600 font-medium" : ""}>
              {formatDate(quote.validUntil)}
            </span>
          </p>
        </div>
      </div>

      {/* Accepted / Declined notice */}
      {quote.status === "ACCEPTED" && quote.acceptedAt && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          ✓ You accepted this quote on {formatDate(quote.acceptedAt)}.
        </div>
      )}
      {quote.status === "DECLINED" && quote.declinedAt && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
          You declined this quote on {formatDate(quote.declinedAt)}.
          {quote.declineReason && (
            <p className="mt-1 text-slate-600">Reason: {quote.declineReason}</p>
          )}
        </div>
      )}
      {quote.status === "CONVERTED" && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-800">
          This quote was accepted and converted to an invoice.
        </div>
      )}

      {/* Line Items */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Quote line items">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Qty
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Unit Price
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Tax
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {quote.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3 text-slate-700">{item.description}</td>
                  <td className="px-6 py-3 text-right text-slate-600">{item.quantity}</td>
                  <td className="px-6 py-3 text-right text-slate-600">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-600">
                    {item.taxRate > 0 ? `${item.taxRate}%` : "—"}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-slate-900">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-slate-100 px-6 py-4">
          <dl className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-medium text-slate-900">
                {formatCurrency(quote.subtotal)}
              </dd>
            </div>
            {quote.discountAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Discount</dt>
                <dd className="font-medium text-green-700">
                  − {formatCurrency(quote.discountAmount)}
                </dd>
              </div>
            )}
            {quote.taxAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax</dt>
                <dd className="font-medium text-slate-900">
                  {formatCurrency(quote.taxAmount)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">Total</dt>
              <dd className="text-lg font-bold text-slate-900">
                {formatCurrency(quote.totalAmount)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notes / T&C */}
      {(quote.notes || quote.termsAndConditions) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {quote.notes && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Notes</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
          {quote.termsAndConditions && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Terms &amp; Conditions
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {quote.termsAndConditions}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Response Actions — only shown when canRespond */}
      {quote.canRespond && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Your Response
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Please review the quote and let us know your decision before{" "}
            {formatDate(quote.validUntil)}.
          </p>
          <QuoteResponseActions orgSlug={orgSlug} quoteId={quote.id} />
        </div>
      )}
    </div>
  );
}
