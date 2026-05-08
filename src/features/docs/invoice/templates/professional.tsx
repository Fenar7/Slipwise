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

function ProfessionalEditor({ document }: { document: InvoiceDocument }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.75rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)]">
        <div className="grid gap-5 border-b border-[rgba(29,23,16,0.08)] p-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="flex items-start gap-4">
            <DocumentBrandMark branding={document.branding} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                {document.title}
              </p>
              <InlineTextField name="branding.companyName" className="mt-3 text-[2rem] leading-tight" />
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
                <InlineTextArea name="branding.address" placeholder="Business address" />
                <InlineTextField name="branding.email" placeholder="Business email" />
                <InlineTextField name="branding.phone" placeholder="Business phone" />
                <InlineTextField name="website" placeholder="Website" />
                <InlineTextField name="businessTaxId" placeholder="Tax ID / GSTIN" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.4rem] bg-[rgba(29,23,16,0.04)] p-5">
            <div className="grid gap-3 text-sm">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice no.</p>
                <InlineTextField name="invoiceNumber" className="mt-2 font-medium" />
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice date</p>
                <InlineDateField name="invoiceDate" className="mt-2 font-medium" />
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Due date</p>
                <InlineDateField name="dueDate" className="mt-2 font-medium" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-[1fr_18rem]">
          <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-white p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Client details</p>
            <InlineTextField name="clientName" className="mt-3 text-base font-medium" placeholder="Client name" />
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              <InlineTextArea name="clientAddress" placeholder="Client address" />
              <InlineTextField name="clientEmail" placeholder="Client email" />
              <InlineTextField name="clientPhone" placeholder="Client phone" />
              <InlineTextField name="clientTaxId" placeholder="Client Tax ID" />
            </div>
          </div>
          <div className="rounded-[1.4rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Grand total</p>
            <p className="mt-3 text-3xl font-medium text-white">{doc.grandTotalFormatted}</p>
            <p className="mt-4 text-sm leading-7 text-white">{doc.amountInWords}</p>
          </div>
        </div>
      </section>

      <section className="document-break-inside-avoid grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Shipping address</p>
          <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
            <InlineTextArea name="shippingAddress" placeholder="Shipping address" />
          </div>
        </div>
        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
          <div className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.82)]">
            <InlineTextField name="placeOfSupply" placeholder="Place of supply" />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)]">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <thead className="document-table-head bg-[rgba(29,23,16,0.04)] text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.52)]">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Tax</th>
              <th className="px-4 py-3 text-right">Line total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={field.id} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.08)] align-top">
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
        <div className="px-4 pb-4">
          <AddRowButton
            label="Add line item"
            onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "18", discountAmount: "0" })}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
            <InlineTextArea name="notes" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Notes" />
          </div>
          <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms</p>
            <InlineTextArea name="terms" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" placeholder="Terms" />
          </div>
          <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bank details</p>
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
              <InlineTextField name="bankName" placeholder="Bank name" />
              <InlineTextField name="bankAccountNumber" placeholder="Account number" />
              <InlineTextField name="bankIfsc" placeholder="IFSC code" />
            </div>
          </div>
        </div>
        <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)] p-5">
          <SummaryRow label="Subtotal" value={doc.subtotalFormatted} />
          <SummaryRow label="Line discount" value={doc.totalDiscountFormatted} />
          <SummaryRow label="Tax" value={doc.totalTaxFormatted} />
          {doc.extraCharges > 0 ? (
            <SummaryRow label="Extra charges" value={doc.extraChargesFormatted} />
          ) : null}
          {doc.invoiceLevelDiscount > 0 ? (
            <SummaryRow label="Invoice discount" value={doc.invoiceLevelDiscountFormatted} />
          ) : null}
          <div className="border-t border-[rgba(29,23,16,0.08)] pt-2">
            <SummaryRow label="Grand total" value={doc.grandTotalFormatted} emphasized />
          </div>
          {doc.visibility.showPaymentSummary ? (
            <>
              <SummaryRow label="Amount paid" value={doc.amountPaidFormatted} />
              <div className="border-t border-[rgba(29,23,16,0.08)] pt-2">
                <SummaryRow label="Balance due" value={doc.balanceDueFormatted} emphasized />
              </div>
            </>
          ) : null}
          <div className="mt-6 border-t border-dashed border-[rgba(29,23,16,0.16)] pt-4 text-sm">
            Authorized by: <InlineTextField name="authorizedBy" />
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 text-sm ${emphasized ? "font-medium text-[var(--voucher-ink)]" : "text-[rgba(29,23,16,0.72)]"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ProfessionalInvoiceTemplate({
  document,
  mode = "preview",
}: {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
}) {
  if (mode === "edit") { return <ProfessionalEditor document={document} />; }
  const printLike = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.75rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)]">
        <div
          className={cn(
            "grid gap-5 border-b border-[rgba(29,23,16,0.08)] p-6",
            printLike ? "grid-cols-[1.2fr_0.8fr]" : "md:grid-cols-[1.2fr_0.8fr]",
          )}
        >
          <div className="flex items-start gap-4">
            <DocumentBrandMark branding={document.branding} />
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                {document.title}
              </p>
              <h2 className="mt-3 text-[2rem] leading-tight">{document.branding.companyName}</h2>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
                {document.visibility.showAddress && document.branding.address ? <p>{document.branding.address}</p> : null}
                {document.visibility.showEmail && document.branding.email ? <p>{document.branding.email}</p> : null}
                {document.visibility.showPhone && document.branding.phone ? <p>{document.branding.phone}</p> : null}
                {document.website ? <p>{document.website}</p> : null}
                {document.businessTaxId ? <p>{document.businessTaxId}</p> : null}
              </div>
            </div>
          </div>
          <div className="rounded-[1.4rem] bg-[rgba(29,23,16,0.04)] p-5">
            <div className="grid gap-3 text-sm">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice no.</p>
                <p className="mt-2 font-medium">{document.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Invoice date</p>
                <p className="mt-2 font-medium">{document.invoiceDate}</p>
              </div>
              {document.dueDate ? (
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Due date</p>
                  <p className="mt-2 font-medium">{document.dueDate}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-4 p-6",
            printLike ? "grid-cols-[1fr_18rem]" : "md:grid-cols-[1fr_18rem]",
          )}
        >
          <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-white p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Client details</p>
            <p className="mt-3 text-base font-medium">{document.clientName}</p>
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.72)]">
              {document.clientAddress ? <p>{document.clientAddress}</p> : null}
              {document.clientEmail ? <p>{document.clientEmail}</p> : null}
              {document.clientPhone ? <p>{document.clientPhone}</p> : null}
              {document.clientTaxId ? <p>Tax ID: {document.clientTaxId}</p> : null}
            </div>
          </div>
          <div className="rounded-[1.4rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Grand total</p>
            <p className="mt-3 text-3xl font-medium text-white">{document.grandTotalFormatted}</p>
            <p className="mt-4 text-sm leading-7 text-white">{document.amountInWords}</p>
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
            <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Shipping address</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.shippingAddress}</p>
            </div>
          ) : null}
          {document.placeOfSupply ? (
            <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Place of supply</p>
              <p className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.82)]">{document.placeOfSupply}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)]">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <thead className="document-table-head bg-[rgba(29,23,16,0.04)] text-[0.68rem] uppercase tracking-[0.2em] text-[rgba(29,23,16,0.52)]">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Tax</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {document.lineItems.map((item) => (
              <tr key={`${item.description}-${item.lineTotal}`} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.08)] align-top">
                <td className="px-4 py-4 text-[rgba(29,23,16,0.84)]">{item.description}</td>
                <td className="px-4 py-4">{item.quantity}</td>
                <td className="px-4 py-4">{item.baseAmountFormatted}</td>
                <td className="px-4 py-4">{item.discountAmountFormatted}</td>
                <td className="px-4 py-4">{item.taxAmountFormatted}</td>
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
            <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.notes}</p>
            </div>
          ) : null}
          {document.terms ? (
            <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Terms</p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">{document.terms}</p>
            </div>
          ) : null}
          {document.bankName || document.bankAccountNumber || document.bankIfsc ? (
            <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bank details</p>
              <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.82)]">
                {document.bankName ? <p>{document.bankName}</p> : null}
                {document.bankAccountNumber ? <p>A/c: {document.bankAccountNumber}</p> : null}
                {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="document-break-inside-avoid rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)] p-5">
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
              <SummaryRow label="Amount paid" value={document.amountPaidFormatted} />
              <div className="border-t border-[rgba(29,23,16,0.08)] pt-2">
                <SummaryRow label="Balance due" value={document.balanceDueFormatted} emphasized />
              </div>
            </>
          ) : null}
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
