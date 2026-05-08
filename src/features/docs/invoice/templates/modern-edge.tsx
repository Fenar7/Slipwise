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

export function ModernEdgeInvoiceTemplate({
  document,
  mode = "preview",
}: {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
}) {
  if (mode === "edit") {
    return <ModernEdgeEditor document={document} />;
  }

  const printLike = mode !== "preview";

  const showBank =
    document.visibility.showBankDetails &&
    (document.bankName || document.bankAccountNumber || document.bankIfsc);

  return (
    <div className="flex text-[var(--voucher-ink)]">
      {/* Left accent sidebar */}
      <div
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--voucher-accent)" }}
      />

      <div className="min-w-0 flex-1 space-y-8 pl-6">
        {/* ── Header ── */}
        <section className="document-break-inside-avoid">
          <div
            className={cn(
              "flex gap-6",
              printLike ? "flex-row items-start justify-between" : "flex-col md:flex-row md:items-start md:justify-between",
            )}
          >
            <div className="flex items-start gap-3.5">
              <DocumentBrandMark
                branding={document.branding}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgba(29,23,16,0.05)] p-1.5"
                initialsClassName="text-sm font-bold text-[var(--voucher-ink)]"
                imageClassName="h-full w-full rounded-lg object-cover"
              />
              <div>
                <h2 className="text-2xl font-bold leading-tight tracking-tight">
                  {document.branding.companyName}
                </h2>
                <p className="mt-0.5 text-xs tracking-wide text-[rgba(29,23,16,0.4)]">
                  {document.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--voucher-accent)" }}
              >
                {document.invoiceNumber}
              </div>
              <span className="text-sm text-[rgba(29,23,16,0.45)]">{document.invoiceDate}</span>
            </div>
          </div>
        </section>

        {/* ── From / To ── */}
        <section
          className={cn(
            "document-break-inside-avoid grid gap-8",
            printLike ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          <div>
            <p
              className="border-b-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]"
              style={{ borderBottomColor: "var(--voucher-accent)" }}
            >
              From
            </p>
            <div className="mt-3 space-y-1 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              <p className="font-medium text-[var(--voucher-ink)]">{document.branding.companyName}</p>
              {document.visibility.showAddress && document.branding.address ? (
                <p>{document.branding.address}</p>
              ) : null}
              {document.visibility.showEmail && document.branding.email ? (
                <p>{document.branding.email}</p>
              ) : null}
              {document.visibility.showPhone && document.branding.phone ? (
                <p>{document.branding.phone}</p>
              ) : null}
              {document.website ? <p>{document.website}</p> : null}
              {document.businessTaxId ? <p>GSTIN: {document.businessTaxId}</p> : null}
            </div>
          </div>

          <div>
            <p
              className="border-b-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]"
              style={{ borderBottomColor: "var(--voucher-accent)" }}
            >
              Bill To
            </p>
            <div className="mt-3 space-y-1 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              <p className="font-medium text-[var(--voucher-ink)]">{document.clientName}</p>
              {document.clientAddress ? <p>{document.clientAddress}</p> : null}
              {document.clientEmail ? <p>{document.clientEmail}</p> : null}
              {document.clientPhone ? <p>{document.clientPhone}</p> : null}
              {document.clientTaxId ? <p>Tax ID: {document.clientTaxId}</p> : null}
            </div>
          </div>
        </section>

        {/* ── Due / Dates row ── */}
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLike ? "grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_auto]",
          )}
        >
          {/* Due callout */}
          <div
            className="flex items-center gap-5 rounded-xl px-6 py-5 text-white"
            style={{ backgroundColor: "var(--voucher-accent)" }}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white">
                Balance Due
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-white">{document.balanceDueFormatted}</p>
            </div>
            <div className="ml-auto text-right text-sm leading-6 text-white">
              <p className="text-white">{document.amountInWords}</p>
            </div>
          </div>

          {/* Date details */}
          <div className="flex flex-col justify-center space-y-1 text-sm">
            {document.dueDate ? (
              <div className="flex gap-2">
                <span className="text-xs uppercase tracking-wider text-[rgba(29,23,16,0.4)]">Due</span>
                <span className="font-medium">{document.dueDate}</span>
              </div>
            ) : null}
            {document.placeOfSupply ? (
              <div className="flex gap-2">
                <span className="text-xs uppercase tracking-wider text-[rgba(29,23,16,0.4)]">Supply</span>
                <span className="font-medium">{document.placeOfSupply}</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Shipping ── */}
        {document.shippingAddress ? (
          <section className="document-break-inside-avoid">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
              Ship To
            </p>
            <p className="mt-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              {document.shippingAddress}
            </p>
          </section>
        ) : null}

        {/* ── Line Items — editorial sub-row style ── */}
        <section>
          {/* Header row */}
          <div
            className={cn(
              "document-table-head grid border-b-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]",
              printLike
                ? "grid-cols-[1fr_5rem_6rem_6rem_6rem]"
                : "grid-cols-[1fr_5rem_6rem_6rem_6rem]",
            )}
          >
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Tax</span>
            <span className="text-right">Total</span>
          </div>

          {/* Items */}
          {document.lineItems.map((item) => (
            <div
              key={`${item.description}-${item.lineTotal}`}
              className="document-table-row-avoid border-b border-[rgba(29,23,16,0.08)] py-3"
            >
              <div
                className={cn(
                  "grid items-start",
                  printLike
                    ? "grid-cols-[1fr_5rem_6rem_6rem_6rem]"
                    : "grid-cols-[1fr_5rem_6rem_6rem_6rem]",
                )}
              >
                <div>
                  <p className="text-sm font-semibold text-[rgba(29,23,16,0.88)]">
                    {item.description}
                  </p>
                  {item.discountAmount > 0 ? (
                    <p className="mt-0.5 text-xs text-[rgba(29,23,16,0.45)]">
                      Discount: {item.discountAmountFormatted}
                    </p>
                  ) : null}
                </div>
                <span className="text-center text-sm text-[rgba(29,23,16,0.65)]">
                  {item.quantity}
                </span>
                <span className="text-right text-sm text-[rgba(29,23,16,0.65)]">
                  {item.unitPriceFormatted}
                </span>
                <span className="text-right text-sm text-[rgba(29,23,16,0.65)]">
                  {item.taxAmountFormatted}
                </span>
                <span className="text-right text-sm font-semibold">
                  {item.lineTotalFormatted}
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* ── Summary ── */}
        <section
          className={cn(
            "document-break-inside-avoid grid gap-6",
            printLike ? "grid-cols-[1fr_17rem]" : "md:grid-cols-[1fr_17rem]",
          )}
        >
          {/* Left: notes / terms */}
          <div className="space-y-5">
            {document.notes ? (
              <div className="document-break-inside-avoid">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                  Notes
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.7)]">{document.notes}</p>
              </div>
            ) : null}
            {document.terms ? (
              <div className="document-break-inside-avoid">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                  Terms &amp; Conditions
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.7)]">{document.terms}</p>
              </div>
            ) : null}
          </div>

          {/* Right: totals */}
          <div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Subtotal</span>
                <span>{document.subtotalFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Discount</span>
                <span>{document.totalDiscountFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Tax</span>
                <span>{document.totalTaxFormatted}</span>
              </div>
              {document.extraCharges > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Extra Charges</span>
                  <span>{document.extraChargesFormatted}</span>
                </div>
              ) : null}
              {document.invoiceLevelDiscount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Invoice Discount</span>
                  <span>{document.invoiceLevelDiscountFormatted}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex justify-between border-t-[3px] border-[var(--voucher-ink)] pt-3">
              <span className="text-base font-bold">Total</span>
              <span className="text-xl font-bold">{document.grandTotalFormatted}</span>
            </div>

            {document.visibility.showPaymentSummary ? (
              <div className="mt-3 space-y-1.5 border-t border-[rgba(29,23,16,0.1)] pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Amount Paid</span>
                  <span>{document.amountPaidFormatted}</span>
                </div>
                <div className="flex justify-between font-bold" style={{ color: "var(--voucher-accent)" }}>
                  <span>Due</span>
                  <span className="text-lg">{document.balanceDueFormatted}</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Bank Details & Signature ── */}
        {showBank || (document.visibility.showSignature && document.authorizedBy) ? (
          <section
            className={cn(
              "document-break-inside-avoid grid border-t border-[rgba(29,23,16,0.1)] pt-5",
              printLike ? "grid-cols-2 gap-8" : "gap-5 md:grid-cols-2 md:gap-8",
            )}
          >
            {showBank ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                  Payment Details
                </p>
                <div className="mt-2 space-y-1 text-sm leading-5 text-[rgba(29,23,16,0.72)]">
                  {document.bankName ? <p>{document.bankName}</p> : null}
                  {document.bankAccountNumber ? <p>A/C: {document.bankAccountNumber}</p> : null}
                  {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
                </div>
              </div>
            ) : (
              <div />
            )}

            {document.visibility.showSignature && document.authorizedBy ? (
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                  Authorized By
                </p>
                <p className="mt-8 text-sm font-medium">{document.authorizedBy}</p>
                <div
                  className="mx-auto mt-1 h-0.5 w-32 rounded-full"
                  style={{ backgroundColor: "var(--voucher-accent)", marginLeft: "auto" }}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[rgba(29,23,16,0.4)] transition-colors hover:bg-red-50 hover:text-red-500" aria-label="Remove row">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    </button>
  );
}

function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-[var(--voucher-accent)] transition-opacity hover:opacity-75">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
      {label}
    </button>
  );
}

function ModernEdgeEditor({ document }: { document: InvoiceDocument }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  return (
    <div className="flex text-[var(--voucher-ink)]">
      {/* Left accent sidebar */}
      <div
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--voucher-accent)" }}
      />

      <div className="min-w-0 flex-1 space-y-8 pl-6">
        {/* ── Header ── */}
        <section className="document-break-inside-avoid">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3.5">
              <DocumentBrandMark
                branding={document.branding}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgba(29,23,16,0.05)] p-1.5"
                initialsClassName="text-sm font-bold text-[var(--voucher-ink)]"
                imageClassName="h-full w-full rounded-lg object-cover"
              />
              <div>
                <h2 className="text-2xl font-bold leading-tight tracking-tight">
                  <InlineTextField name="branding.companyName" className="text-2xl font-bold leading-tight tracking-tight" />
                </h2>
                <p className="mt-0.5 text-xs tracking-wide text-[rgba(29,23,16,0.4)]">
                  {document.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--voucher-accent)" }}
              >
                <InlineTextField name="invoiceNumber" className="text-sm font-semibold text-white bg-transparent" />
              </div>
              <InlineDateField name="invoiceDate" className="text-sm text-[rgba(29,23,16,0.45)]" />
            </div>
          </div>
        </section>

        {/* ── From / To ── */}
        <section className="document-break-inside-avoid grid gap-8 md:grid-cols-2">
          <div>
            <p
              className="border-b-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]"
              style={{ borderBottomColor: "var(--voucher-accent)" }}
            >
              From
            </p>
            <div className="mt-3 space-y-1 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              <InlineTextField name="branding.companyName" className="font-medium text-[var(--voucher-ink)]" />
              <InlineTextArea name="branding.address" placeholder="Business address" />
              <InlineTextField name="branding.email" placeholder="Business email" />
              <InlineTextField name="branding.phone" placeholder="Business phone" />
              <InlineTextField name="website" placeholder="Website" />
              <InlineTextField name="businessTaxId" placeholder="Tax ID / GSTIN" />
            </div>
          </div>

          <div>
            <p
              className="border-b-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]"
              style={{ borderBottomColor: "var(--voucher-accent)" }}
            >
              Bill To
            </p>
            <div className="mt-3 space-y-1 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              <InlineTextField name="clientName" className="font-medium text-[var(--voucher-ink)]" placeholder="Client name" />
              <InlineTextArea name="clientAddress" placeholder="Client address" />
              <InlineTextField name="clientEmail" placeholder="Client email" />
              <InlineTextField name="clientPhone" placeholder="Client phone" />
              <InlineTextField name="clientTaxId" placeholder="Client Tax ID" />
            </div>
          </div>
        </section>

        {/* ── Due / Dates row ── */}
        <section className="document-break-inside-avoid grid gap-4 md:grid-cols-[1fr_auto]">
          {/* Due callout */}
          <div
            className="flex items-center gap-5 rounded-xl px-6 py-5 text-white"
            style={{ backgroundColor: "var(--voucher-accent)" }}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white">
                Balance Due
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-white">{doc.balanceDueFormatted}</p>
            </div>
            <div className="ml-auto text-right text-sm leading-6 text-white">
              <p className="text-white">{doc.amountInWords}</p>
            </div>
          </div>

          {/* Date details */}
          <div className="flex flex-col justify-center space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-xs uppercase tracking-wider text-[rgba(29,23,16,0.4)]">Due</span>
              <InlineDateField name="dueDate" />
            </div>
            <div className="flex gap-2">
              <span className="text-xs uppercase tracking-wider text-[rgba(29,23,16,0.4)]">Supply</span>
              <InlineTextField name="placeOfSupply" placeholder="Place of supply" />
            </div>
          </div>
        </section>

        {/* ── Shipping ── */}
        <section className="document-break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
            Ship To
          </p>
          <InlineTextArea name="shippingAddress" className="mt-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]" placeholder="Shipping address" />
        </section>

        {/* ── Line Items — editorial sub-row style ── */}
        <section>
          {/* Header row */}
          <div className="document-table-head grid grid-cols-[1fr_5rem_6rem_6rem_6rem_2rem] border-b-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]">
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Tax</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {/* Items */}
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="document-table-row-avoid border-b border-[rgba(29,23,16,0.08)] py-3"
            >
              <div className="grid grid-cols-[1fr_5rem_6rem_6rem_6rem_2rem] items-start">
                <div>
                  <InlineTextField name={`lineItems.${index}.description`} className="text-sm font-semibold text-[rgba(29,23,16,0.88)]" placeholder="Item description" />
                  <InlineNumberField name={`lineItems.${index}.discountAmount`} className="mt-0.5 text-xs text-[rgba(29,23,16,0.45)]" placeholder="Discount" />
                </div>
                <InlineNumberField name={`lineItems.${index}.quantity`} className="text-center text-sm text-[rgba(29,23,16,0.65)]" />
                <InlineNumberField name={`lineItems.${index}.unitPrice`} className="text-right text-sm text-[rgba(29,23,16,0.65)]" />
                <InlineNumberField name={`lineItems.${index}.taxRate`} className="text-right text-sm text-[rgba(29,23,16,0.65)]" />
                <span className="text-right text-sm font-semibold">
                  {doc.lineItems[index]?.lineTotalFormatted}
                </span>
                {fields.length > 1 && <RemoveRowButton onClick={() => remove(index)} />}
              </div>
            </div>
          ))}

          <AddRowButton
            label="Add line item"
            onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "18", discountAmount: "0" })}
          />
        </section>

        {/* ── Summary ── */}
        <section className="document-break-inside-avoid grid gap-6 md:grid-cols-[1fr_17rem]">
          {/* Left: notes / terms */}
          <div className="space-y-5">
            <div className="document-break-inside-avoid">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                Notes
              </p>
              <InlineTextArea name="notes" className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.7)]" placeholder="Notes" />
            </div>
            <div className="document-break-inside-avoid">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
                Terms &amp; Conditions
              </p>
              <InlineTextArea name="terms" className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.7)]" placeholder="Terms & conditions" />
            </div>
          </div>

          {/* Right: totals */}
          <div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Subtotal</span>
                <span>{doc.subtotalFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Discount</span>
                <span>{doc.totalDiscountFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[rgba(29,23,16,0.55)]">Tax</span>
                <span>{doc.totalTaxFormatted}</span>
              </div>
              {doc.extraCharges > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Extra Charges</span>
                  <span>{doc.extraChargesFormatted}</span>
                </div>
              ) : null}
              {doc.invoiceLevelDiscount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Invoice Discount</span>
                  <span>{doc.invoiceLevelDiscountFormatted}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex justify-between border-t-[3px] border-[var(--voucher-ink)] pt-3">
              <span className="text-base font-bold">Total</span>
              <span className="text-xl font-bold">{doc.grandTotalFormatted}</span>
            </div>

            {doc.visibility.showPaymentSummary ? (
              <div className="mt-3 space-y-1.5 border-t border-[rgba(29,23,16,0.1)] pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[rgba(29,23,16,0.55)]">Amount Paid</span>
                  <span>{doc.amountPaidFormatted}</span>
                </div>
                <div className="flex justify-between font-bold" style={{ color: "var(--voucher-accent)" }}>
                  <span>Due</span>
                  <span className="text-lg">{doc.balanceDueFormatted}</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Bank Details & Signature ── */}
        <section className="document-break-inside-avoid grid gap-5 border-t border-[rgba(29,23,16,0.1)] pt-5 md:grid-cols-2 md:gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
              Payment Details
            </p>
            <div className="mt-2 space-y-1 text-sm leading-5 text-[rgba(29,23,16,0.72)]">
              <InlineTextField name="bankName" placeholder="Bank name" />
              <InlineTextField name="bankAccountNumber" placeholder="Account number" />
              <InlineTextField name="bankIfsc" placeholder="IFSC code" />
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.4)]">
              Authorized By
            </p>
            <InlineTextField name="authorizedBy" className="mt-8 text-sm font-medium" placeholder="Authorized by" />
            <div
              className="mx-auto mt-1 h-0.5 w-32 rounded-full"
              style={{ backgroundColor: "var(--voucher-accent)", marginLeft: "auto" }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
