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

export function ModernCardVoucherTemplate({
  document,
  mode = "preview",
}: VoucherTemplateProps) {
  if (mode === "edit") {
    return <ModernCardEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      {/* Header: logo + company name + voucher type pill */}
      <header className="document-break-inside-avoid flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <DocumentBrandMark
            branding={document.branding}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-2"
            initialsClassName="text-base font-bold text-[var(--voucher-accent)]"
            imageClassName="h-full w-full rounded-xl object-cover"
          />
          <div>
            <h2 className="text-xl font-semibold leading-tight">
              {document.branding.companyName || "Slipwise"}
            </h2>
            <div className="mt-1 space-y-0.5 text-xs leading-5 text-[rgba(29,23,16,0.55)]">
              {document.visibility.showAddress && document.branding.address ? (
                <p>{document.branding.address}</p>
              ) : null}
              <span className="flex flex-wrap gap-x-3">
                {document.visibility.showEmail && document.branding.email ? (
                  <span>{document.branding.email}</span>
                ) : null}
                {document.visibility.showPhone && document.branding.phone ? (
                  <span>{document.branding.phone}</span>
                ) : null}
              </span>
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          {document.voucherType === "payment" ? "Payment" : "Receipt"}
        </span>
      </header>

      {/* Amount hero card */}
      <section
        className="document-break-inside-avoid rounded-3xl p-8 text-center"
        style={{
          background:
            "linear-gradient(135deg, var(--voucher-accent), color-mix(in srgb, var(--voucher-accent) 78%, #000))",
        }}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white">
          Amount
        </p>
        <p className="mt-3 text-4xl font-bold text-white">
          {document.amountFormatted}
        </p>
        <p className="mt-3 text-sm italic leading-6 text-white">
          {document.amountInWords}
        </p>
      </section>

      {/* Details grid — floating cards */}
      <div
        className={cn(
          "document-break-inside-avoid grid gap-3",
          printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
        )}
      >
        <DetailCard label="Voucher No." value={document.voucherNumber} />
        <DetailCard label="Date" value={document.date} />
        <DetailCard
          label={document.counterpartyLabel}
          value={document.counterpartyName}
        />
        {document.visibility.showPaymentMode && document.paymentMode ? (
          <DetailCard label="Payment Mode" value={document.paymentMode} />
        ) : null}
        {document.visibility.showReferenceNumber && document.referenceNumber ? (
          <DetailCard label="Reference" value={document.referenceNumber} />
        ) : null}
      </div>

      {/* Purpose callout */}
      <section
        className="document-break-inside-avoid rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5"
        style={{ borderLeft: "4px solid var(--voucher-accent)" }}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Purpose / Narration
        </p>
        <p className="mt-2 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
          {document.purpose}
        </p>
      </section>

      {/* Notes */}
      {document.visibility.showNotes && document.notes ? (
        <section className="document-break-inside-avoid rounded-2xl border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.7)] p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Notes
          </p>
          <p className="mt-2 text-sm leading-7 text-[rgba(29,23,16,0.75)]">
            {document.notes}
          </p>
        </section>
      ) : null}

      {/* Signature cards */}
      {document.visibility.showSignatureArea ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-3",
            printLikeMode ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          {document.visibility.showApprovedBy ? (
            <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5">
              <div
                className="mb-4 h-0.5 w-full rounded-full"
                style={{ backgroundColor: "var(--voucher-accent)" }}
              />
              <div className="h-14 border-b border-dashed border-[rgba(29,23,16,0.14)]" />
              <p className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.8)]">
                {document.approvedBy
                  ? `Approved by: ${document.approvedBy}`
                  : "Approved by"}
              </p>
            </div>
          ) : null}
          {document.visibility.showReceivedBy ? (
            <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5">
              <div
                className="mb-4 h-0.5 w-full rounded-full"
                style={{ backgroundColor: "var(--voucher-accent)" }}
              />
              <div className="h-14 border-b border-dashed border-[rgba(29,23,16,0.14)]" />
              <p className="mt-3 text-sm font-medium text-[rgba(29,23,16,0.8)]">
                {document.receivedBy
                  ? `Received by: ${document.receivedBy}`
                  : "Received by"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]">
        {value}
      </p>
    </div>
  );
}

function ModernCardEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      {/* Header */}
      <header className="document-break-inside-avoid flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <DocumentBrandMark
            branding={doc.branding}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-2"
            initialsClassName="text-base font-bold text-[var(--voucher-accent)]"
            imageClassName="h-full w-full rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <InlineTextField name="branding.companyName" placeholder="Company Name" className="text-xl font-semibold leading-tight" />
            <div className="mt-1 space-y-0.5 text-xs leading-5 text-[rgba(29,23,16,0.55)]">
              {doc.visibility.showAddress ? (
                <InlineTextArea name="branding.address" placeholder="Company address" className="text-xs" />
              ) : null}
              <span className="flex flex-wrap gap-x-3">
                {doc.visibility.showEmail ? (
                  <InlineTextField name="branding.email" placeholder="Email" className="text-xs" />
                ) : null}
                {doc.visibility.showPhone ? (
                  <InlineTextField name="branding.phone" placeholder="Phone" className="text-xs" />
                ) : null}
              </span>
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          {doc.voucherType === "payment" ? "Payment" : "Receipt"}
        </span>
      </header>

      {/* Amount hero — display only */}
      <section
        className="document-break-inside-avoid rounded-3xl p-8 text-center"
        style={{
          background:
            "linear-gradient(135deg, var(--voucher-accent), color-mix(in srgb, var(--voucher-accent) 78%, #000))",
        }}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white">Amount</p>
        <p className="mt-3 text-4xl font-bold text-white">{doc.amountFormatted}</p>
        <p className="mt-3 text-sm italic leading-6 text-white">{doc.amountInWords}</p>
      </section>

      {/* Details grid */}
      <div className="document-break-inside-avoid grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">Voucher No.</p>
          <InlineTextField name="voucherNumber" placeholder="VCH-001" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
        </div>
        <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">Date</p>
          <InlineDateField name="date" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
        </div>
        <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">{doc.counterpartyLabel}</p>
          <InlineTextField name="counterpartyName" placeholder="Name" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
        </div>
        <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">Amount</p>
          <InlineNumberField name="amount" placeholder="0.00" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
        </div>
        {doc.visibility.showPaymentMode ? (
          <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">Payment Mode</p>
            <InlineTextField name="paymentMode" placeholder="Cash / Cheque" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
          </div>
        ) : null}
        {doc.visibility.showReferenceNumber ? (
          <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-4">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.42)]">Reference</p>
            <InlineTextField name="referenceNumber" placeholder="Reference number" className="mt-1.5 text-sm font-medium text-[rgba(29,23,16,0.88)]" />
          </div>
        ) : null}
      </div>

      {/* Purpose */}
      <section
        className="document-break-inside-avoid rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5"
        style={{ borderLeft: "4px solid var(--voucher-accent)" }}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Purpose / Narration
        </p>
        <InlineTextArea name="purpose" placeholder="Purpose of payment…" className="mt-2 text-sm leading-7 text-[rgba(29,23,16,0.82)]" />
      </section>

      {/* Notes */}
      {doc.visibility.showNotes ? (
        <section className="document-break-inside-avoid rounded-2xl border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.7)] p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
          <InlineTextArea name="notes" placeholder="Additional notes…" className="mt-2 text-sm leading-7 text-[rgba(29,23,16,0.75)]" />
        </section>
      ) : null}

      {/* Signatures */}
      {doc.visibility.showSignatureArea ? (
        <section className="document-break-inside-avoid grid gap-3 md:grid-cols-2">
          {doc.visibility.showApprovedBy ? (
            <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5">
              <div className="mb-4 h-0.5 w-full rounded-full" style={{ backgroundColor: "var(--voucher-accent)" }} />
              <div className="h-14 border-b border-dashed border-[rgba(29,23,16,0.14)]" />
              <div className="mt-3 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.8)]">
                <span className="shrink-0">Approved by:</span>
                <InlineTextField name="approvedBy" placeholder="Name" className="text-sm font-medium" />
              </div>
            </div>
          ) : null}
          {doc.visibility.showReceivedBy ? (
            <div className="rounded-2xl border border-[rgba(29,23,16,0.06)] bg-[rgba(255,255,255,0.92)] p-5">
              <div className="mb-4 h-0.5 w-full rounded-full" style={{ backgroundColor: "var(--voucher-accent)" }} />
              <div className="h-14 border-b border-dashed border-[rgba(29,23,16,0.14)]" />
              <div className="mt-3 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.8)]">
                <span className="shrink-0">Received by:</span>
                <InlineTextField name="receivedBy" placeholder="Name" className="text-sm font-medium" />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
