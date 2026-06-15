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
import type { VoucherDocument, VoucherFormValues } from "@/features/docs/voucher/types";
import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";
import { cn } from "@/lib/utils";
type VoucherTemplateProps = {
  document: VoucherDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
};

export function CompactReceiptVoucherTemplate({
  document,
  mode = "preview",
}: VoucherTemplateProps) {
  if (mode === "edit") {
    return <CompactReceiptEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      <div className="mx-auto max-w-md">
        {/* Dashed top border */}
        <div className="border-t-2 border-dashed border-[rgba(29,23,16,0.3)]" />

        <div className="space-y-5 py-6">
          {/* Centered logo + company name */}
          <div className="document-break-inside-avoid text-center">
            <div className="flex justify-center">
              <DocumentBrandMark
                branding={document.branding}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(29,23,16,0.1)] bg-[rgba(255,255,255,0.92)] p-2"
                initialsClassName="text-lg font-bold text-[var(--voucher-accent)]"
                imageClassName="h-full w-full rounded-full object-cover"
              />
            </div>
            <h2 className="mt-3 text-lg font-semibold">
              {document.branding.companyName || "Slipwise"}
            </h2>
            {document.visibility.showAddress && document.branding.address ? (
              <p className="mt-1 text-xs text-[rgba(29,23,16,0.5)] whitespace-pre-line">
                {document.branding.address}
              </p>
            ) : null}
            <div className="mt-1 flex justify-center gap-3 text-xs text-[rgba(29,23,16,0.5)]">
              {document.visibility.showEmail && document.branding.email ? (
                <span>{document.branding.email}</span>
              ) : null}
              {document.visibility.showPhone && document.branding.phone ? (
                <span>{document.branding.phone}</span>
              ) : null}
            </div>
          </div>

          {/* Voucher type label */}
          <p className="text-center text-[0.7rem] font-bold uppercase tracking-[0.35em] text-[rgba(29,23,16,0.45)]">
            {document.voucherType === "payment"
              ? "Payment Voucher"
              : "Receipt Voucher"}
          </p>

          {/* Thin rule */}
          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Stacked detail items */}
          <div className="document-break-inside-avoid space-y-4 text-center">
            <ReceiptField label="Voucher No." value={document.voucherNumber} />
            <ReceiptField label="Date" value={document.date} />
            <ReceiptField
              label={document.counterpartyLabel}
              value={document.counterpartyName}
            />
            {document.visibility.showPaymentMode && document.paymentMode ? (
              <ReceiptField label="Payment Mode" value={document.paymentMode} />
            ) : null}
            {document.visibility.showReferenceNumber &&
            document.referenceNumber ? (
              <ReceiptField label="Reference" value={document.referenceNumber} />
            ) : null}
          </div>

          {/* Thin rule */}
          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Amount with circular accent badge */}
          <div className="document-break-inside-avoid flex flex-col items-center py-2">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full"
              style={{
                backgroundColor: "var(--voucher-accent)",
              }}
            >
              <span className="text-center text-xl font-bold leading-tight text-white">
                {document.amountFormatted}
              </span>
            </div>
            <p className="mt-3 text-center text-xs italic text-[rgba(29,23,16,0.55)]">
              {document.amountInWords}
            </p>
          </div>

          {/* Thin rule */}
          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Purpose */}
          <div className="document-break-inside-avoid text-center">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">
              Purpose
            </p>
            <p className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.78)]">
              {document.purpose}
            </p>
          </div>

          {/* UPI Details */}
          {document.visibility.showUpiDetails && (document.upiId || document.upiQrDataUrl) ? (
            <div className="document-break-inside-avoid text-center">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">
                UPI Details
              </p>
              <div className="mt-2 flex flex-col items-center gap-2">
                {document.upiId ? (
                  <p className="text-sm font-medium text-[rgba(29,23,16,0.78)]">ID: {document.upiId}</p>
                ) : null}
                {document.upiQrDataUrl ? (
                  <img
                    src={document.upiQrDataUrl}
                    alt="UPI QR Code"
                    className="h-16 w-16 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white mx-auto"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {document.visibility.showNotes && document.notes ? (
            <div className="document-break-inside-avoid text-center">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">
                Notes
              </p>
              <p className="mt-2 text-sm leading-6 text-[rgba(29,23,16,0.65)]">
                {document.notes}
              </p>
            </div>
          ) : null}

          {/* Dotted separator + signatures */}
          {document.visibility.showSignatureArea ? (
            <div className="document-break-inside-avoid space-y-5">
              <div className="border-t border-dotted border-[rgba(29,23,16,0.3)]" />
              <div
                className={cn(
                  printLikeMode
                    ? "grid grid-cols-2 gap-4"
                    : "grid gap-4 sm:grid-cols-2",
                  (!printLikeMode || (document.approvedBy && document.receivedBy))
                    ? ""
                    : "grid-cols-1",
                )}
              >
                {document.visibility.showApprovedBy && (!printLikeMode || document.approvedBy) ? (
                  <div className="text-center">
                    <div className="mx-auto mt-6 w-3/4 border-b border-dotted border-[rgba(29,23,16,0.35)]" />
                    <p className="mt-2 text-xs font-medium text-[rgba(29,23,16,0.6)]">
                      {document.approvedBy
                        ? `Authorized by: ${document.approvedBy}`
                        : "Authorized by"}
                    </p>
                  </div>
                ) : null}
                {document.visibility.showReceivedBy && (!printLikeMode || document.receivedBy) ? (
                  <div className="text-center">
                    <div className="mx-auto mt-6 w-3/4 border-b border-dotted border-[rgba(29,23,16,0.35)]" />
                    <p className="mt-2 text-xs font-medium text-[rgba(29,23,16,0.6)]">
                      {document.receivedBy
                        ? `Received by: ${document.receivedBy}`
                        : "Received by"}
                    </p>
                  </div>
                ) : null}
              </div>
              <p className="text-center text-[0.6rem] text-[rgba(29,23,16,0.35)]">
                This is a computer-generated document
              </p>
            </div>
          ) : null}
        </div>

        {/* Dashed bottom border */}
        <div className="border-b-2 border-dashed border-[rgba(29,23,16,0.3)]" />
      </div>
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.55rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.38)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-[rgba(29,23,16,0.85)]">
        {value}
      </p>
    </div>
  );
}

function ReceiptEditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[0.55rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.38)]">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium text-[rgba(29,23,16,0.85)]">{children}</div>
    </div>
  );
}

function CompactReceiptEditor() {
  const { control } = useFormContext<VoucherFormValues>();
  const watchedValues = useWatch({ control }) as VoucherFormValues;
  const doc = normalizeVoucher(watchedValues);

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      <div className="mx-auto max-w-md">
        <div className="border-t-2 border-dashed border-[rgba(29,23,16,0.3)]" />

        <div className="space-y-5 py-6">
          {/* Company header */}
          <div className="document-break-inside-avoid text-center">
            <div className="flex justify-center">
              <DocumentBrandMark
                branding={doc.branding}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(29,23,16,0.1)] bg-[rgba(255,255,255,0.92)] p-2"
                initialsClassName="text-lg font-bold text-[var(--voucher-accent)]"
                imageClassName="h-full w-full rounded-full object-cover"
              />
            </div>
            <InlineTextField name="branding.companyName" placeholder="Company Name" className="mt-3 text-center text-lg font-semibold" />
            {doc.visibility.showAddress ? (
              <InlineTextArea name="branding.address" placeholder="Company address" className="mt-1 text-center text-xs text-[rgba(29,23,16,0.5)]" />
            ) : null}
            <div className="mt-1 flex justify-center gap-3 text-xs text-[rgba(29,23,16,0.5)]">
              {doc.visibility.showEmail ? (
                <InlineTextField name="branding.email" placeholder="Email" className="text-center text-xs" />
              ) : null}
              {doc.visibility.showPhone ? (
                <InlineTextField name="branding.phone" placeholder="Phone" className="text-center text-xs" />
              ) : null}
            </div>
          </div>

          {/* Voucher type label */}
          <p className="text-center text-[0.7rem] font-bold uppercase tracking-[0.35em] text-[rgba(29,23,16,0.45)]">
            {doc.title}
          </p>

          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Stacked detail fields */}
          <div className="document-break-inside-avoid space-y-4 text-center">
            <ReceiptEditField label="Voucher No.">
              <InlineTextField name="voucherNumber" placeholder="VCH-001" className="text-center text-sm font-medium" />
            </ReceiptEditField>
            <ReceiptEditField label="Date">
              <InlineDateField name="date" className="text-center text-sm font-medium" />
            </ReceiptEditField>
            <ReceiptEditField label={doc.counterpartyLabel}>
              <InlineTextField name="counterpartyName" placeholder="Name" className="text-center text-sm font-medium" />
            </ReceiptEditField>
            <ReceiptEditField label="Amount">
              <InlineNumberField name="amount" placeholder="0.00" className="text-center text-sm font-medium" />
            </ReceiptEditField>
            {doc.visibility.showPaymentMode ? (
              <ReceiptEditField label="Payment Mode">
                <InlineTextField name="paymentMode" placeholder="Cash / Cheque" className="text-center text-sm font-medium" />
              </ReceiptEditField>
            ) : null}
            {doc.visibility.showReferenceNumber ? (
              <ReceiptEditField label="Reference">
                <InlineTextField name="referenceNumber" placeholder="Reference number" className="text-center text-sm font-medium" />
              </ReceiptEditField>
            ) : null}
          </div>

          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Amount circle — display only */}
          <div className="document-break-inside-avoid flex flex-col items-center py-2">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--voucher-accent)" }}
            >
              <span className="text-center text-xl font-bold leading-tight text-white">
                {doc.amountFormatted}
              </span>
            </div>
            <p className="mt-3 text-center text-xs italic text-[rgba(29,23,16,0.55)]">
              {doc.amountInWords}
            </p>
          </div>

          <div className="border-t border-[rgba(29,23,16,0.12)]" />

          {/* Purpose */}
          <div className="document-break-inside-avoid text-center">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">
              Purpose
            </p>
            <InlineTextArea name="purpose" placeholder="Purpose of payment…" className="mt-2 text-center text-sm leading-6 text-[rgba(29,23,16,0.78)]" />
          </div>

          {/* UPI Details */}
          {doc.visibility.showUpiDetails ? (
            <div className="document-break-inside-avoid text-center">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">UPI Details</p>
              <div className="mt-2 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[rgba(29,23,16,0.45)]">UPI ID:</span>
                  <InlineTextField name="upiId" placeholder="merchant@ybl" className="text-sm font-medium" />
                </div>
                {doc.upiQrDataUrl ? (
                  <img
                    src={doc.upiQrDataUrl}
                    alt="UPI QR Code"
                    className="h-16 w-16 rounded border border-[rgba(29,23,16,0.1)] object-contain p-0.5 bg-white mx-auto"
                  />
                ) : (
                  <div className="text-[10px] text-[rgba(29,23,16,0.45)] border border-dashed border-[rgba(29,23,16,0.12)] rounded-lg p-2 bg-white">
                    Upload UPI QR in Sidebar
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {doc.visibility.showNotes ? (
            <div className="document-break-inside-avoid text-center">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.4)]">
                Notes
              </p>
              <InlineTextArea name="notes" placeholder="Additional notes…" className="mt-2 text-center text-sm leading-6 text-[rgba(29,23,16,0.65)]" />
            </div>
          ) : null}

          {/* Signatures */}
          {doc.visibility.showSignatureArea ? (
            <div className="document-break-inside-avoid space-y-5">
              <div className="border-t border-dotted border-[rgba(29,23,16,0.3)]" />
              <div className="grid gap-4 sm:grid-cols-2">
                {doc.visibility.showApprovedBy ? (
                  <div className="text-center">
                    <div className="mx-auto mt-6 w-3/4 border-b border-dotted border-[rgba(29,23,16,0.35)]" />
                    <div className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-[rgba(29,23,16,0.6)]">
                      <span className="shrink-0">Authorized by:</span>
                      <InlineTextField name="approvedBy" placeholder="Name" className="text-center text-xs font-medium" />
                    </div>
                  </div>
                ) : null}
                {doc.visibility.showReceivedBy ? (
                  <div className="text-center">
                    <div className="mx-auto mt-6 w-3/4 border-b border-dotted border-[rgba(29,23,16,0.35)]" />
                    <div className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-[rgba(29,23,16,0.6)]">
                      <span className="shrink-0">Received by:</span>
                      <InlineTextField name="receivedBy" placeholder="Name" className="text-center text-xs font-medium" />
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="text-center text-[0.6rem] text-[rgba(29,23,16,0.35)]">
                This is a computer-generated document
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-b-2 border-dashed border-[rgba(29,23,16,0.3)]" />
      </div>
    </div>
  );
}

