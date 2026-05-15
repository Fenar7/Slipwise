import Link from "next/link";
import { MOCK_QUOTES } from "../components/mock-data";

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

export default async function ClientHubQuotesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
        <p className="mt-1 text-sm text-slate-500">Review and respond to quotes from us</p>
      </div>

      {MOCK_QUOTES.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          <p className="text-base font-medium text-slate-700">No quotes yet</p>
          <p className="mt-1 text-sm text-slate-400">Quotes sent to you will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Quotes list">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Quote #</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Title</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Issued</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Valid Until</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_QUOTES.map((quote) => (
                  <tr key={quote.id} className="group hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="font-medium hub-accent-text hover:underline">
                        #{quote.quoteNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="hover:text-slate-900">
                        {quote.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{quote.issueDate}</td>
                    <td className="px-6 py-4 text-slate-500">{quote.validUntil}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatCurrency(quote.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[quote.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {quote.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
