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

export function FormalBorderedVoucherTemplate({
  document,
  mode = "preview",
}: VoucherTemplateProps) {
  if (mode === "edit") {
    return <FormalBorderedEditor />;
  }

  const printLikeMode = mode !== "preview";

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Voucher No.", value: document.voucherNumber },
    { label: "Date", value: document.date },
    { label: document.counterpartyLabel, value: document.counterpartyName },
    {
      label: "Amount",
      value: `${document.amountFormatted}  —  ${document.amountInWords}`,
    },
  ];
  if (document.visibility.showPaymentMode && document.paymentMode) {
    rows.push({ label: "Payment Mode", value: document.paymentMode });
  }
  if (document.visibility.showReferenceNumber && document.referenceNumber) {
    rows.push({ label: "Reference No.", value: document.referenceNumber });
  }
  rows.push({ label: "Purpose", value: document.purpose });
  if (document.visibility.showUpiDetails && (document.upiId || document.upiQrDataUrl)) {
    rows.push({
      label: "UPI Details",
      value: (
        <div className="flex items-center gap-4 text-sm font-medium">
          {document.upiId ? <span>ID: {document.upiId}</span> : null}
          {document.upiQrDataUrl ? (
            <img
              src={document.upiQrDataUrl}
              alt="UPI QR Code"
              className="h-10 w-10 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white"
            />
          ) : null}
        </div>
      )
    });
  }
  if (document.visibility.showNotes && document.notes) {
    rows.push({ label: "Notes", value: document.notes });
  }

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      {/* Outer double border */}
      <div className="document-break-inside-avoid border-2 border-[var(--voucher-ink)] p-1">
        <div className="border border-[rgba(29,23,16,0.35)]">
          {/* Top banner */}
          <div className="flex items-center justify-between border-b border-[rgba(29,23,16,0.35)] px-6 py-4">
            <div className="flex items-center gap-3">
              <DocumentBrandMark
                branding={document.branding}
                className="flex h-10 w-10 shrink-0 items-center justify-center border border-[rgba(29,23,16,0.15)] bg-[rgba(255,255,255,0.9)] p-1.5"
                initialsClassName="text-xs font-bold text-[var(--voucher-accent)]"
                imageClassName="h-full w-full object-cover"
              />
              <span className="text-lg font-semibold">
                {document.branding.companyName || "Slipwise"}
              </span>
            </div>
            <h1 className="text-xl font-bold uppercase tracking-[0.16em]">
              {document.voucherType === "payment"
                ? "Payment Voucher"
                : "Receipt Voucher"}
            </h1>
          </div>

          {/* Company details row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[rgba(29,23,16,0.2)] px-6 py-2 text-xs text-[rgba(29,23,16,0.6)]">
            {document.visibility.showAddress && document.branding.address ? (
              <span className="whitespace-pre-line">{document.branding.address}</span>
            ) : null}
            {document.visibility.showEmail && document.branding.email ? (
              <span>{document.branding.email}</span>
            ) : null}
            {document.visibility.showPhone && document.branding.phone ? (
              <span>{document.branding.phone}</span>
            ) : null}
          </div>

          {/* Structured form rows — zebra striped */}
          <div>
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={cn(
                  "grid gap-2 border-b border-[rgba(29,23,16,0.12)] px-6 py-3 text-sm last:border-b-0",
                  printLikeMode
                    ? "grid-cols-[9rem_1fr]"
                    : "grid-cols-[9rem_1fr]",
                  i % 2 === 0
                    ? "bg-[rgba(29,23,16,0.03)]"
                    : "bg-transparent",
                )}
              >
                <span className="font-semibold uppercase tracking-[0.1em] text-[rgba(29,23,16,0.52)]">
                  {row.label}
                </span>
                <span className="text-[rgba(29,23,16,0.85)]">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Signature section */}
          {document.visibility.showSignatureArea ? (
            <div
              className={cn(
                "document-break-inside-avoid grid border-t border-[rgba(29,23,16,0.35)]",
                (!printLikeMode || (document.approvedBy && document.receivedBy))
                  ? (printLikeMode ? "grid-cols-2" : "md:grid-cols-2")
                  : "grid-cols-1",
              )}
            >
              {document.visibility.showApprovedBy && (!printLikeMode || document.approvedBy) ? (
                <div
                  className={cn(
                    "px-6 py-5",
                    printLikeMode
                      ? (document.receivedBy ? "border-r border-[rgba(29,23,16,0.2)]" : "")
                      : "md:border-r md:border-[rgba(29,23,16,0.2)]",
                  )}
                >
                  <div className="mt-8 border-b border-dotted border-[rgba(29,23,16,0.4)]" />
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.5)]">
                    {document.approvedBy
                      ? `Authorized by: ${document.approvedBy}`
                      : "Authorized by"}
                  </p>
                </div>
              ) : null}
              {document.visibility.showReceivedBy && (!printLikeMode || document.receivedBy) ? (
                <div className="px-6 py-5">
                  <div className="mt-8 border-b border-dotted border-[rgba(29,23,16,0.4)]" />
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.5)]">
                    {document.receivedBy
                      ? `Received by: ${document.receivedBy}`
                      : "Received by"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FormalBorderedEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);

  const rowClass = (i: number) =>
    cn(
      "grid grid-cols-[9rem_1fr] gap-2 border-b border-[rgba(29,23,16,0.12)] px-6 py-3 text-sm last:border-b-0",
      i % 2 === 0 ? "bg-[rgba(29,23,16,0.03)]" : "bg-transparent",
    );

  const labelClass = "font-semibold uppercase tracking-[0.1em] text-[rgba(29,23,16,0.52)]";

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      <div className="document-break-inside-avoid border-2 border-[var(--voucher-ink)] p-1">
        <div className="border border-[rgba(29,23,16,0.35)]">
          {/* Top banner */}
          <div className="flex items-center justify-between border-b border-[rgba(29,23,16,0.35)] px-6 py-4">
            <div className="flex items-center gap-3">
              <DocumentBrandMark
                branding={doc.branding}
                className="flex h-10 w-10 shrink-0 items-center justify-center border border-[rgba(29,23,16,0.15)] bg-[rgba(255,255,255,0.9)] p-1.5"
                initialsClassName="text-xs font-bold text-[var(--voucher-accent)]"
                imageClassName="h-full w-full object-cover"
              />
              <InlineTextField
                name="branding.companyName"
                placeholder="Company Name"
                className="text-lg font-semibold"
              />
            </div>
            <h1 className="shrink-0 text-xl font-bold uppercase tracking-[0.16em]">
              {doc.title}
            </h1>
          </div>

          {/* Company details row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[rgba(29,23,16,0.2)] px-6 py-2 text-xs text-[rgba(29,23,16,0.6)]">
            {doc.visibility.showAddress ? (
              <InlineTextArea name="branding.address" placeholder="Company address" className="text-xs" />
            ) : null}
            {doc.visibility.showEmail ? (
              <InlineTextField name="branding.email" placeholder="Email" className="text-xs" />
            ) : null}
            {doc.visibility.showPhone ? (
              <InlineTextField name="branding.phone" placeholder="Phone" className="text-xs" />
            ) : null}
          </div>

          {/* Structured form rows */}
          <div>
            <div className={rowClass(0)}>
              <span className={labelClass}>Voucher No.</span>
              <InlineTextField name="voucherNumber" placeholder="VCH-001" className="text-sm text-[rgba(29,23,16,0.85)]" />
            </div>
            <div className={rowClass(1)}>
              <span className={labelClass}>Date</span>
              <InlineDateField name="date" className="text-sm text-[rgba(29,23,16,0.85)]" />
            </div>
            <div className={rowClass(2)}>
              <span className={labelClass}>{doc.counterpartyLabel}</span>
              <InlineTextField name="counterpartyName" placeholder="Name" className="text-sm text-[rgba(29,23,16,0.85)]" />
            </div>
            <div className={rowClass(3)}>
              <span className={labelClass}>Amount</span>
              <div className="flex items-center gap-2">
                <InlineNumberField name="amount" placeholder="0.00" className="text-sm text-[rgba(29,23,16,0.85)]" />
                <span className="shrink-0 text-xs text-[rgba(29,23,16,0.55)]">{doc.amountInWords}</span>
              </div>
            </div>
            {doc.visibility.showPaymentMode ? (
              <div className={rowClass(4)}>
                <span className={labelClass}>Payment Mode</span>
                <InlineTextField name="paymentMode" placeholder="Cash / Cheque" className="text-sm text-[rgba(29,23,16,0.85)]" />
              </div>
            ) : null}
            {doc.visibility.showReferenceNumber ? (
              <div className={rowClass(5)}>
                <span className={labelClass}>Reference No.</span>
                <InlineTextField name="referenceNumber" placeholder="Reference number" className="text-sm text-[rgba(29,23,16,0.85)]" />
              </div>
            ) : null}
            <div className={rowClass(6)}>
              <span className={labelClass}>Purpose</span>
              <InlineTextArea name="purpose" placeholder="Purpose of payment…" className="text-sm text-[rgba(29,23,16,0.85)]" />
            </div>
            {doc.visibility.showUpiDetails ? (
              <div className={rowClass(7)}>
                <span className={labelClass}>UPI Details</span>
                <div className="flex items-center gap-4">
                  <InlineTextField name="upiId" placeholder="UPI ID (merchant@ybl)" className="text-sm text-[rgba(29,23,16,0.85)]" />
                  {doc.upiQrDataUrl ? (
                    <img
                      src={doc.upiQrDataUrl}
                      alt="UPI QR Code"
                      className="h-8 w-8 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {doc.visibility.showNotes ? (
              <div className={rowClass(7)}>
                <span className={labelClass}>Notes</span>
                <InlineTextArea name="notes" placeholder="Additional notes…" className="text-sm text-[rgba(29,23,16,0.85)]" />
              </div>
            ) : null}
          </div>

          {/* Signature section */}
          {doc.visibility.showSignatureArea ? (
            <div className="document-break-inside-avoid grid border-t border-[rgba(29,23,16,0.35)] md:grid-cols-2">
              {doc.visibility.showApprovedBy ? (
                <div className="px-6 py-5 md:border-r md:border-[rgba(29,23,16,0.2)]">
                  <div className="mt-8 border-b border-dotted border-[rgba(29,23,16,0.4)]" />
                  <div className="mt-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.5)]">
                    <span className="shrink-0">Authorized by:</span>
                    <InlineTextField name="approvedBy" placeholder="Name" className="text-xs font-semibold uppercase tracking-[0.14em]" />
                  </div>
                </div>
              ) : null}
              {doc.visibility.showReceivedBy ? (
                <div className="px-6 py-5">
                  <div className="mt-8 border-b border-dotted border-[rgba(29,23,16,0.4)]" />
                  <div className="mt-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.5)]">
                    <span className="shrink-0">Received by:</span>
                    <InlineTextField name="receivedBy" placeholder="Name" className="text-xs font-semibold uppercase tracking-[0.14em]" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
