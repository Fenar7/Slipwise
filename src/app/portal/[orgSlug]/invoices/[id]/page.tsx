import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import { PortalPayButton } from "./pay-button";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-700",
  VIEWED: "bg-purple-100 text-purple-700",
  DUE: "bg-yellow-100 text-yellow-700",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  DISPUTED: "bg-pink-100 text-pink-700",
  CANCELLED: "bg-slate-200 text-slate-500",
  REISSUED: "bg-indigo-100 text-indigo-700",
  ARRANGEMENT_MADE: "bg-teal-100 text-teal-700",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

import { checkLegacyRouteRedirect } from "@/lib/portal-eligibility";

export default async function PortalInvoiceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  await checkLegacyRouteRedirect(orgSlug, `/invoices/${id}`);

  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  // IDOR prevention: verify invoice belongs to this customer + org
  const invoice = await db.invoice.findFirst({
    where: {
      id,
      organizationId: session.orgId,
      customerId: session.customerId,
    },
    include: {
      lineItems: true,
      payments: {
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          method: true,
          note: true,
          paymentMethodDisplay: true,
        },
      },
      organization: { select: { name: true } },
      customer: { select: { name: true, email: true, phone: true } },
    },
  });

  if (!invoice) notFound();

  await db.customerPortalAccessLog.create({
    data: {
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/invoices/${id}`,
    },
  });

  const invoiceView = {
    ...invoice,
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    amountPaid: toAccountingNumber(invoice.amountPaid),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
    lineItems: invoice.lineItems.map((item) => ({
      ...item,
      unitPrice: toAccountingNumber(item.unitPrice),
      amount: toAccountingNumber(item.amount),
      taxRate: toAccountingNumber(item.taxRate),
    })),
    payments: invoice.payments.map((payment) => ({
      ...payment,
      amount: toAccountingNumber(payment.amount),
    })),
  };

  const isPaid = invoiceView.status === "PAID";
  const showPayButton =
    !isPaid && invoiceView.status !== "CANCELLED" && invoiceView.remainingAmount > 0;

  const rawFormData = invoice.formData as Record<string, unknown> | null;
  const branding = (rawFormData?.branding ?? null) as {
    accentColor?: string;
  } | null;
  const accentColor = branding?.accentColor || "#2563eb";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/portal/${orgSlug}/invoices`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Invoices
      </Link>

      {/* Invoice Header */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-1" style={{ backgroundColor: accentColor }} />
        <div className="px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">
                 Invoice #{invoiceView.invoiceNumber ?? "Draft"}
               </h1>
               <p className="mt-1 text-sm text-slate-500">
                 {invoiceView.organization.name}
               </p>
             </div>
             <div className="flex items-center gap-3">
               <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[invoiceView.status] || "bg-slate-100 text-slate-700"}`}>
                 {invoiceView.status.replace(/_/g, " ")}
               </span>
              {showPayButton && (
                <PortalPayButton orgSlug={orgSlug} invoiceId={id} />
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Date</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{invoiceView.invoiceDate}</p>
            </div>
            {invoiceView.dueDate && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Due Date</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{invoiceView.dueDate}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(invoiceView.totalAmount)}</p>
            </div>
            {invoiceView.remainingAmount > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Remaining</p>
                <p className="mt-1 text-sm font-bold text-orange-600">{formatCurrency(invoiceView.remainingAmount)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="border-t border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Invoice line items">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:px-8">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Unit Price</th>
                  <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Tax %</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:px-8">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoiceView.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-slate-900 sm:px-8">{item.description}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                    <td className="hidden px-4 py-3 text-right text-slate-600 sm:table-cell">{item.taxRate}%</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900 sm:px-8">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total Row */}
          <div className="border-t border-slate-200 px-6 py-4 sm:px-8">
            <div className="flex justify-end">
              <div className="w-56 space-y-2">
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="font-bold" style={{ color: accentColor }}>
                    {formatCurrency(invoiceView.totalAmount)}
                  </span>
                </div>
                {invoiceView.amountPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Paid</span>
                    <span className="font-medium text-green-700">{formatCurrency(invoiceView.amountPaid)}</span>
                  </div>
                )}
                {invoiceView.remainingAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Remaining</span>
                    <span className="font-medium text-orange-700">{formatCurrency(invoiceView.remainingAmount)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 sm:px-8">
          <h2 className="text-base font-semibold text-slate-900">
            Payment History
          </h2>
        </div>

        {invoiceView.payments.length === 0 ? (
          <div className="px-6 py-10 text-center sm:px-8">
            <p className="text-sm text-slate-500">No payments recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Payment history">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-8">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Amount</th>
                  <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">Method</th>
                  <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoiceView.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-3 text-slate-600 sm:px-8">
                      {new Date(payment.paidAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                      {payment.paymentMethodDisplay || payment.method || "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">
                      {payment.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
