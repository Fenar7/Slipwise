import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockQuote } from "../../components/mock-data";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-slate-200 text-slate-500",
  CONVERTED: "bg-teal-100 text-teal-700",
};

interface ClientHubQuoteDetailPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function ClientHubQuoteDetailPage({ params }: ClientHubQuoteDetailPageProps) {
  const { orgSlug, id } = await params;
  const quote = getMockQuote(id);

  if (!quote) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="hover:text-slate-700">
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
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[quote.status] ?? "bg-slate-100 text-slate-700"}`}>
              {quote.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Quote #{quote.quoteNumber} · Issued {quote.issueDate} · Valid until {quote.validUntil}
          </p>
        </div>
      </div>

      {/* Status notice */}
      {quote.status === "ACCEPTED" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          You accepted this quote.
        </div>
      )}
      {quote.status === "DECLINED" && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
          You declined this quote.
        </div>
      )}

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Quote Summary</h2>
        </div>
        <div className="px-6 py-5">
          <dl className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Total</dt>
              <dd className="font-medium text-slate-900">{formatCurrency(quote.totalAmount)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Response Actions */}
      {quote.canRespond && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Your Response</h2>
          <p className="mb-4 text-sm text-slate-500">
            Please review the quote and let us know your decision before {quote.validUntil}.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white opacity-50 cursor-not-allowed"
              title="Accept action coming in a later phase"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Accept Quote
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 opacity-50 cursor-not-allowed"
              title="Decline action coming in a later phase"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Decline
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">Quote response will be enabled in a future phase. This is a static preview.</p>
        </div>
      )}
    </div>
  );
}
