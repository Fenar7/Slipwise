import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableRow,
  FinanceTableCell,
  FinanceTableEmpty,
} from "@/components/ui/finance-table";
import { getBooksVendorBill, getBooksVendorBillFormOptions } from "../../actions";
import { VendorBillAttachmentDownloadButton } from "../../components/vendor-bill-attachment-download-button";
import { VendorBillAttachmentForm } from "../../components/vendor-bill-attachment-form";
import { VendorBillDetailActions } from "../../components/vendor-bill-detail-actions";
import { VendorBillForm } from "../../components/vendor-bill-form";
import { VendorBillPaymentForm } from "../../components/vendor-bill-payment-form";
import { booksStatusBadgeVariant, formatBooksDate, formatBooksMoney } from "../../view-helpers";

export const metadata = {
  title: "Vendor Bill Detail | Slipwise",
};

interface VendorBillDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorBillDetailPage({ params }: VendorBillDetailPageProps) {
  const { id } = await params;
  const [billResult, optionsResult] = await Promise.all([
    getBooksVendorBill(id),
    getBooksVendorBillFormOptions(),
  ]);

  if (!billResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {billResult.error}
        </div>
      </div>
    );
  }

  if (!optionsResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {optionsResult.error}
        </div>
      </div>
    );
  }

  const bill = billResult.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/app/books/vendor-bills"
            className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            ← Back to Vendor Bills
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{bill.billNumber}</h1>
            <Badge variant={booksStatusBadgeVariant(bill.status)}>{bill.status.replaceAll("_", " ")}</Badge>
            <Badge variant={booksStatusBadgeVariant(bill.accountingStatus)}>{bill.accountingStatus}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {bill.vendor?.name ?? "Unassigned vendor"} • Bill {formatBooksDate(bill.billDate)} • Due{" "}
            {formatBooksDate(bill.dueDate)}
          </p>
        </div>

        <VendorBillDetailActions
          vendorBillId={bill.id}
          status={bill.status}
          accountingStatus={bill.accountingStatus}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Subtotal", value: formatBooksMoney(bill.subtotalAmount) },
          { label: "Tax", value: formatBooksMoney(bill.taxAmount) },
          { label: "Paid", value: formatBooksMoney(bill.amountPaid) },
          { label: "Remaining", value: formatBooksMoney(bill.remainingAmount) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.label}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {bill.status === "DRAFT" ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Edit draft bill</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Draft bills remain editable until they enter the approval workflow.
            </p>
          </CardHeader>
          <CardContent>
            <VendorBillForm
              vendorBillId={bill.id}
              vendors={optionsResult.data.vendors}
              expenseAccounts={optionsResult.data.expenseAccounts}
              defaultValues={{
                vendorId: bill.vendorId,
                expenseAccountId: bill.expenseAccountId,
                billDate: bill.billDate,
                dueDate: bill.dueDate,
                currency: bill.currency,
                notes: bill.notes,
                lines: bill.lines.map((line) => ({
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  taxRate: line.taxRate,
                })),
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Bill summary</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                AP document detail, tax values, and approval state.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Vendor</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">{bill.vendor?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Expense account</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">
                    {bill.expenseAccount ? `${bill.expenseAccount.code} — ${bill.expenseAccount.name}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Currency</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">{bill.currency}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Posted at</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">{formatBooksDate(bill.postedAt)}</dd>
                </div>
              </dl>

              {bill.notes && (
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{bill.notes}</p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-[var(--surface-subtle)] p-4 text-sm">
                  <p className="font-medium text-[var(--text-primary)]">GST totals</p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    CGST {formatBooksMoney(bill.gstTotalCgst)} • SGST {formatBooksMoney(bill.gstTotalSgst)}
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    IGST {formatBooksMoney(bill.gstTotalIgst)} • Cess {formatBooksMoney(bill.gstTotalCess)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-subtle)] p-4 text-sm">
                  <p className="font-medium text-[var(--text-primary)]">Approval activity</p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    {bill.approvalRequests.length} request{bill.approvalRequests.length === 1 ? "" : "s"} logged
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {bill.remainingAmount > 0 &&
              ["APPROVED", "OVERDUE", "PARTIALLY_PAID"].includes(bill.status) && (
                <VendorBillPaymentForm vendorBillId={bill.id} maxAmount={bill.remainingAmount} />
              )}

            <VendorBillAttachmentForm vendorBillId={bill.id} />
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Bill lines</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Line-level expense mapping and tax basis.</p>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Description</FinanceTableHead>
              <FinanceTableHead align="right">Qty</FinanceTableHead>
              <FinanceTableHead align="right">Unit Price</FinanceTableHead>
              <FinanceTableHead align="right">Tax %</FinanceTableHead>
              <FinanceTableHead align="right">Line Total</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {bill.lines.map((line) => (
                <FinanceTableRow key={line.id}>
                  <FinanceTableCell variant="primary">{line.description}</FinanceTableCell>
                  <FinanceTableCell align="right">{line.quantity}</FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {formatBooksMoney(line.unitPrice)}
                  </FinanceTableCell>
                  <FinanceTableCell align="right">{line.taxRate.toFixed(2)}%</FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {formatBooksMoney(line.lineTotal)}
                  </FinanceTableCell>
                </FinanceTableRow>
              ))}
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Payments</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Partial and full settlements linked to this bill.</p>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <FinanceTable>
              <FinanceTableHeader>
                <FinanceTableHead>Date</FinanceTableHead>
                <FinanceTableHead align="right">Amount</FinanceTableHead>
                <FinanceTableHead>Method</FinanceTableHead>
                <FinanceTableHead>Run</FinanceTableHead>
              </FinanceTableHeader>
              <FinanceTableBody>
                {bill.payments.length === 0 ? (
                  <FinanceTableEmpty colSpan={4} message="No payments recorded yet." />
                ) : (
                  bill.payments.map((payment) => (
                    <FinanceTableRow key={payment.id}>
                      <FinanceTableCell>{formatBooksDate(payment.paidAt)}</FinanceTableCell>
                      <FinanceTableCell align="right" variant="numeric">
                        {formatBooksMoney(payment.amount)}
                      </FinanceTableCell>
                      <FinanceTableCell>{payment.method ?? "—"}</FinanceTableCell>
                      <FinanceTableCell>
                        {payment.paymentRun ? payment.paymentRun.runNumber : "Manual"}
                      </FinanceTableCell>
                    </FinanceTableRow>
                  ))
                )}
              </FinanceTableBody>
            </FinanceTable>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Attachments</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Source evidence and audit-ready bill documents.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {bill.attachments.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
                No attachments uploaded yet.
              </div>
            ) : (
              bill.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{attachment.fileName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {attachment.mimeType} • {Math.max(1, Math.round(attachment.size / 1024))} KB •{" "}
                      {formatBooksDate(attachment.createdAt)}
                    </p>
                  </div>
                  <VendorBillAttachmentDownloadButton attachmentId={attachment.id} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
