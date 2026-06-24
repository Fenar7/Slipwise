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

export function BoldBrandInvoiceTemplate({
  document,
  mode = "preview",
}: {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
}) {
  if (mode === "edit") {
    return <BoldBrandEditor document={document} />;
  }

  const printLike = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section
        className="document-break-inside-avoid rounded-[1.8rem] p-6 text-white"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--voucher-accent) 94%, white 6%), #7f5a22)",
        }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <DocumentBrandMark
              branding={document.branding}
              className="flex h-18 w-18 shrink-0 items-center justify-center rounded-[1.4rem] border border-white/20 bg-white/10 p-2"
              initialsClassName="text-lg font-semibold text-white"
              imageClassName="h-full w-full rounded-[1rem] object-cover"
            />
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.32em] text-white">
                {document.title}
              </p>
              <h2 className="mt-3 text-[2.05rem] leading-tight text-white">{document.branding.companyName}</h2>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-white">
                {document.visibility.showAddress && document.branding.address ? <p>{document.branding.address}</p> : null}
                {document.visibility.showEmail && document.branding.email ? <p>{document.branding.email}</p> : null}
                {document.visibility.showPhone && document.branding.phone ? <p>{document.branding.phone}</p> : null}
                {document.website ? <p>{document.website}</p> : null}
              </div>
            </div>
          </div>
          <div className="min-w-[14rem] rounded-[1.4rem] bg-white/12 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Invoice no.</p>
            <p className="mt-2 text-xl font-medium text-white">{document.invoiceNumber}</p>
            <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-white">Due</p>
            <p className="mt-2 text-sm font-medium text-white">{document.dueDate || document.invoiceDate}</p>
            <p className="mt-5 text-[0.68rem] uppercase tracking-[0.25em] text-white">Balance due</p>
            <p className="mt-2 text-2xl font-medium text-white">{document.balanceDueFormatted}</p>
          </div>
        </div>
      </section>

        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLike ? "grid-cols-[0.95fr_1.05fr]" : "md:grid-cols-[0.95fr_1.05fr]",
          )}
        >
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bill to</p>
          <p className="mt-3 text-lg font-medium">{document.clientName}</p>
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
            {document.clientAddress ? <p>{document.clientAddress}</p> : null}
            {document.clientEmail ? <p>{document.clientEmail}</p> : null}
            {document.clientPhone ? <p>{document.clientPhone}</p> : null}
            {document.clientTaxId ? <p>Tax ID: {document.clientTaxId}</p> : null}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <div
            className={cn(
              "grid gap-3 text-sm",
              printLike ? "grid-cols-2" : "md:grid-cols-2",
            )}
          >
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice date</p>
              <p className="mt-2 font-medium">{document.invoiceDate}</p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">GST / Tax ID</p>
              <p className="mt-2 font-medium">{document.businessTaxId || "Not shown"}</p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Grand total</p>
              <p className="mt-2 font-medium">{document.grandTotalFormatted}</p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Paid</p>
              <p className="mt-2 font-medium">{document.amountPaidFormatted}</p>
            </div>
          </div>
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
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Shipping address</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.shippingAddress}</p>
            </div>
          ) : null}
          {document.placeOfSupply ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
              <p className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.82)]">{document.placeOfSupply}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)]">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <thead
            className="document-table-head"
            style={{ backgroundColor: "color-mix(in srgb, var(--voucher-accent) 16%, white 84%)" }}
          >
            <tr className="text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.58)]">
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Tax %</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((item) => (
              <tr key={`${item.description}-${item.lineTotal}`} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.08)]">
                <td className="px-4 py-4 text-[rgba(29,23,16,0.84)]">{item.description}</td>
                <td className="px-4 py-4">{item.quantity}</td>
                <td className="px-4 py-4">{item.unitPriceFormatted}</td>
                <td className="px-4 py-4">{item.taxRate}%</td>
                <td className="px-4 py-4">{item.discountAmountFormatted}</td>
                <td className="px-4 py-4 text-right font-medium">{item.lineTotalFormatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        className={cn(
          "grid gap-4",
          printLike ? "grid-cols-[1fr_18rem]" : "md:grid-cols-[1fr_18rem]",
        )}
      >
        <div className="space-y-4">
          {document.notes ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.notes}</p>
            </div>
          ) : null}
          {document.terms ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.terms}</p>
            </div>
          ) : null}
          {document.bankName || document.bankAccountNumber || document.bankIfsc ? (
            <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Remit to</p>
              <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
                {document.bankName ? <p>{document.bankName}</p> : null}
                {document.bankAccountNumber ? <p>A/c: {document.bankAccountNumber}</p> : null}
                {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.98)] p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span>Subtotal</span><span>{document.subtotalFormatted}</span></div>
            <div className="flex items-center justify-between"><span>Line discount</span><span>{document.totalDiscountFormatted}</span></div>
            <div className="flex items-center justify-between"><span>Tax</span><span>{document.totalTaxFormatted}</span></div>
            {document.extraCharges > 0 ? (
              <div className="flex items-center justify-between"><span>Extra charges</span><span>{document.extraChargesFormatted}</span></div>
            ) : null}
            {document.invoiceLevelDiscount > 0 ? (
              <div className="flex items-center justify-between"><span>Invoice discount</span><span>{document.invoiceLevelDiscountFormatted}</span></div>
            ) : null}
            <div className="flex items-center justify-between border-t border-[rgba(29,23,16,0.08)] pt-3 font-medium"><span>Grand total</span><span>{document.grandTotalFormatted}</span></div>
            {document.visibility.showPaymentSummary ? (
              <>
                <div className="flex items-center justify-between"><span>Paid</span><span>{document.amountPaidFormatted}</span></div>
                <div className="flex items-center justify-between text-base font-medium text-[var(--voucher-accent)]"><span>Due</span><span>{document.balanceDueFormatted}</span></div>
              </>
            ) : null}
          </div>
          {document.authorizedBy ? (
            <div className="mt-6 border-t border-dashed border-[rgba(29,23,16,0.16)] pt-4 text-sm">
              Authorized by: {document.authorizedBy}
            </div>
          ) : null}
        </div>
      </section>
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
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      {label}
    </button>
  );
}

function BoldBrandEditor({ document }: { document: InvoiceDocument }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      {/* Header */}
      <section
        className="rounded-[1.8rem] p-6 text-white"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--voucher-accent) 94%, white 6%), #7f5a22)",
        }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <DocumentBrandMark
              branding={document.branding}
              className="flex h-18 w-18 shrink-0 items-center justify-center rounded-[1.4rem] border border-white/20 bg-white/10 p-2"
              initialsClassName="text-lg font-semibold text-white"
              imageClassName="h-full w-full rounded-[1rem] object-cover"
            />
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.32em] text-white">{document.title}</p>
              <InlineTextField name="branding.companyName" className="mt-3 text-[2.05rem] leading-tight text-white" />
              <div className="mt-4 space-y-1.5">
                <InlineTextArea name="branding.address" className="text-sm leading-6 text-white" placeholder="Business address" />
                <InlineTextField name="branding.email" className="text-sm leading-6 text-white" placeholder="Business email" />
                <InlineTextField name="branding.phone" className="text-sm leading-6 text-white" placeholder="Business phone" />
                <InlineTextField name="website" className="text-sm leading-6 text-white" placeholder="Website" />
              </div>
            </div>
          </div>
          <div className="min-w-[14rem] rounded-[1.4rem] bg-white/12 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Invoice no.</p>
            <InlineTextField name="invoiceNumber" className="mt-2 text-xl font-medium text-white" />
            <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-white">Due</p>
            <InlineDateField name="dueDate" className="mt-2 text-sm font-medium text-white" />
            <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-white">Invoice date</p>
            <InlineDateField name="invoiceDate" className="mt-2 text-sm font-medium text-white" />
            <p className="mt-5 text-[0.68rem] uppercase tracking-[0.25em] text-white">Balance due</p>
            <p className="mt-2 text-2xl font-medium text-white">{doc.balanceDueFormatted}</p>
          </div>
        </div>
      </section>

      {/* Client + Meta */}
      <section className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bill to</p>
          <InlineTextField name="clientName" className="mt-3 text-lg font-medium" placeholder="Client name" />
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
            <InlineTextArea name="clientAddress" placeholder="Client address" />
            <InlineTextField name="clientEmail" placeholder="Client email" />
            <InlineTextField name="clientPhone" placeholder="Client phone" />
            <InlineTextField name="clientTaxId" placeholder="Client Tax ID" />
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice date</p>
              <InlineDateField name="invoiceDate" className="mt-2 font-medium" />
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">GST / Tax ID</p>
              <InlineTextField name="businessTaxId" className="mt-2 font-medium" placeholder="Tax ID" />
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Grand total</p>
              <p className="mt-2 font-medium">{doc.grandTotalFormatted}</p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Paid</p>
              <p className="mt-2 font-medium">{doc.amountPaidFormatted}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Shipping / Place of supply */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Shipping address</p>
          <InlineTextArea name="shippingAddress" placeholder="Shipping address" />
        </div>
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
          <InlineTextField name="placeOfSupply" placeholder="Place of supply" />
        </div>
      </section>

      {/* Line items */}
      <section className="overflow-hidden rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)]">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <thead
            className="document-table-head"
            style={{ backgroundColor: "color-mix(in srgb, var(--voucher-accent) 16%, white 84%)" }}
          >
            <tr className="text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.58)]">
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Tax %</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={field.id} className="border-t border-[rgba(29,23,16,0.08)]">
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
                  <InlineNumberField name={`lineItems.${index}.taxRate`} />
                </td>
                <td className="px-4 py-4">
                  <InlineNumberField name={`lineItems.${index}.discountAmount`} />
                </td>
                <td className="px-4 py-4 text-right font-medium">{doc.lineItems[index]?.lineTotalFormatted}</td>
                <td className="px-4 py-4">
                  {fields.length > 1 && <RemoveRowButton onClick={() => remove(index)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <AddRowButton
        label="Add line item"
        onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "18", discountAmount: "0" })}
      />

      {/* Footer */}
      <section className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
            <InlineTextArea name="notes" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Notes" />
          </div>
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms</p>
            <InlineTextArea name="terms" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Terms" />
          </div>
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Remit to</p>
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
              <InlineTextField name="bankName" placeholder="Bank name" />
              <InlineTextField name="bankAccountNumber" placeholder="Account number" />
              <InlineTextField name="bankIfsc" placeholder="IFSC code" />
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.98)] p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span>Subtotal</span><span>{doc.subtotalFormatted}</span></div>
            <div className="flex items-center justify-between"><span>Line discount</span><span>{doc.totalDiscountFormatted}</span></div>
            <div className="flex items-center justify-between"><span>Tax</span><span>{doc.totalTaxFormatted}</span></div>
            {doc.extraCharges > 0 ? (
              <div className="flex items-center justify-between"><span>Extra charges</span><span>{doc.extraChargesFormatted}</span></div>
            ) : null}
            {doc.invoiceLevelDiscount > 0 ? (
              <div className="flex items-center justify-between"><span>Invoice discount</span><span>{doc.invoiceLevelDiscountFormatted}</span></div>
            ) : null}
            <div className="flex items-center justify-between border-t border-[rgba(29,23,16,0.08)] pt-3 font-medium"><span>Grand total</span><span>{doc.grandTotalFormatted}</span></div>
            {doc.visibility.showPaymentSummary ? (
              <>
                <div className="flex items-center justify-between"><span>Paid</span><span>{doc.amountPaidFormatted}</span></div>
                <div className="flex items-center justify-between text-base font-medium text-[var(--voucher-accent)]"><span>Due</span><span>{doc.balanceDueFormatted}</span></div>
              </>
            ) : null}
          </div>
          <div className="mt-6 border-t border-dashed border-[rgba(29,23,16,0.16)] pt-4 text-sm">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Authorized by</p>
            <InlineTextField name="authorizedBy" placeholder="Authorized by" />
          </div>
        </div>
      </section>
    </div>
  );
}
