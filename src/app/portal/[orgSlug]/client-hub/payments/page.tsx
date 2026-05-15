import Link from "next/link";
import { MOCK_PAYMENTS, MOCK_INVOICES, OUTSTANDING_BALANCE, TOTAL_PAID } from "../components/mock-data";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function ClientHubPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const unpaidInvoices = MOCK_INVOICES.filter((i) => i.status !== "PAID");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">Your payment history and outstanding balances</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Paid</p>
          <p className="mt-2 text-2xl font-bold text-green-700">{formatCurrency(TOTAL_PAID)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Outstanding</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">{formatCurrency(OUTSTANDING_BALANCE)}</p>
        </div>
      </div>

      {/* Outstanding invoices */}
      {unpaidInvoices.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Outstanding Invoices</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {unpaidInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">#{inv.invoiceNumber}</p>
                  {inv.dueDate && <p className="text-xs text-slate-400">Due: {inv.dueDate}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-orange-700">{formatCurrency(inv.remainingAmount || inv.totalAmount)}</span>
                  <Link
                    href={`/portal/${orgSlug}/client-hub/invoices/${inv.id}`}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Payment History</h2>
        </div>
        {MOCK_PAYMENTS.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {MOCK_PAYMENTS.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">Invoice #{payment.invoiceNumber}</p>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Settled
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{payment.paidAt}</span>
                    <span>·</span>
                    <span>{payment.method}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-green-700">+{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
