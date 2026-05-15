import Link from "next/link";
import {
  MOCK_INVOICES,
  MOCK_QUOTES,
  OUTSTANDING_BALANCE,
  PENDING_INVOICES_COUNT,
  PENDING_QUOTES_COUNT,
} from "./components/mock-data";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

const STATUS_COLORS: Record<string, string> = {
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700",
  OVERDUE: "bg-red-100 text-red-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
};

export default async function ClientHubDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const pendingInvoices = MOCK_INVOICES.filter((i) => i.status !== "PAID");
  const pendingQuotes = MOCK_QUOTES.filter((q) => q.status === "SENT");

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome to your Client Hub</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review invoices, respond to quotes, and stay on top of your account
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Outstanding Balance</p>
          <p className={`mt-2 text-2xl font-bold ${OUTSTANDING_BALANCE > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(OUTSTANDING_BALANCE)}
          </p>
          {PENDING_INVOICES_COUNT > 0 && (
            <p className="mt-1 text-xs font-medium text-red-500">{PENDING_INVOICES_COUNT} pending</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Invoices</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{PENDING_INVOICES_COUNT}</p>
          <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="mt-2 inline-flex text-xs font-medium hub-accent-text hover:underline">
            View invoices →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Quotes</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{PENDING_QUOTES_COUNT}</p>
          <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="mt-2 inline-flex text-xs font-medium hub-accent-text hover:underline">
            Review quotes →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Quick Actions</p>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href={`/portal/${orgSlug}/client-hub/invoices`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0h3m-3 0h-3m2.25 0H9.75m0 0H6.75m11.25-12H9.75" />
              </svg>
              View Invoices
            </Link>
            <Link
              href={`/portal/${orgSlug}/client-hub/quotes`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
              Review Quotes
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Recent Invoices</h2>
          <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="text-xs font-medium hub-accent-text hover:underline">
            View All →
          </Link>
        </div>
        {MOCK_INVOICES.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">No invoices yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Recent invoices">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Invoice #</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Date</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_INVOICES.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="group">
                    <td className="px-6 py-3">
                      <Link href={`/portal/${orgSlug}/client-hub/invoices/${inv.id}`} className="font-medium hub-accent-text hover:underline">
                        #{inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{inv.invoiceDate}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{formatCurrency(inv.totalAmount)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {inv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Quotes */}
      {pendingQuotes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Quotes Awaiting Your Response</h2>
            <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="text-xs font-medium hub-accent-text hover:underline">
              View All →
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingQuotes.map((quote) => (
              <div key={quote.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{quote.title}</p>
                  <p className="text-xs text-slate-500">
                    #{quote.quoteNumber} · Valid until {quote.validUntil}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(quote.totalAmount)}</span>
                  <Link
                    href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`}
                    className="inline-flex rounded-lg hub-accent-bg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
