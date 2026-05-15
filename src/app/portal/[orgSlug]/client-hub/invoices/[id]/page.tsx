import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockInvoice } from "../../components/mock-data";

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
};

interface ClientHubInvoiceDetailPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function ClientHubInvoiceDetailPage({ params }: ClientHubInvoiceDetailPageProps) {
  const { orgSlug, id } = await params;
  const invoice = getMockInvoice(id);

  if (!invoice) notFound();

  const showPayButton = invoice.status !== "PAID" && invoice.remainingAmount > 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Invoices
      </Link>

      {/* Invoice Header */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-1 hub-accent-bg" />
        <div className="px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Invoice #{invoice.invoiceNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">{invoice.description || "Professional services"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[invoice.status] || "bg-slate-100 text-slate-700"}`}>
                {invoice.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Date</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{invoice.invoiceDate}</p>
            </div>
            {invoice.dueDate && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Due Date</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{invoice.dueDate}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(invoice.totalAmount)}</p>
            </div>
            {invoice.remainingAmount > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Remaining</p>
                <p className="mt-1 text-sm font-bold text-red-600">{formatCurrency(invoice.remainingAmount)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Selection Shell */}
      {showPayButton && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Payment Options</h2>
          <p className="mt-1 text-sm text-slate-500">Select a payment method to settle this invoice.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["Card (Razorpay)", "UPI", "Bank Transfer"].map((method) => (
              <button
                key={method}
                type="button"
                disabled
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 opacity-60 cursor-not-allowed"
                title="Payment integration coming in a later phase"
              >
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                {method}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Payment processing will be enabled in a future phase. This is a static preview.
          </div>
        </div>
      )}

      {/* Paid notice */}
      {invoice.status === "PAID" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          This invoice has been paid in full. Thank you.
        </div>
      )}
    </div>
  );
}
