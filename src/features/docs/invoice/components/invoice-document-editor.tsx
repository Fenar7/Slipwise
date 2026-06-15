"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { normalizeInvoice } from "@/features/docs/invoice/utils/normalize-invoice";
import type { InvoiceFormValues } from "@/features/docs/invoice/types";
import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import {
  DocumentEditorRoot,
  InlineDateField,
  InlineNumberField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";

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

export function InvoiceDocumentEditor() {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const watchedValues = useWatch({ control }) as InvoiceFormValues;
  const doc = normalizeInvoice(watchedValues);

  const branding = doc.branding;

  return (
    <DocumentEditorRoot branding={branding}>
      {/* ── 1. Header ── */}
      <section className="document-break-inside-avoid flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
        <div className="flex items-start gap-4">
          <DocumentBrandMark branding={branding} />
          <div className="space-y-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                Tax Invoice
              </p>
              <div className="flex items-baseline gap-1">
                {branding.salutation ? (
                  <span className="text-[1.5rem] font-medium text-[rgba(29,23,16,0.55)] shrink-0">
                    {branding.salutation}
                  </span>
                ) : null}
                <InlineTextField
                  name="branding.companyName"
                  placeholder="Company Name"
                  className="mt-3 text-[1.95rem] leading-tight flex-1"
                />
              </div>
            </div>
            <div className="space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
              <InlineTextArea
                name="branding.address"
                placeholder="Company address"
                className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
              />
              <div className="flex items-center gap-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-xs shrink-0">Email:</span>
                <InlineTextField
                  name="branding.email"
                  placeholder="Email"
                  className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
                />
              </div>
              <div className="flex items-center gap-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
                <span className="opacity-70 text-xs shrink-0">Phone:</span>
                <InlineTextField
                  name="branding.phone"
                  placeholder="Phone"
                  className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
                />
              </div>
              <InlineTextField
                name="website"
                placeholder="Website"
                className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
              />
              <InlineTextField
                name="businessTaxId"
                placeholder="GSTIN / Tax ID"
                className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] px-5 py-4 text-right">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice no.
          </p>
          <InlineTextField
            name="invoiceNumber"
            placeholder="INV-001"
            className="mt-2 text-xl font-medium text-right"
          />
          <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Invoice date
          </p>
          <InlineDateField name="invoiceDate" className="mt-2 text-sm font-medium text-right" />
          <p className="mt-4 text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Due date
          </p>
          <InlineDateField name="dueDate" className="mt-2 text-sm font-medium text-right" />
        </div>
      </section>

      {/* ── 2. Bill To + Balance Due ── */}
      <section className="document-break-inside-avoid grid md:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Bill to
          </p>
          <InlineTextField
            name="clientSalutation"
            placeholder=""
            className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.45)] w-16"
          />
          <InlineTextField
            name="clientName"
            placeholder="Client / Company Name"
            className="mt-3 text-base font-medium"
          />
          <div className="mt-3 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.7)]">
            <InlineTextArea
              name="clientAddress"
              placeholder="Client address"
              className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
            />
            <InlineTextField
              name="clientEmail"
              placeholder="Client email"
              className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
            />
            <InlineTextField
              name="clientPhone"
              placeholder="Client phone"
              className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
            />
            <InlineTextField
              name="clientTaxId"
              placeholder="Client Tax ID"
              className="text-sm leading-6 text-[rgba(29,23,16,0.7)]"
            />
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

      {/* ── 3. Shipping + Place of Supply ── */}
      <section className="document-break-inside-avoid grid md:grid-cols-2 gap-4">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Ship to
          </p>
          <InlineTextArea
            name="shippingAddress"
            placeholder="Shipping address"
            className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]"
          />
        </div>
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Place of supply
          </p>
          <InlineTextField
            name="placeOfSupply"
            placeholder="State"
            className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.82)]"
          />
        </div>
      </section>

      {/* ── 4. Line Items Table ── */}
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
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const item = doc.lineItems[index];
              return (
                <tr key={field.id} className="document-table-row-avoid border-t border-[rgba(29,23,16,0.07)] align-top">
                  <td className="px-4 py-4">
                    <InlineTextField
                      name={`lineItems.${index}.description`}
                      placeholder="Item description"
                      className="text-[rgba(29,23,16,0.84)]"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField
                      name={`lineItems.${index}.quantity`}
                      placeholder="1"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField
                      name={`lineItems.${index}.unitPrice`}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField
                      name={`lineItems.${index}.discountAmount`}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <InlineNumberField
                      name={`lineItems.${index}.taxRate`}
                      placeholder="18"
                    />
                  </td>
                  <td className="px-4 py-4 text-right font-medium">
                    {item?.lineTotalFormatted}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {fields.length > 1 && (
                      <RemoveRowButton onClick={() => remove(index)} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddRowButton
        label="Add line item"
        onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "18", discountAmount: "0" })}
      />

      {/* ── 5. Notes/Terms + Totals ── */}
      <section className="grid md:grid-cols-[1fr_18rem] gap-4">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Notes
            </p>
            <InlineTextArea
              name="notes"
              placeholder="Notes to client…"
              className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]"
            />
          </div>
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.84)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Terms*
            </p>
            <InlineTextArea
              name="terms"
              placeholder="Terms and conditions…"
              className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]"
            />
          </div>
        </div>

        <div>
          <div className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
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
            </div>
          </div>

          <div className="mt-4 space-y-3 px-1">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Extra charges
              </p>
              <InlineNumberField name="extraCharges" placeholder="0" className="text-sm" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Invoice discount
              </p>
              <InlineNumberField name="invoiceLevelDiscount" placeholder="0" className="text-sm" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Amount paid
              </p>
              <InlineNumberField name="amountPaid" placeholder="0" className="text-sm" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Bank Details ── */}
      <section className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Bank Details
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Bank</p>
            <InlineTextField name="bankName" placeholder="Bank name" className="mt-1 text-sm" />
          </div>
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Account No.</p>
            <InlineTextField name="bankAccountNumber" placeholder="Account number" className="mt-1 text-sm" />
          </div>
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">IFSC</p>
            <InlineTextField name="bankIfsc" placeholder="IFSC code" className="mt-1 text-sm" />
          </div>
        </div>
      </section>

      {/* ── 7. Signature ── */}
      <section className="flex justify-end">
        <div className="w-64 text-center">
          <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(29,23,16,0.45)]">
            Approved By
          </p>
          <InlineTextField
            name="authorizedBy"
            placeholder="Name"
            className="mt-1 text-center text-sm font-semibold text-[rgba(29,23,16,0.85)]"
          />
          <InlineTextField
            name="authorizedByDesignation"
            placeholder="Designation"
            className="mt-0.5 text-center text-sm text-[rgba(29,23,16,0.7)]"
          />
          <InlineTextField
            name="authorizedByCompany"
            placeholder="Company name"
            className="mt-0.5 text-center text-sm text-[rgba(29,23,16,0.7)]"
          />
        </div>
      </section>
    </DocumentEditorRoot>
  );
}
