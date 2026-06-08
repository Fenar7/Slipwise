import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  netbanking: "Net Banking",
  upi: "UPI",
  wallet: "Wallet",
  emi: "EMI",
  bank_transfer: "Bank Transfer",
  admin_manual: "Manual",
  public_proof: "Proof Upload",
  razorpay_payment_link: "Payment Link",
  smart_collect: "Smart Collect",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

import { checkLegacyRouteRedirect } from "@/lib/portal-eligibility";

export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await checkLegacyRouteRedirect(orgSlug, "/payments");

  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  // IDOR: all queries are scoped to this customer + org
  const [payments, unpaidInvoices] = await Promise.all([
    db.invoicePayment.findMany({
      where: {
        orgId: session.orgId,
        invoice: { customerId: session.customerId },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        method: true,
        source: true,
        status: true,
        externalPaymentId: true,
        paymentMethodDisplay: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
          },
        },
      },
    }),
    db.invoice.findMany({
      where: {
        organizationId: session.orgId,
        customerId: session.customerId,
        status: { in: ["ISSUED", "DUE", "OVERDUE", "PARTIALLY_PAID"] },
        archivedAt: null,
      },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        remainingAmount: true,
        status: true,
        dueDate: true,
        razorpayPaymentLinkUrl: true,
        paymentLinkStatus: true,
        paymentLinkExpiresAt: true,
      },
    }),
  ]);

  const paymentRows = payments.map((payment) => ({
    ...payment,
    amount: toAccountingNumber(payment.amount),
    invoice: payment.invoice
      ? {
          ...payment.invoice,
          totalAmount: toAccountingNumber(payment.invoice.totalAmount),
        }
      : null,
  }));
  const unpaidInvoiceRows = unpaidInvoices.map((invoice) => ({
    ...invoice,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
  }));

  const totalPaid = paymentRows
    .filter((payment) => payment.status === "SETTLED")
    .reduce((sum, payment) => sum + payment.amount, 0);

  const totalOutstanding = unpaidInvoiceRows.reduce(
    (sum, invoice) => sum + (invoice.remainingAmount || invoice.totalAmount),
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">Your payment history and outstanding balances.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Paid</p>
          <p className="mt-2 text-2xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Outstanding</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">{formatCurrency(totalOutstanding)}</p>
        </div>
      </div>

      {/* Outstanding invoices with Pay Now */}
      {unpaidInvoiceRows.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Outstanding Invoices</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {unpaidInvoiceRows.map((inv) => {
              const hasActiveLink =
                inv.razorpayPaymentLinkUrl &&
                inv.paymentLinkStatus &&
                ["created", "partially_paid"].includes(inv.paymentLinkStatus) &&
                (!inv.paymentLinkExpiresAt || inv.paymentLinkExpiresAt > new Date());

              return (
                <div key={inv.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">#{inv.invoiceNumber}</p>
                    {inv.dueDate && (
                      <p className="text-xs text-slate-400">
                        Due: {inv.dueDate}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-orange-700">
                      {formatCurrency(inv.remainingAmount || inv.totalAmount)}
                    </span>
                    {hasActiveLink ? (
                      <a
                        href={inv.razorpayPaymentLinkUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Pay Now
                      </a>
                    ) : (
                      <Link
                        href={`/portal/${orgSlug}/invoices/${inv.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Payment History</h2>
        </div>
        {paymentRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paymentRows.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {payment.invoice ? `Invoice #${payment.invoice.invoiceNumber}` : "Payment"}
                    </p>
                    {payment.status === "SETTLED" ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Settled
                      </span>
                    ) : payment.status === "PENDING_REVIEW" ? (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Pending Review
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{new Date(payment.paidAt).toLocaleDateString("en-IN")}</span>
                    {payment.method && (
                      <>
                        <span>·</span>
                        <span>{METHOD_LABELS[payment.source] ?? METHOD_LABELS[payment.method ?? ""] ?? payment.method}</span>
                      </>
                    )}
                    {payment.externalPaymentId && (
                      <>
                        <span>·</span>
                        <span className="font-mono">{payment.externalPaymentId}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold text-green-700">
                  +{formatCurrency(payment.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
