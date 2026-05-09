import type { CSSProperties } from "react";
import {
  A4_DOCUMENT_HEIGHT,
  A4_DOCUMENT_WIDTH,
} from "@/components/document/document-constants";
import { voucherTemplateRegistry } from "@/features/docs/voucher/templates";
import type { VoucherDocument } from "@/features/docs/voucher/types";

type VoucherDocumentFrameProps = {
  document: VoucherDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
};

export const VOUCHER_DOCUMENT_WIDTH = A4_DOCUMENT_WIDTH;
export const VOUCHER_DOCUMENT_HEIGHT = A4_DOCUMENT_HEIGHT;

export function VoucherDocumentFrame({
  document,
  mode = "preview",
}: VoucherDocumentFrameProps) {
  const template = voucherTemplateRegistry[document.templateId];
  const TemplateComponent = template.component;

  return (
    <article
      data-testid={mode === "print" || mode === "pdf" || mode === "png" ? "voucher-render-ready" : undefined}
      className="w-full bg-white p-8 text-[var(--voucher-ink)]"
      style={
        {
          width: `${VOUCHER_DOCUMENT_WIDTH}px`,
          minHeight: `${VOUCHER_DOCUMENT_HEIGHT}px`,
          "--voucher-ink": "#1d1710",
          "--voucher-accent": document.branding.accentColor || "#dc2626",
        } as CSSProperties
      }
    >
      <TemplateComponent document={document} mode={mode} />
    </article>
  );
}
