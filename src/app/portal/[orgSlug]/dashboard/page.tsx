import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession, logPortalAccess } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

const INVOICE_STATUS_COLORS: Record<string, string> = {
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

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await checkLegacyRouteRedirect(orgSlug, "");

  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  const now = new Date();

  const [
    customer,
    orgDefaults,
    recentInvoices,
    outstandingAgg,
    overdueCount,
    openTicketsCount,
    pendingQuotesCount,
  ] = await Promise.all([
    db.customer.findUnique({
      where: { id: session.customerId },
      select: { name: true, email: true },
    }),
    db.orgDefaults.findUnique({
      where: { organizationId: session.orgId },
      select: { portalQuoteAcceptanceEnabled: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId: session.orgId,
        customerId: session.customerId,
        status: { not: "DRAFT" },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        totalAmount: true,
        remainingAmount: true,
        status: true,
      },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: session.orgId,
        customerId: session.customerId,
        status: { notIn: ["DRAFT", "PAID", "CANCELLED"] },
      },
      _sum: { remainingAmount: true },
    }),
    db.invoice.count({
      where: {
        organizationId: session.orgId,
        customerId: session.customerId,
        status: "OVERDUE",
      },
    }),
    db.invoiceTicket.count({
      where: {
        orgId: session.orgId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        invoice: { customerId: session.customerId },
      },
    }),
    db.quote.count({
      where: {
        orgId: session.orgId,
        customerId: session.customerId,
        status: "SENT",
        validUntil: { gte: now },
      },
    }),
  ]);

  const outstandingBalance = toAccountingNumber(outstandingAgg._sum.remainingAmount ?? 0);
  const recentInvoiceRows = recentInvoices.map((invoice) => ({
    ...invoice,
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
  }));

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/dashboard`,
    action: "view_dashboard",
  });

  const showQuotes = orgDefaults?.portalQuoteAcceptanceEnabled ?? false;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {customer?.name || "Customer"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s an overview of your account
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Outstanding Balance */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Outstanding Balance
          </p>
          <p className={`mt-2 text-2xl font-bold ${outstandingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(outstandingBalance)}
          </p>
          {overdueCount > 0 && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {overdueCount} overdue {overdueCount === 1 ? "invoice" : "invoices"}
            </p>
          )}
        </div>

        {/* Open Tickets */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Support Tickets
          </p>
          <p className={`mt-2 text-2xl font-bold ${openTicketsCount > 0 ? "text-amber-600" : "text-slate-700"}`}>
            {openTicketsCount}
          </p>
          <p className="mt-1 text-xs text-slate-400">open {openTicketsCount === 1 ? "ticket" : "tickets"}</p>
          <Link
            href={`/portal/${orgSlug}/tickets`}
            className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View tickets →
          </Link>
        </div>

        {/* Pending Quotes */}
        {showQuotes && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Pending Quotes
            </p>
            <p className={`mt-2 text-2xl font-bold ${pendingQuotesCount > 0 ? "text-blue-600" : "text-slate-700"}`}>
              {pendingQuotesCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">awaiting response</p>
            <Link
              href={`/portal/${orgSlug}/quotes`}
              className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View quotes →
            </Link>
          </div>
        )}

        {/* Account */}
        <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${showQuotes ? "" : "sm:col-span-2 lg:col-span-1"}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
            Account
          </p>
          <p className="text-sm font-semibold text-slate-900">{customer?.name}</p>
          {customer?.email && (
            <p className="text-sm text-slate-500">{customer.email}</p>
          )}
          <Link
            href={`/portal/${orgSlug}/profile`}
            className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Manage Profile →
          </Link>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Recent Invoices
          </h2>
          <Link
            href={`/portal/${orgSlug}/invoices`}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View All →
          </Link>
        </div>

        {recentInvoiceRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0h3m-3 0h-3m-2.25 0H9.75m0 0H6.75m11.25-12H9.75" />
            </svg>
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
                {recentInvoiceRows.map((inv) => (
                  <tr key={inv.id} className="group">
                    <td className="px-6 py-3">
                      <Link
                        href={`/portal/${orgSlug}/invoices/${inv.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        #{inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {inv.invoiceDate}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900">{formatCurrency(inv.totalAmount)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status] ?? "bg-slate-100 text-slate-700"}`}>
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
    </div>
  );
}
