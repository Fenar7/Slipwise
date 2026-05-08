"use client";

import { useFormContext } from "react-hook-form";
import type { InvoiceFormValues } from "../types";

interface InvoiceSaveBarProps {
  onSaveDraft: () => void;
  onIssue: () => void;
  isSaving: boolean;
  savedId?: string;
  invoiceNumber?: string;
}

export function InvoiceSaveBar({
  onSaveDraft,
  onIssue,
  isSaving,
  savedId,
  invoiceNumber,
}: InvoiceSaveBarProps) {
  const { formState: { isDirty } } = useFormContext<InvoiceFormValues>();

  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-[var(--border-soft)] bg-white/95 backdrop-blur-sm px-6 py-3">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between">
        <div className="flex items-center gap-3">
          {isDirty && !isSaving && (
            <span className="text-sm text-amber-600">
              Unsaved changes
            </span>
          )}
          {!isDirty && savedId && (
            <span className="text-sm text-green-600">
              Saved {invoiceNumber && `· ${invoiceNumber}`}
            </span>
          )}
          {isSaving && (
            <span className="text-sm text-slate-400">Saving...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedId && (
            <a
              href={`/app/docs/invoices/${savedId}`}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            >
              View in Vault
            </a>
          )}
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSaving}
            className="rounded-md bg-[var(--surface-subtle)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface)] disabled:opacity-50 transition-colors"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onIssue}
            disabled={isSaving}
            className="rounded-md bg-[var(--brand-cta)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 transition-colors"
          >
            Issue Invoice
          </button>
        </div>
      </div>
    </div>
  );
}