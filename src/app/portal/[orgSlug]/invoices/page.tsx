import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

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

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await checkLegacyRouteRedirect(orgSlug, "/invoices");

  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { not: "DRAFT" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      remainingAmount: true,
      status: true,
    },
  });

  await db.customerPortalAccessLog.create({
    data: {
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/invoices`,
    },
  });

  const invoiceRows = invoices.map((invoice) => ({
    ...invoice,
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    amountPaid: toAccountingNumber(invoice.amountPaid),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            View and manage all your invoices
          </p>
        </div>
      </div>

      {invoiceRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-900">No invoices</h2>
          <p className="mt-1 text-sm text-slate-500">
            You don&apos;t have any invoices yet.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="All invoices">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Invoice #</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                  <th className="hidden px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Due Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="hidden px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Remaining</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoiceRows.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/portal/${orgSlug}/invoices/${inv.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        #{inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{inv.invoiceDate}</td>
                    <td className="hidden px-6 py-4 text-slate-600 sm:table-cell">
                      {inv.dueDate || "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-700"}`}>
                        {inv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="hidden px-6 py-4 text-right text-slate-600 sm:table-cell">
                      {inv.remainingAmount > 0
                        ? formatCurrency(inv.remainingAmount)
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/portal/${orgSlug}/invoices/${inv.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View →
                      </Link>
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
