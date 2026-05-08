"use client";

import type { ReactNode } from "react";
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

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b border-[rgba(29,23,16,0.08)] py-3 text-sm">
      <p className="font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.55)]">
        {label}
      </p>
      <p className="text-[rgba(29,23,16,0.82)]">{value}</p>
    </div>
  );
}

export function TraditionalLedgerVoucherTemplate({
  document,
  mode = "preview",
}: VoucherTemplateProps) {
  if (mode === "edit") {
    return <TraditionalLedgerEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.5rem] border-2 border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.92)]">
        <div
          className="rounded-t-[1.35rem] px-6 py-5 text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <DocumentBrandMark
                branding={document.branding}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.2rem] border border-white/20 bg-white/10 p-2"
                initialsClassName="text-base font-semibold text-white"
                imageClassName="h-full w-full rounded-[0.9rem] object-cover"
              />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-white">
                  Formal voucher record
                </p>
                <h2 className="mt-3 text-[1.8rem] font-medium text-white">{document.title}</h2>
              </div>
            </div>
            <p className="text-right text-sm leading-7 text-white">
              {document.branding.companyName || "Slipwise"}
            </p>
          </div>
        </div>

        <div className="space-y-1 px-6 py-5">
          <Row label="Voucher number" value={document.voucherNumber} />
          <Row label="Date" value={document.date} />
          <Row label={document.counterpartyLabel} value={document.counterpartyName} />
          <Row label="Amount" value={`${document.amountFormatted} (${document.amountInWords})`} />
          {document.paymentMode ? (
            <Row label="Payment mode" value={document.paymentMode} />
          ) : null}
          {document.referenceNumber ? (
            <Row label="Reference" value={document.referenceNumber} />
          ) : null}
          <Row label="Purpose" value={document.purpose} />
          {document.notes ? <Row label="Notes" value={document.notes} /> : null}
        </div>
      </section>

      <section
        className={cn(
          "document-break-inside-avoid grid gap-4",
          printLikeMode ? "grid-cols-[1fr_0.8fr]" : "md:grid-cols-[1fr_0.8fr]",
        )}
      >
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Business details
          </p>
          <div className="mt-4 space-y-2 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
            {document.visibility.showAddress && document.branding.address ? (
              <p>{document.branding.address}</p>
            ) : null}
            {document.visibility.showEmail && document.branding.email ? (
              <p>{document.branding.email}</p>
            ) : null}
            {document.visibility.showPhone && document.branding.phone ? (
              <p>{document.branding.phone}</p>
            ) : null}
          </div>
        </div>

        {document.visibility.showSignatureArea ? (
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Authorization
            </p>
            <div className="mt-4 space-y-5">
              {document.approvedBy ? (
                <div>
                  <div className="h-12 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
                  <p className="mt-3 text-sm font-medium">Approved by: {document.approvedBy}</p>
                </div>
              ) : null}
              {document.receivedBy ? (
                <div>
                  <div className="h-12 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
                  <p className="mt-3 text-sm font-medium">Received by: {document.receivedBy}</p>
                </div>
              ) : null}
              {!document.approvedBy && !document.receivedBy ? (
                <p className="text-sm text-[rgba(29,23,16,0.65)]">
                  Signature lines will appear here once names are provided.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function LedgerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b border-[rgba(29,23,16,0.08)] py-3 text-sm">
      <p className="font-semibold uppercase tracking-[0.14em] text-[rgba(29,23,16,0.55)]">{label}</p>
      <div className="text-[rgba(29,23,16,0.82)]">{children}</div>
    </div>
  );
}

function TraditionalLedgerEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.5rem] border-2 border-[rgba(29,23,16,0.12)] bg-[rgba(255,255,255,0.92)]">
        {/* Accent header */}
        <div
          className="rounded-t-[1.35rem] px-6 py-5 text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <DocumentBrandMark
                branding={doc.branding}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.2rem] border border-white/20 bg-white/10 p-2"
                initialsClassName="text-base font-semibold text-white"
                imageClassName="h-full w-full rounded-[0.9rem] object-cover"
              />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-white">
                  Formal voucher record
                </p>
                <h2 className="mt-3 text-[1.8rem] font-medium text-white">{doc.title}</h2>
              </div>
            </div>
            <InlineTextField
              name="branding.companyName"
              placeholder="Company Name"
              className="text-right text-sm leading-7 text-white"
            />
          </div>
        </div>

        {/* Ledger rows */}
        <div className="space-y-1 px-6 py-5">
          <LedgerRow label="Voucher number">
            <InlineTextField name="voucherNumber" placeholder="VCH-001" className="text-sm" />
          </LedgerRow>
          <LedgerRow label="Date">
            <InlineDateField name="date" className="text-sm" />
          </LedgerRow>
          <LedgerRow label={doc.counterpartyLabel}>
            <InlineTextField name="counterpartyName" placeholder="Name" className="text-sm" />
          </LedgerRow>
          <LedgerRow label="Amount">
            <div className="flex items-center gap-2">
              <InlineNumberField name="amount" placeholder="0.00" className="text-sm" />
              <span className="shrink-0 text-xs text-[rgba(29,23,16,0.55)]">{doc.amountInWords}</span>
            </div>
          </LedgerRow>
          {doc.visibility.showPaymentMode ? (
            <LedgerRow label="Payment mode">
              <InlineTextField name="paymentMode" placeholder="Cash / Cheque" className="text-sm" />
            </LedgerRow>
          ) : null}
          {doc.visibility.showReferenceNumber ? (
            <LedgerRow label="Reference">
              <InlineTextField name="referenceNumber" placeholder="Reference number" className="text-sm" />
            </LedgerRow>
          ) : null}
          <LedgerRow label="Purpose">
            <InlineTextArea name="purpose" placeholder="Purpose of payment…" className="text-sm" />
          </LedgerRow>
          {doc.visibility.showNotes ? (
            <LedgerRow label="Notes">
              <InlineTextArea name="notes" placeholder="Additional notes…" className="text-sm" />
            </LedgerRow>
          ) : null}
        </div>
      </section>

      <section
        className={cn(
          "document-break-inside-avoid grid gap-4 md:grid-cols-[1fr_0.8fr]",
        )}
      >
        {/* Business details */}
        <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Business details
          </p>
          <div className="mt-4 space-y-2 text-sm leading-7 text-[rgba(29,23,16,0.82)]">
            {doc.visibility.showAddress ? (
              <InlineTextArea name="branding.address" placeholder="Company address" className="text-sm" />
            ) : null}
            {doc.visibility.showEmail ? (
              <InlineTextField name="branding.email" placeholder="Email" className="text-sm" />
            ) : null}
            {doc.visibility.showPhone ? (
              <InlineTextField name="branding.phone" placeholder="Phone" className="text-sm" />
            ) : null}
          </div>
        </div>

        {/* Authorization */}
        {doc.visibility.showSignatureArea ? (
          <div className="rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Authorization
            </p>
            <div className="mt-4 space-y-5">
              {doc.visibility.showApprovedBy ? (
                <div>
                  <div className="h-12 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
                  <div className="mt-3 flex items-center gap-1 text-sm font-medium">
                    <span className="shrink-0">Approved by:</span>
                    <InlineTextField name="approvedBy" placeholder="Name" className="text-sm font-medium" />
                  </div>
                </div>
              ) : null}
              {doc.visibility.showReceivedBy ? (
                <div>
                  <div className="h-12 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
                  <div className="mt-3 flex items-center gap-1 text-sm font-medium">
                    <span className="shrink-0">Received by:</span>
                    <InlineTextField name="receivedBy" placeholder="Name" className="text-sm font-medium" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
