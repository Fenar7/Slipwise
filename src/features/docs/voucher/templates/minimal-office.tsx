"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import {
  InlineDateField,
  InlineNumberField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";
import { cn } from "@/lib/utils";
import type { VoucherDocument, VoucherFormValues } from "@/features/docs/voucher/types";
import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";

type VoucherTemplateProps = {
  document: VoucherDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
};

function HeaderBrand({ document }: VoucherTemplateProps) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-[rgba(29,23,16,0.45)]">
          {document.title}
        </p>
        <h2 className="mt-3 text-[1.85rem] font-medium leading-tight text-[var(--voucher-ink)]">
          {document.branding.companyName || "Slipwise"}
        </h2>
        <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.68)]">
          {document.visibility.showAddress && document.branding.address ? (
            <p className="whitespace-pre-line">{document.branding.address}</p>
          ) : null}
          {document.visibility.showEmail && document.branding.email ? (
            <p>{document.branding.email}</p>
          ) : null}
          {document.visibility.showPhone && document.branding.phone ? (
            <p>{document.branding.phone}</p>
          ) : null}
        </div>
      </div>
      <DocumentBrandMark branding={document.branding} />
    </div>
  );
}

export function MinimalOfficeVoucherTemplate({
  document,
  mode = "preview",
}: VoucherTemplateProps) {
  if (mode === "edit") {
    return <MinimalOfficeEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <HeaderBrand document={document} />

      <div
        className={cn(
          "document-break-inside-avoid grid gap-4",
          printLikeMode ? "grid-cols-[1.15fr_0.85fr]" : "md:grid-cols-[1.15fr_0.85fr]",
        )}
      >
        <section className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <div
            className={cn(
              "grid gap-4",
              printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
            )}
          >
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Voucher no.
              </p>
              <p className="mt-2 text-base font-medium">{document.voucherNumber}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Date
              </p>
              <p className="mt-2 text-base font-medium">{document.date}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                {document.counterpartyLabel}
              </p>
              <p className="mt-2 text-base font-medium">{document.counterpartyName}</p>
            </div>
            {document.paymentMode ? (
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  Payment mode
                </p>
                <p className="mt-2 text-base font-medium">{document.paymentMode}</p>
              </div>
            ) : null}
            {document.referenceNumber ? (
              <div className="sm:col-span-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  Reference
                </p>
                <p className="mt-2 text-base font-medium">{document.referenceNumber}</p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="rounded-[1.5rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-white">
            Amount
          </p>
          <p className="mt-3 text-3xl font-medium text-white">{document.amountFormatted}</p>
          <p className="mt-4 text-sm leading-7 text-white">{document.amountInWords}</p>
        </aside>
      </div>

      <section className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Purpose / Narration
        </p>
        <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
          {document.purpose}
        </p>
      </section>

      {/* UPI Details */}
      {document.visibility.showUpiDetails && (document.upiId || document.upiQrDataUrl) ? (
        <section className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.72)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
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
              <div className="flex flex-col items-center">
                <img
                  src={document.upiQrDataUrl}
                  alt="UPI QR Code"
                  className="h-20 w-20 rounded-lg border border-[rgba(29,23,16,0.1)] object-contain p-1 bg-white"
                />
                <span className="text-[10px] text-[rgba(29,23,16,0.45)] mt-1">Scan to Pay</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {document.notes ? (
        <section className="document-break-inside-avoid rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Notes
          </p>
          <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]">
            {document.notes}
          </p>
        </section>
      ) : null}

      {document.visibility.showSignatureArea ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            (!printLikeMode || (document.approvedBy && document.receivedBy))
              ? (printLikeMode ? "grid-cols-2" : "md:grid-cols-2")
              : "grid-cols-1",
          )}
        >
          {(!printLikeMode || document.approvedBy) ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
              <p className="mt-4 text-sm font-medium text-[rgba(29,23,16,0.82)]">
                {document.approvedBy ? `Authorized by: ${document.approvedBy}` : "Authorized by"}
              </p>
            </div>
          ) : null}
          {(!printLikeMode || document.receivedBy) ? (
            <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
              <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
              <p className="mt-4 text-sm font-medium text-[rgba(29,23,16,0.82)]">
                {document.receivedBy ? `Received by: ${document.receivedBy}` : "Received by"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MinimalOfficeEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      {/* Header brand */}
      <div className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-6">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-[rgba(29,23,16,0.45)]">
            {doc.title}
          </p>
          <InlineTextField
            name="branding.companyName"
            placeholder="Company Name"
            className="mt-3 text-[1.85rem] font-medium leading-tight"
          />
          <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.68)]">
            <InlineTextArea name="branding.address" placeholder="Company address" />
            <InlineTextField name="branding.email" placeholder="Email" />
            <InlineTextField name="branding.phone" placeholder="Phone" />
          </div>
        </div>
        <DocumentBrandMark branding={doc.branding} />
      </div>

      {/* Details + amount */}
      <div className="document-break-inside-avoid grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Voucher no.
              </p>
              <InlineTextField name="voucherNumber" placeholder="VCH-001" className="mt-2 text-base font-medium" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Date
              </p>
              <InlineDateField name="date" className="mt-2 text-base font-medium" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                {doc.counterpartyLabel}
              </p>
              <InlineTextField name="counterpartyName" placeholder="Name" className="mt-2 text-base font-medium" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Amount
              </p>
              <InlineNumberField name="amount" placeholder="0.00" className="mt-2 text-base font-medium" />
            </div>
            {doc.visibility.showPaymentMode ? (
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  Payment mode
                </p>
                <InlineTextField name="paymentMode" placeholder="Cash / Cheque" className="mt-2 text-base font-medium" />
              </div>
            ) : null}
            {doc.visibility.showReferenceNumber ? (
              <div className="sm:col-span-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  Reference
                </p>
                <InlineTextField name="referenceNumber" placeholder="Reference number" className="mt-2 text-base font-medium" />
              </div>
            ) : null}
          </div>
        </section>

        <aside className="rounded-[1.5rem] p-5 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-white">Amount</p>
          <p className="mt-3 text-3xl font-medium text-white">{doc.amountFormatted}</p>
          <p className="mt-4 text-sm leading-7 text-white">{doc.amountInWords}</p>
        </aside>
      </div>

      {/* Purpose */}
      <section className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Purpose / Narration
        </p>
        <InlineTextArea name="purpose" placeholder="Purpose of payment…" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.82)]" />
      </section>

      {/* UPI Details */}
      {doc.visibility.showUpiDetails ? (
        <section className="document-break-inside-avoid rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">UPI Details</p>
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
                  className="h-20 w-20 rounded-lg border border-[rgba(29,23,16,0.1)] object-contain p-1 bg-white"
                />
                <span className="text-[10px] text-[rgba(29,23,16,0.45)] mt-1">Scan to Pay</span>
              </div>
            ) : (
              <div className="text-[11px] text-[rgba(29,23,16,0.45)] border border-dashed border-[rgba(29,23,16,0.12)] rounded-lg p-3 bg-white">
                Upload UPI QR in Sidebar
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Notes */}
      {doc.visibility.showNotes ? (
        <section className="document-break-inside-avoid rounded-[1.5rem] border border-dashed border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.72)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
          <InlineTextArea name="notes" placeholder="Additional notes…" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]" />
        </section>
      ) : null}

      {/* Signatures */}
      {doc.visibility.showSignatureArea ? (
        <section className="document-break-inside-avoid grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.82)]">
              <span className="shrink-0">Authorized by:</span>
              <InlineTextField name="approvedBy" placeholder="Name" className="text-sm font-medium" />
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.82)]">
              <span className="shrink-0">Received by:</span>
              <InlineTextField name="receivedBy" placeholder="Name" className="text-sm font-medium" />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
