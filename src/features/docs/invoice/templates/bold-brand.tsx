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
              <h2 className="mt-3 text-[2.05rem] leading-tight text-white">
                {document.branding.salutation ? document.branding.salutation + " " : ""}
                {document.branding.companyName}
              </h2>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-white">
                {document.visibility.showAddress && document.branding.address ? <p className="text-white whitespace-pre-line">{document.branding.address}</p> : null}
                {document.visibility.showEmail && document.branding.email ? <p className="text-white">Email: {document.branding.email}</p> : null}
                {document.visibility.showPhone && document.branding.phone ? <p className="text-white">Phone: {document.branding.phone}</p> : null}
                {document.website ? <p className="text-white">{document.website}</p> : null}
              </div>
            </div>
          </div>
          <div className="min-w-[14rem] rounded-[1.4rem] bg-white/12 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Invoice no.</p>
            <p className="mt-2 text-xl font-medium text-white">{document.invoiceNumber}</p>
            <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-white">Due</p>
            <p className="mt-2 text-sm font-medium text-white">{document.dueDate || document.invoiceDate}</p>
            <p className="mt-5 text-[0.68rem] uppercase tracking-[0.25em] text-white">Net Amount Payable</p>
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
          <p className="mt-3 text-lg font-medium">{document.clientSalutation ? document.clientSalutation + " " : ""}{document.clientName}</p>
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
            {document.clientAddress ? <p className="whitespace-pre-line">{document.clientAddress}</p> : null}
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
            {document.amountPaid > 0 ? (
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Paid</p>
                <p className="mt-2 font-medium">{document.amountPaidFormatted}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <section
        className={cn(
          "document-break-inside-avoid grid gap-4",
          document.visibility.showShippingAddress && document.placeOfSupply
            ? "md:grid-cols-2"
            : "grid-cols-1",
        )}
      >
        {document.visibility.showShippingAddress ? (
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Ship to</p>
            <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.85)] whitespace-pre-line">
              {document.shippingAddress}
            </div>
          </div>
        ) : null}
        {document.placeOfSupply ? (
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
            <div className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.85)]">
              {document.placeOfSupply}
            </div>
          </div>
        ) : null}
      </section>

      {/* Item Table */}
      <section className="overflow-hidden rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.94)]">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <thead className="document-table-head bg-[rgba(29,23,16,0.04)] text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.52)]">
            <tr>
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
              <tr key={`${item.description}-${item.lineTotal}`} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.08)] align-top">
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

      {/* Footer */}
      <section className="document-break-inside-avoid grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {document.notes ? (
            <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
              <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
                {document.notes}
              </div>
            </div>
          ) : null}
          {document.terms ? (
            <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms*</p>
              <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
                {document.terms}
              </div>
            </div>
          ) : null}
          {document.bankName || document.bankAccountNumber || document.bankIfsc ? (
            <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bank details</p>
              <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
                {document.bankName ? <p>{document.bankName}</p> : null}
                {document.bankAccountNumber ? <p>A/c: {document.bankAccountNumber}</p> : null}
                {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
              </div>
            </div>
          ) : null}

          {document.upiId || document.upiQrDataUrl ? (
            <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">UPI Details</p>
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
        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)] p-5">
          <SummaryRow label="Subtotal" value={document.subtotalFormatted} />
          <SummaryRow label="Line discount" value={document.totalDiscountFormatted} />
          <SummaryRow label="Tax" value={document.totalTaxFormatted} />
          {document.extraCharges > 0 ? (
            <SummaryRow label="Extra charges" value={document.extraChargesFormatted} />
          ) : null}
          {document.invoiceLevelDiscount > 0 ? (
            <SummaryRow
              label="Invoice discount"
              value={document.invoiceLevelDiscountFormatted}
            />
          ) : null}
          <div className="border-t border-[rgba(29,23,16,0.08)] pt-2">
            <SummaryRow label="Grand total" value={document.grandTotalFormatted} emphasized />
          </div>
          {document.visibility.showPaymentSummary ? (
            <>
              {document.amountPaid > 0 ? (
                <SummaryRow label="Amount paid" value={document.amountPaidFormatted} />
              ) : null}
              <div className="border-t border-[rgba(29,23,16,0.08)] pt-2">
                <SummaryRow label="Net Amount Payable" value={document.balanceDueFormatted} emphasized />
              </div>
            </>
          ) : null}
          {document.authorizedBy || document.authorizedByDesignation || document.authorizedByCompany ? (
            <div className="mt-6 border-t border-dashed border-[rgba(29,23,16,0.16)] pt-4 text-sm">
              <span className="font-semibold text-xs uppercase tracking-wider text-[rgba(29,23,16,0.55)] block mb-1">Approved By</span>
              {document.authorizedBy && <div className="font-semibold text-[rgba(29,23,16,0.85)]">{document.authorizedBy}</div>}
              {document.authorizedByDesignation && <div className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5">{document.authorizedByDesignation}</div>}
              {document.authorizedByCompany && <div className="text-sm text-[rgba(29,23,16,0.72)] mt-0.5">{document.authorizedByCompany}</div>}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1", emphasized ? "font-medium" : "text-[rgba(29,23,16,0.8)]")}>
      <span className="text-[0.82rem]">{label}</span>
      <span className="text-[0.82rem]">{value}</span>
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
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)]">
        {/* Top brand header with primary color background */}
        <div
          className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--voucher-accent) 94%, white 6%), #7f5a22)",
            color: "white",
          }}
        >
          <div className="flex items-start gap-4">
            <DocumentBrandMark
              branding={document.branding}
              className="flex h-18 w-18 shrink-0 items-center justify-center rounded-[1.4rem] border border-white/20 bg-white/10 p-2"
              initialsClassName="text-lg font-semibold text-white"
              imageClassName="h-full w-full rounded-[1rem] object-cover"
            />
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.32em] text-white">{document.title}</p>
              <div className="mt-3 flex items-baseline gap-1.5">
                {document.branding.salutation ? (
                  <span className="text-[1.5rem] font-medium text-white/70 shrink-0">
                    {document.branding.salutation}
                  </span>
                ) : null}
                <InlineTextField name="branding.companyName" className="text-[2.05rem] leading-tight text-white flex-1" />
              </div>
              <div className="mt-4 space-y-1.5">
                <InlineTextArea name="branding.address" className="text-sm leading-6 text-white" placeholder="Business address" />
                <div className="flex items-center gap-1.5 text-sm text-white leading-6">
                  <span className="opacity-70 text-xs shrink-0">Email:</span>
                  <InlineTextField name="branding.email" className="text-sm leading-6 text-white" placeholder="Business email" />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white leading-6">
                  <span className="opacity-70 text-xs shrink-0">Phone:</span>
                  <InlineTextField name="branding.phone" className="text-sm leading-6 text-white" placeholder="Business phone" />
                </div>
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
            <p className="mt-5 text-[0.68rem] uppercase tracking-[0.25em] text-white">Net Amount Payable</p>
            <p className="mt-2 text-2xl font-medium text-white">{doc.balanceDueFormatted}</p>
          </div>
        </div>
      </section>

      {/* Client + Meta */}
      <section className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bill to</p>
          <InlineTextField name="clientSalutation" placeholder="" className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.45)] w-16" />
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
            {doc.amountPaid > 0 ? (
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Paid</p>
                <p className="mt-2 font-medium">{doc.amountPaidFormatted}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Shipping / Place of supply */}
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
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Shipping address</p>
              <InlineTextArea name="shippingAddress" placeholder="Shipping address" />
            </div>
          ) : null}
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
            <InlineTextField name="placeOfSupply" placeholder="Place of supply" />
          </div>
        </section>
      ) : null}

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
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms*</p>
            <InlineTextArea name="terms" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Terms" />
          </div>
          {doc.visibility.showBankDetails ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Remit to</p>
              <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
                <InlineTextField name="bankName" placeholder="Bank name" />
                <InlineTextField name="bankAccountNumber" placeholder="Account number" />
                <InlineTextField name="bankIfsc" placeholder="IFSC code" />
              </div>
            </div>
          ) : null}

          {doc.visibility.showUpiDetails ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">UPI Details</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[rgba(29,23,16,0.45)]">UPI ID</p>
                  <InlineTextField name="upiId" placeholder="merchant@ybl" className="text-sm font-medium mt-1" />
                </div>
                {doc.upiQrDataUrl ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={doc.upiQrDataUrl}
                      alt="UPI QR Code"
                      className="h-16 w-16 rounded-lg border border-[rgba(29,23,16,0.1)] object-contain p-1 bg-white"
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-[rgba(29,23,16,0.45)] border border-dashed border-[rgba(29,23,16,0.14)] rounded-lg p-2 bg-white">
                    Upload UPI QR in Sidebar
                  </div>
                )}
              </div>
            </div>
          ) : null}
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
                {doc.amountPaid > 0 ? (
                  <div className="flex items-center justify-between"><span>Paid</span><span>{doc.amountPaidFormatted}</span></div>
                ) : null}
                <div className="border-t border-[rgba(29,23,16,0.08)] pt-2 font-medium">
                  <div className="flex items-center justify-between"><span>Net Amount Payable</span><span>{doc.balanceDueFormatted}</span></div>
                </div>
              </>
            ) : null}
          </div>
          <div className="mt-6 border-t border-dashed border-[rgba(29,23,16,0.16)] pt-4 text-sm">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Approved By</p>
            <InlineTextField name="authorizedBy" placeholder="Name" className="font-semibold text-[rgba(29,23,16,0.85)]" />
            <InlineTextField name="authorizedByDesignation" placeholder="Designation" className="mt-0.5 text-sm text-[rgba(29,23,16,0.65)]" />
            <InlineTextField name="authorizedByCompany" placeholder="Company Name" className="mt-0.5 text-sm text-[rgba(29,23,16,0.65)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
