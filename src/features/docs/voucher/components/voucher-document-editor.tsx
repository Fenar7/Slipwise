"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";
import type { VoucherFormValues } from "@/features/docs/voucher/types";
import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import {
  DocumentEditorRoot,
  InlineDateField,
  InlineNumberField,
  InlineSelectField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";

const PAYMENT_MODE_OPTIONS = [
  { value: "", label: "Select mode" },
  { value: "Cash", label: "Cash" },
  { value: "Cheque", label: "Cheque" },
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "IMPS", label: "IMPS" },
  { value: "UPI", label: "UPI" },
  { value: "Bank Transfer", label: "Bank Transfer" },
];

export function VoucherDocumentEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);
  const branding = doc.branding;

  return (
    <DocumentEditorRoot branding={branding}>
      {/* Header Brand */}
      <div className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-[rgba(29,23,16,0.45)]">
            {doc.title}
          </p>
          <InlineTextField
            name="branding.companyName"
            placeholder="Company Name"
            className="mt-3 text-[1.85rem] font-medium leading-tight text-[var(--voucher-ink)]"
          />
          <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.68)]">
            <InlineTextArea
              name="branding.address"
              placeholder="Company address"
            />
            <InlineTextField name="branding.email" placeholder="Email" />
            <InlineTextField name="branding.phone" placeholder="Phone" />
          </div>
        </div>
        <DocumentBrandMark branding={branding} />
      </div>

      {/* Meta grid */}
      <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        {/* Left card — editable fields */}
        <section className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Voucher no.
              </p>
              <InlineTextField
                name="voucherNumber"
                placeholder="Voucher no."
                className="mt-2 text-base font-medium"
              />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Date
              </p>
              <InlineDateField
                name="date"
                className="mt-2 text-base font-medium"
              />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                {doc.counterpartyLabel}
              </p>
              <InlineTextField
                name="counterpartyName"
                placeholder="Name"
                className="mt-2 text-base font-medium"
              />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Payment mode
              </p>
              <InlineSelectField
                name="paymentMode"
                options={PAYMENT_MODE_OPTIONS}
                className="mt-2 text-base font-medium"
              />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Amount
              </p>
              <InlineNumberField
                name="amount"
                placeholder="0.00"
                className="mt-2 text-base font-medium"
              />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Reference
              </p>
              <InlineTextField
                name="referenceNumber"
                placeholder="Reference number"
                className="mt-2 text-base font-medium"
              />
            </div>
          </div>
        </section>

        {/* Right accent box — display-only */}
        <aside
          className="rounded-[1.5rem] p-5 text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-white">
            Amount
          </p>
          <p className="mt-3 text-3xl font-medium text-white">
            {doc.amountFormatted}
          </p>
          <p className="mt-4 text-sm leading-7 text-white">
            {doc.amountInWords}
          </p>
        </aside>
      </div>

      {/* Purpose section */}
      <section className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Purpose / Narration
        </p>
        <InlineTextArea
          name="purpose"
          placeholder="Purpose of payment…"
          className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]"
        />
      </section>

      {/* Notes section — always shown in editor */}
      <section className="rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Notes
        </p>
        <InlineTextArea
          name="notes"
          placeholder="Additional notes…"
          className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]"
        />
      </section>

      {/* Signature section */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
          <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
          <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.82)]">
            <span>Approved by:</span>
            <InlineTextField
              name="approvedBy"
              placeholder="Name"
              className="text-sm font-medium text-[rgba(29,23,16,0.82)]"
            />
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
          <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
          <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.82)]">
            <span>Received by:</span>
            <InlineTextField
              name="receivedBy"
              placeholder="Name"
              className="text-sm font-medium text-[rgba(29,23,16,0.82)]"
            />
          </div>
        </div>
      </section>
    </DocumentEditorRoot>
  );
}
