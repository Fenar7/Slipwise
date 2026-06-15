"use client";

import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import { cn } from "@/lib/utils";
import type { InvoiceDocument } from "@/features/docs/invoice/types";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { InvoiceFormValues } from "@/features/docs/invoice/types";
import { normalizeInvoice } from "@/features/docs/invoice/utils/normalize-invoice";
import {
  InlineDateField,
  InlineNumberField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";

export function ClassicBorderedInvoiceTemplate({
  document,
  mode = "preview",
}: {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
}) {
  const printLike = mode !== "preview";

  if (mode === "edit") {
    return <ClassicBorderedEditor document={document} />;
  }

  const showBank =
    document.visibility.showBankDetails &&
    (document.bankName || document.bankAccountNumber || document.bankIfsc);

  const showUpi =
    document.visibility.showUpiDetails &&
    (document.upiId || document.upiQrDataUrl);

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      {/* ── Header ── */}
      <section className="document-break-inside-avoid border-b-2 border-[var(--voucher-ink)] pb-4">
        <div
          className={cn(
            "flex gap-6",
            printLike ? "flex-row items-start" : "flex-col md:flex-row md:items-start",
          )}
        >
          <div className="flex flex-1 items-start gap-3">
            <DocumentBrandMark
              branding={document.branding}
              className="flex h-14 w-14 shrink-0 items-center justify-center border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] p-1.5"
              initialsClassName="text-sm font-bold text-[var(--voucher-ink)]"
              imageClassName="h-full w-full object-cover"
            />
            <div>
              <h2 className="text-xl font-bold uppercase tracking-wide">
                {document.branding.salutation ? document.branding.salutation + " " : ""}
                {document.branding.companyName}
              </h2>
              <div className="mt-1 space-y-0.5 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]">
                {document.visibility.showAddress && document.branding.address ? (
                  <p className="whitespace-pre-line">{document.branding.address}</p>
                ) : null}
                {document.visibility.showEmail && document.branding.email ? (
                  <p>Email: {document.branding.email}</p>
                ) : null}
                {document.visibility.showPhone && document.branding.phone ? (
                  <p>Phone: {document.branding.phone}</p>
                ) : null}
                {document.website ? <p>{document.website}</p> : null}
                {document.businessTaxId ? (
                  <p className="font-medium">GSTIN: {document.businessTaxId}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.5)]">
              {document.title}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{document.invoiceNumber}</p>
          </div>
        </div>
      </section>

      {/* ── Two-column: From/Bill To + Invoice Details ── */}
      <section
        className={cn(
          "document-break-inside-avoid grid border-b border-[rgba(29,23,16,0.15)] py-5",
          printLike ? "grid-cols-[1.15fr_0.85fr] gap-6" : "gap-4 md:grid-cols-[1.15fr_0.85fr] md:gap-6",
        )}
      >
        <div className="space-y-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
              From
            </p>
            <p className="mt-1.5 text-sm font-semibold">
              {document.branding.salutation ? document.branding.salutation + " " : ""}
              {document.branding.companyName}
            </p>
            <div className="mt-1 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]">
              {document.visibility.showAddress && document.branding.address ? (
                <p className="whitespace-pre-line">{document.branding.address}</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
              Bill To
            </p>
            <p className="mt-1.5 text-sm font-semibold">{document.clientSalutation ? document.clientSalutation + " " : ""}{document.clientName}</p>
            <div className="mt-1 space-y-0.5 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]">
              {document.clientAddress ? <p className="whitespace-pre-line">{document.clientAddress}</p> : null}
              {document.clientEmail ? <p>{document.clientEmail}</p> : null}
              {document.clientPhone ? <p>{document.clientPhone}</p> : null}
              {document.clientTaxId ? <p>Tax ID: {document.clientTaxId}</p> : null}
            </div>
          </div>
        </div>

        {/* Invoice details grid */}
        <div className="border border-[rgba(29,23,16,0.2)]">
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Invoice Date
            </span>
            <span className="flex-1 px-3 py-2 text-sm font-medium">{document.invoiceDate}</span>
          </div>
          {document.dueDate ? (
            <div className="flex border-b border-[rgba(29,23,16,0.2)]">
              <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
                Due Date
              </span>
              <span className="flex-1 px-3 py-2 text-sm font-medium">{document.dueDate}</span>
            </div>
          ) : null}
          {document.placeOfSupply ? (
            <div className="flex border-b border-[rgba(29,23,16,0.2)]">
              <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
                Place of Supply
              </span>
              <span className="flex-1 px-3 py-2 text-sm font-medium">{document.placeOfSupply}</span>
            </div>
          ) : null}
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Grand Total
            </span>
            <span className="flex-1 px-3 py-2 text-sm font-bold">{document.grandTotalFormatted}</span>
          </div>
          <div className="flex">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--voucher-accent)]">
              Net Amount Payable
            </span>
            <span className="flex-1 px-3 py-2 text-sm font-bold text-[var(--voucher-accent)]">
              {document.balanceDueFormatted}
            </span>
          </div>
        </div>
      </section>

      {/* ── Shipping / Place of Supply (if any) ── */}
      {document.shippingAddress ? (
        <section className="document-break-inside-avoid border-b border-[rgba(29,23,16,0.15)] py-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
            Ship To
          </p>
          <p className="mt-1.5 text-sm leading-6 text-[rgba(29,23,16,0.78)] whitespace-pre-line">
            {document.shippingAddress}
          </p>
        </section>
      ) : null}

      {/* ── Line Items — tight bordered table ── */}
      <section className="py-5">
        <table className="w-full text-left text-[0.78rem]" style={{ borderCollapse: "collapse" }}>
          <thead className="document-table-head">
            <tr className="border border-[rgba(29,23,16,0.3)] bg-[rgba(29,23,16,0.06)] text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.6)]">
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5">S.No</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5">Description</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-center">Qty</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Rate</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Discount</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Tax</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((item, idx) => (
              <tr
                key={`${item.description}-${item.lineTotal}`}
                className={cn(
                  "document-table-row-avoid border border-[rgba(29,23,16,0.15)] align-top",
                  idx % 2 === 1 ? "bg-[rgba(29,23,16,0.025)]" : "",
                )}
              >
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-center text-[rgba(29,23,16,0.45)]">
                  {idx + 1}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-[rgba(29,23,16,0.85)]">
                  {item.description}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-center">
                  {item.quantity}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-right">
                  {item.unitPriceFormatted}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-right">
                  {item.discountAmountFormatted}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-right">
                  {item.taxAmountFormatted}
                </td>
                <td className="px-3 py-2 text-right font-medium">{item.lineTotalFormatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Summary — right-aligned bordered box ── */}
      <section
        className={cn(
          "document-break-inside-avoid grid gap-5",
          printLike ? "grid-cols-[1fr_16rem]" : "md:grid-cols-[1fr_16rem]",
        )}
      >
        <div>
          <p className="text-sm italic leading-6 text-[rgba(29,23,16,0.65)]">
            *{document.amountInWords}
          </p>
        </div>

        <div className="border border-[rgba(29,23,16,0.2)]">
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Subtotal</span>
            <span>{document.subtotalFormatted}</span>
          </div>
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Discount</span>
            <span>{document.totalDiscountFormatted}</span>
          </div>
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Tax</span>
            <span>{document.totalTaxFormatted}</span>
          </div>
          {document.extraCharges > 0 ? (
            <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
              <span className="text-[rgba(29,23,16,0.65)]">Extra Charges</span>
              <span>{document.extraChargesFormatted}</span>
            </div>
          ) : null}
          {document.invoiceLevelDiscount > 0 ? (
            <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
              <span className="text-[rgba(29,23,16,0.65)]">Invoice Discount</span>
              <span>{document.invoiceLevelDiscountFormatted}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.05)] px-3 py-2 text-sm font-bold">
            <span>Grand Total</span>
            <span>{document.grandTotalFormatted}</span>
          </div>
          {document.visibility.showPaymentSummary ? (
            <>
              {document.amountPaid > 0 ? (
                <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
                  <span className="text-[rgba(29,23,16,0.65)]">Paid</span>
                  <span>{document.amountPaidFormatted}</span>
                </div>
              ) : null}
              <div className="flex justify-between bg-[var(--voucher-accent)] px-3 py-2 text-sm font-bold text-white">
                <span>Net Amount Payable</span>
                <span>{document.balanceDueFormatted}</span>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* ── Notes & Terms ── */}
      {document.notes || document.terms ? (
        <section className="document-break-inside-avoid space-y-3 border-t border-[rgba(29,23,16,0.15)] pt-4">
          {document.notes ? (
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                Notes
              </p>
              <p className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.75)]">{document.notes}</p>
            </div>
          ) : null}
          {document.terms ? (
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                Terms &amp; Conditions*
              </p>
              <p className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.75)]">{document.terms}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Footer: Bank details/UPI left, Signature right ── */}
      {showBank || showUpi || (document.visibility.showSignature && (document.authorizedBy || document.authorizedByDesignation || document.authorizedByCompany)) ? (
        <section
          className={cn(
            "document-break-inside-avoid grid border-t-2 border-[var(--voucher-ink)] pt-4",
            printLike ? "grid-cols-2 gap-6" : "gap-4 md:grid-cols-2 md:gap-6",
          )}
        >
          {showBank || showUpi ? (
            <div className="space-y-4">
              {showBank ? (
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                    Bank Details
                  </p>
                  <div className="mt-2 space-y-1 text-sm leading-5 text-[rgba(29,23,16,0.78)]">
                    {document.bankName ? <p>Bank: {document.bankName}</p> : null}
                    {document.bankAccountNumber ? <p>A/C No: {document.bankAccountNumber}</p> : null}
                    {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
                  </div>
                </div>
              ) : null}
              {showUpi ? (
                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                    UPI Details
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    {document.upiQrDataUrl ? (
                      <img
                        src={document.upiQrDataUrl}
                        alt="UPI QR Code"
                        className="h-16 w-16 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white shrink-0"
                      />
                    ) : null}
                    {document.upiId ? (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[rgba(29,23,16,0.45)]">UPI ID</p>
                        <p className="text-sm font-semibold text-[rgba(29,23,16,0.9)] mt-0.5">{document.upiId}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div />
          )}

          {document.visibility.showSignature && (document.authorizedBy || document.authorizedByDesignation || document.authorizedByCompany) ? (
            <div className="text-right">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                Approved By
              </p>
              <div className="mt-8 inline-block border-t border-[rgba(29,23,16,0.3)] px-6 pt-2">
                {document.authorizedBy && <p className="text-sm font-semibold text-[rgba(29,23,16,0.85)]">{document.authorizedBy}</p>}
                {document.authorizedByDesignation && <p className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5">{document.authorizedByDesignation}</p>}
                {document.authorizedByCompany && <p className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5">{document.authorizedByCompany}</p>}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[rgba(29,23,16,0.4)] transition-colors hover:bg-red-50 hover:text-red-500"
      aria-label="Remove row"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-[var(--voucher-accent)] transition-opacity hover:opacity-75"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      {label}
    </button>
  );
}

function ClassicBorderedEditor({ document }: { document: InvoiceDocument }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      {/* ── Header ── */}
      <section className="border-b-2 border-[var(--voucher-ink)] pb-4">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex flex-1 items-start gap-3">
            <DocumentBrandMark
              branding={document.branding}
              className="flex h-14 w-14 shrink-0 items-center justify-center border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] p-1.5"
              initialsClassName="text-sm font-bold text-[var(--voucher-ink)]"
              imageClassName="h-full w-full object-cover"
            />
            <div>
              <div className="flex items-baseline gap-1">
                {document.branding.salutation ? (
                  <span className="text-sm font-bold uppercase tracking-wide text-[rgba(29,23,16,0.65)] shrink-0">
                    {document.branding.salutation}
                  </span>
                ) : null}
                <InlineTextField
                  name="branding.companyName"
                  className="text-xl font-bold uppercase tracking-wide flex-1"
                />
              </div>
              <InlineTextArea
                name="branding.address"
                className="mt-1 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
                placeholder="Business address"
              />
              <div className="flex items-center gap-1.5 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-[0.75rem] shrink-0">Email:</span>
                <InlineTextField
                  name="branding.email"
                  className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
                  placeholder="Business email"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-[0.75rem] shrink-0">Phone:</span>
                <InlineTextField
                  name="branding.phone"
                  className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
                  placeholder="Business phone"
                />
              </div>
              <InlineTextField
                name="website"
                className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
                placeholder="Website"
              />
              <InlineTextField
                name="businessTaxId"
                className="text-[0.78rem] font-medium leading-5 text-[rgba(29,23,16,0.7)]"
                placeholder="GSTIN"
              />
            </div>
          </div>

          <div className="text-right">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.5)]">
              {document.title}
            </p>
            <InlineTextField
              name="invoiceNumber"
              className="mt-1 text-xl font-semibold tracking-tight text-right"
            />
          </div>
        </div>
      </section>

      {/* ── Two-column: From/Bill To + Invoice Details ── */}
      <section className="grid gap-4 border-b border-[rgba(29,23,16,0.15)] py-5 md:grid-cols-[1.15fr_0.85fr] md:gap-6">
        <div className="space-y-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
              From
            </p>
            <div className="mt-1.5 flex items-baseline gap-1">
              {document.branding.salutation ? (
                <span className="text-xs font-semibold text-[rgba(29,23,16,0.65)] shrink-0">
                  {document.branding.salutation}
                </span>
              ) : null}
              <InlineTextField
                name="branding.companyName"
                className="text-sm font-semibold flex-1"
              />
            </div>
            <InlineTextArea
              name="branding.address"
              className="mt-1 text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
              placeholder="Business address"
            />
          </div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
              Bill To
            </p>
            <InlineTextField name="clientSalutation" placeholder="" className="mt-1.5 text-xs font-semibold text-[rgba(29,23,16,0.45)] w-12" />
            <InlineTextField
              name="clientName"
              className="mt-1.5 text-sm font-semibold"
              placeholder="Client name"
            />
            <InlineTextArea
              name="clientAddress"
              className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
              placeholder="Client address"
            />
            <InlineTextField
              name="clientEmail"
              className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
              placeholder="Client email"
            />
            <InlineTextField
              name="clientPhone"
              className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
              placeholder="Client phone"
            />
            <InlineTextField
              name="clientTaxId"
              className="text-[0.78rem] leading-5 text-[rgba(29,23,16,0.7)]"
              placeholder="Client Tax ID"
            />
          </div>
        </div>

        {/* Invoice details grid */}
        <div className="border border-[rgba(29,23,16,0.2)]">
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Invoice Date
            </span>
            <InlineDateField
              name="invoiceDate"
              className="flex-1 px-3 py-2 text-sm font-medium"
            />
          </div>
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Due Date
            </span>
            <InlineDateField
              name="dueDate"
              className="flex-1 px-3 py-2 text-sm font-medium"
            />
          </div>
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Place of Supply
            </span>
            <InlineTextField
              name="placeOfSupply"
              className="flex-1 px-3 py-2 text-sm font-medium"
              placeholder="Place of supply"
            />
          </div>
          <div className="flex border-b border-[rgba(29,23,16,0.2)]">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[rgba(29,23,16,0.55)]">
              Grand Total
            </span>
            <span className="flex-1 px-3 py-2 text-sm font-bold">{doc.grandTotalFormatted}</span>
          </div>
          <div className="flex">
            <span className="w-[45%] border-r border-[rgba(29,23,16,0.2)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--voucher-accent)]">
              Net Amount Payable
            </span>
            <span className="flex-1 px-3 py-2 text-sm font-bold text-[var(--voucher-accent)]">
              {doc.balanceDueFormatted}
            </span>
          </div>
        </div>
      </section>

      {/* ── Shipping ── */}
      {doc.visibility.showShippingAddress ? (
        <section className="border-b border-[rgba(29,23,16,0.15)] py-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[rgba(29,23,16,0.5)]">
            Ship To
          </p>
          <InlineTextArea
            name="shippingAddress"
            className="mt-1.5 text-sm leading-6 text-[rgba(29,23,16,0.78)]"
            placeholder="Shipping address"
          />
        </section>
      ) : null}

      {/* ── Line Items ── */}
      <section className="py-5">
        <table className="w-full text-left text-[0.78rem]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="border border-[rgba(29,23,16,0.3)] bg-[rgba(29,23,16,0.06)] text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.6)]">
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5">S.No</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5">Description</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-center">Qty</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Rate</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Discount</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Tax</th>
              <th className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr
                key={field.id}
                className={cn(
                  "border border-[rgba(29,23,16,0.15)] align-top",
                  index % 2 === 1 ? "bg-[rgba(29,23,16,0.025)]" : "",
                )}
              >
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-center text-[rgba(29,23,16,0.45)]">
                  {index + 1}
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2">
                  <InlineTextField
                    name={`lineItems.${index}.description`}
                    className="text-[rgba(29,23,16,0.85)]"
                  />
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2">
                  <InlineNumberField
                    name={`lineItems.${index}.quantity`}
                    className="text-center"
                  />
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2">
                  <InlineNumberField
                    name={`lineItems.${index}.unitPrice`}
                    className="text-right"
                  />
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2">
                  <InlineNumberField
                    name={`lineItems.${index}.discountAmount`}
                    className="text-right"
                  />
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2">
                  <InlineNumberField
                    name={`lineItems.${index}.taxRate`}
                    className="text-right"
                  />
                </td>
                <td className="border-r border-[rgba(29,23,16,0.15)] px-3 py-2 text-right font-medium">
                  {doc.lineItems[index]?.lineTotalFormatted}
                </td>
                <td className="px-2 py-2">
                  {fields.length > 1 && <RemoveRowButton onClick={() => remove(index)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddRowButton
          label="Add line item"
          onClick={() =>
            append({
              description: "",
              quantity: "1",
              unitPrice: "",
              taxRate: "18",
              discountAmount: "0",
            })
          }
        />
      </section>

      {/* ── Summary ── */}
      <section className="grid gap-5 md:grid-cols-[1fr_16rem]">
        <div>
          <p className="text-sm italic leading-6 text-[rgba(29,23,16,0.65)]">*{doc.amountInWords}</p>
        </div>

        <div className="border border-[rgba(29,23,16,0.2)]">
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Subtotal</span>
            <span>{doc.subtotalFormatted}</span>
          </div>
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Discount</span>
            <span>{doc.totalDiscountFormatted}</span>
          </div>
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
            <span className="text-[rgba(29,23,16,0.65)]">Tax</span>
            <span>{doc.totalTaxFormatted}</span>
          </div>
          {doc.extraCharges > 0 ? (
            <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
              <span className="text-[rgba(29,23,16,0.65)]">Extra Charges</span>
              <span>{doc.extraChargesFormatted}</span>
            </div>
          ) : null}
          {doc.invoiceLevelDiscount > 0 ? (
            <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
              <span className="text-[rgba(29,23,16,0.65)]">Invoice Discount</span>
              <span>{doc.invoiceLevelDiscountFormatted}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-b border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.05)] px-3 py-2 text-sm font-bold">
            <span>Grand Total</span>
            <span>{doc.grandTotalFormatted}</span>
          </div>
          {doc.visibility.showPaymentSummary ? (
            <>
              {doc.amountPaid > 0 ? (
                <div className="flex justify-between border-b border-[rgba(29,23,16,0.12)] px-3 py-1.5 text-sm">
                  <span className="text-[rgba(29,23,16,0.65)]">Paid</span>
                  <span>{doc.amountPaidFormatted}</span>
                </div>
              ) : null}
              <div className="flex justify-between bg-[var(--voucher-accent)] px-3 py-2 text-sm font-bold text-white">
                <span>Net Amount Payable</span>
                <span>{doc.balanceDueFormatted}</span>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* ── Notes & Terms ── */}
      <section className="space-y-3 border-t border-[rgba(29,23,16,0.15)] pt-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
            Notes
          </p>
          <InlineTextArea
            name="notes"
            className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.75)]"
            placeholder="Notes"
          />
        </div>
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
            Terms &amp; Conditions*
          </p>
          <InlineTextArea
            name="terms"
            className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.75)]"
            placeholder="Terms & conditions"
          />
        </div>
      </section>

      {/* ── Footer: Bank details/UPI left, Signature right ── */}
      <section className="grid gap-4 border-t-2 border-[var(--voucher-ink)] pt-4 md:grid-cols-2 md:gap-6">
        <div className="space-y-4">
          {doc.visibility.showBankDetails ? (
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                Bank Details
              </p>
              <div className="mt-2 space-y-1 text-sm leading-5 text-[rgba(29,23,16,0.78)]">
                <InlineTextField name="bankName" placeholder="Bank name" />
                <InlineTextField name="bankAccountNumber" placeholder="Account number" />
                <InlineTextField name="bankIfsc" placeholder="IFSC code" />
              </div>
            </div>
          ) : null}

          {doc.visibility.showUpiDetails ? (
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
                UPI Details
              </p>
              <div className="mt-2 flex items-center gap-4">
                {doc.upiQrDataUrl ? (
                  <img
                    src={doc.upiQrDataUrl}
                    alt="UPI QR Code"
                    className="h-16 w-16 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white shrink-0"
                  />
                ) : null}
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[rgba(29,23,16,0.45)]">UPI ID</p>
                  <InlineTextField
                    name="upiId"
                    placeholder="UPI ID (merchant@ybl)"
                    className="text-sm font-semibold text-[rgba(29,23,16,0.9)] mt-0.5"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-[rgba(29,23,16,0.5)]">
            Approved By
          </p>
          <div className="mt-8 inline-block border-t border-[rgba(29,23,16,0.3)] px-6 pt-2 min-w-[140px] text-right">
            <InlineTextField
              name="authorizedBy"
              className="text-sm font-semibold text-right text-[rgba(29,23,16,0.85)]"
              placeholder="Name"
            />
            <InlineTextField
              name="authorizedByDesignation"
              className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5 text-right"
              placeholder="Designation"
            />
            <InlineTextField
              name="authorizedByCompany"
              className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5 text-right"
              placeholder="Company Name"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
