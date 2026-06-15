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

function InvoiceTable({ document }: { document: InvoiceDocument }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[rgba(29,23,16,0.08)]">
      <table className="w-full border-collapse text-left text-[0.82rem]">
        <thead className="document-table-head bg-[rgba(29,23,16,0.04)] text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.52)]">
          <tr>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Tax</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {document.lineItems.map((item) => (
            <tr key={`${item.description}-${item.lineTotal}`} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.07)] align-top">
              <td className="px-4 py-4 text-[rgba(29,23,16,0.84)]">{item.description}</td>
              <td className="px-4 py-4">{item.quantity}</td>
              <td className="px-4 py-4">{item.unitPriceFormatted}</td>
              <td className="px-4 py-4">{item.discountAmountFormatted}</td>
              <td className="px-4 py-4">{item.taxAmountFormatted}</td>
              <td className="px-4 py-4 text-right font-medium">{item.lineTotalFormatted}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function MinimalEditor({ document }: { document: InvoiceDocument }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
        <div className="flex items-start gap-4">
          <DocumentBrandMark branding={document.branding} />
          <div className="space-y-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                {document.title}
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                {document.branding.salutation ? (
                  <span className="text-[1.5rem] font-medium text-[rgba(29,23,16,0.55)] shrink-0">
                    {document.branding.salutation}
                  </span>
                ) : null}
                <InlineTextField name="branding.companyName" className="text-[1.95rem] leading-tight flex-1" />
              </div>
            </div>
            <div className="space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
              <InlineTextArea name="branding.address" placeholder="Business address" />
              <div className="flex items-center gap-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-xs shrink-0">Email:</span>
                <InlineTextField name="branding.email" placeholder="Business email" />
              </div>
              <div className="flex items-center gap-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-xs shrink-0">Phone:</span>
                <InlineTextField name="branding.phone" placeholder="Business phone" />
              </div>
              <InlineTextField name="website" placeholder="Website" />
              <InlineTextField name="businessTaxId" placeholder="Tax ID / GSTIN" />
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] px-5 py-4 text-right">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice no.
          </p>
          <InlineTextField name="invoiceNumber" className="mt-2 text-xl font-medium" />
          <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice date
          </p>
          <InlineDateField name="invoiceDate" className="mt-2 text-sm font-medium" />
          <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Due date
          </p>
          <InlineDateField name="dueDate" className="mt-2 text-sm font-medium" />
        </div>
      </section>

      <section className="grid md:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Bill to
          </p>
          <InlineTextField name="clientSalutation" placeholder="" className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.45)] w-16" />
          <InlineTextField name="clientName" className="mt-3 text-base font-medium" placeholder="Client name" />
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
            <InlineTextArea name="clientAddress" placeholder="Client address" />
            <InlineTextField name="clientEmail" placeholder="Client email" />
            <InlineTextField name="clientPhone" placeholder="Client phone" />
            <InlineTextField name="clientTaxId" placeholder="Client Tax ID" />
          </div>
        </div>
        <div className="rounded-[1.5rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">
            Net Amount Payable
          </p>
          <p className="mt-3 text-3xl font-medium text-white">{doc.balanceDueFormatted}</p>
          <p className="mt-4 text-sm leading-7 text-white">*{doc.amountInWords}</p>
        </div>
      </section>

      {doc.visibility.showShippingAddress || doc.placeOfSupply ? (
        <section
          className={cn(
            "grid gap-4",
            doc.visibility.showShippingAddress && doc.placeOfSupply
              ? "md:grid-cols-2"
              : "grid-cols-1",
          )}
        >
          {doc.visibility.showShippingAddress ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Ship to
              </p>
              <InlineTextArea name="shippingAddress" placeholder="Shipping address" />
            </div>
          ) : null}
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Place of supply
            </p>
            <InlineTextField name="placeOfSupply" placeholder="Place of supply" />
          </div>
        </section>
      ) : null}

      <div>
        <div className="overflow-hidden rounded-[1.5rem] border border-[rgba(29,23,16,0.08)]">
          <table className="w-full border-collapse text-left text-[0.82rem]">
            <thead className="document-table-head bg-[rgba(29,23,16,0.04)] text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.52)]">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Tax</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t border-[rgba(29,23,16,0.07)] align-top">
                  <td className="px-4 py-4">
                    <InlineTextField name={`lineItems.${index}.description`} className="text-[rgba(29,23,16,0.84)]" />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField name={`lineItems.${index}.quantity`} />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField name={`lineItems.${index}.unitPrice`} />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField name={`lineItems.${index}.discountAmount`} />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField name={`lineItems.${index}.taxRate`} />
                  </td>
                  <td className="px-4 py-4 text-right font-medium">
                    {doc.lineItems[index]?.lineTotalFormatted}
                  </td>
                  <td className="px-4 py-4">
                    {fields.length > 1 && <RemoveRowButton onClick={() => remove(index)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddRowButton
          label="Add line item"
          onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "18", discountAmount: "0" })}
        />
      </div>

      <section className="grid md:grid-cols-[1fr_18rem] gap-4">
        <div className="space-y-4">
          {doc.visibility.showNotes ? (
            <div className="rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Notes
              </p>
              <InlineTextArea name="notes" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Notes" />
            </div>
          ) : null}
          {doc.visibility.showTerms ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.84)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Terms*
              </p>
              <InlineTextArea name="terms" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Terms" />
            </div>
          ) : null}
          {doc.visibility.showUpiDetails ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.84)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                UPI Details
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[rgba(29,23,16,0.45)]">UPI ID</p>
                  <InlineTextField name="upiId" placeholder="merchant@ybl" className="text-sm font-medium mt-1" />
                </div>
                {doc.upiQrDataUrl ? (
                  <img
                    src={doc.upiQrDataUrl}
                    alt="UPI QR Code"
                    className="h-16 w-16 rounded-lg border border-[rgba(29,23,16,0.1)] object-contain p-1 bg-white"
                  />
                ) : (
                  <div className="text-[11px] text-[rgba(29,23,16,0.45)] border border-dashed border-[rgba(29,23,16,0.14)] rounded-lg p-2 bg-white">
                    Upload UPI QR in Sidebar
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{doc.subtotalFormatted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>{doc.totalDiscountFormatted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tax</span>
              <span>{doc.totalTaxFormatted}</span>
            </div>
            {doc.extraCharges > 0 ? (
              <div className="flex items-center justify-between">
                <span>Extra charges</span>
                <span>{doc.extraChargesFormatted}</span>
              </div>
            ) : null}
            {doc.invoiceLevelDiscount > 0 ? (
              <div className="flex items-center justify-between">
                <span>Invoice discount</span>
                <span>{doc.invoiceLevelDiscountFormatted}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-[rgba(29,23,16,0.08)] pt-3 font-medium">
              <span>Total</span>
              <span>{doc.grandTotalFormatted}</span>
            </div>
            {doc.visibility.showPaymentSummary ? (
              <>
                {doc.amountPaid > 0 ? (
                  <div className="flex items-center justify-between">
                    <span>Paid</span>
                    <span>{doc.amountPaidFormatted}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-base font-medium text-[var(--voucher-accent)]">
                  <span>Due</span>
                  <span>{doc.balanceDueFormatted}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function MinimalInvoiceTemplate({
  document,
  mode = "preview",
}: {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
}) {
  if (mode === "edit") {
    return <MinimalEditor document={document} />;
  }

  const printLike = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
        <div className="flex items-start gap-4">
          <DocumentBrandMark branding={document.branding} />
          <div className="space-y-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                {document.title}
              </p>
              <h2 className="mt-3 text-[1.95rem] leading-tight">
                {document.branding.salutation ? document.branding.salutation + " " : ""}
                {document.branding.companyName}
              </h2>
            </div>
            <div className="space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
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
              {document.businessTaxId ? <p>{document.businessTaxId}</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] px-5 py-4 text-right">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice no.
          </p>
          <p className="mt-2 text-xl font-medium">{document.invoiceNumber}</p>
          <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice date
          </p>
          <p className="mt-2 text-sm font-medium">{document.invoiceDate}</p>
          {document.dueDate ? (
            <>
              <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Due date
              </p>
              <p className="mt-2 text-sm font-medium">{document.dueDate}</p>
            </>
          ) : null}
        </div>
      </section>

        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLike ? "grid-cols-[1.1fr_0.9fr]" : "md:grid-cols-[1.1fr_0.9fr]",
          )}
        >
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Bill to
          </p>
          <p className="mt-3 text-base font-medium">{document.clientSalutation ? document.clientSalutation + " " : ""}{document.clientName}</p>
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
            {document.clientAddress ? <p className="whitespace-pre-line">{document.clientAddress}</p> : null}
            {document.clientEmail ? <p>{document.clientEmail}</p> : null}
            {document.clientPhone ? <p>{document.clientPhone}</p> : null}
            {document.clientTaxId ? <p>Tax ID: {document.clientTaxId}</p> : null}
          </div>
        </div>
        <div className="rounded-[1.5rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">
            Net Amount Payable
          </p>
          <p className="mt-3 text-3xl font-medium text-white">{document.balanceDueFormatted}</p>
          <p className="mt-4 text-sm leading-7 text-white">*{document.amountInWords}</p>
        </div>
      </section>

      {document.shippingAddress || document.placeOfSupply ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLike ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          {document.shippingAddress ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Ship to
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)] whitespace-pre-line">
                {document.shippingAddress}
              </p>
            </div>
          ) : null}
          {document.placeOfSupply ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Place of supply
              </p>
              <p className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.82)]">
                {document.placeOfSupply}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <InvoiceTable document={document} />

      <section
        className={cn(
          "grid gap-4",
          printLike ? "grid-cols-[1fr_18rem]" : "md:grid-cols-[1fr_18rem]",
        )}
      >
        <div className="space-y-4">
          {document.notes ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Notes
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.notes}</p>
            </div>
          ) : null}
          {document.terms ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.84)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Terms*
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.terms}</p>
            </div>
          ) : null}
          {document.visibility.showUpiDetails && (document.upiId || document.upiQrDataUrl) ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.84)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                UPI Details
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                {document.upiId ? (
                  <div>
                    <p className="text-xs text-[rgba(29,23,16,0.45)]">UPI ID</p>
                    <p className="text-sm font-medium text-[rgba(29,23,16,0.85)] mt-1">{document.upiId}</p>
                  </div>
                ) : null}
                {document.upiQrDataUrl ? (
                  <img
                    src={document.upiQrDataUrl}
                    alt="UPI QR Code"
                    className="h-16 w-16 rounded-lg border border-[rgba(29,23,16,0.1)] object-contain p-1 bg-white"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{document.subtotalFormatted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>{document.totalDiscountFormatted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tax</span>
              <span>{document.totalTaxFormatted}</span>
            </div>
            {document.extraCharges > 0 ? (
              <div className="flex items-center justify-between">
                <span>Extra charges</span>
                <span>{document.extraChargesFormatted}</span>
              </div>
            ) : null}
            {document.invoiceLevelDiscount > 0 ? (
              <div className="flex items-center justify-between">
                <span>Invoice discount</span>
                <span>{document.invoiceLevelDiscountFormatted}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-[rgba(29,23,16,0.08)] pt-3 font-medium">
              <span>Total</span>
              <span>{document.grandTotalFormatted}</span>
            </div>
            {document.visibility.showPaymentSummary ? (
              <>
                {document.amountPaid > 0 ? (
                  <div className="flex items-center justify-between">
                    <span>Paid</span>
                    <span>{document.amountPaidFormatted}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-base font-medium text-[var(--voucher-accent)]">
                  <span>Due</span>
                  <span>{document.balanceDueFormatted}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
