import type { CSSProperties } from "react";
import {
  A4_DOCUMENT_HEIGHT,
  A4_DOCUMENT_WIDTH,
} from "@/components/document/document-constants";
import { invoiceTemplateRegistry } from "@/features/docs/invoice/templates";
import type { InvoiceDocument } from "@/features/docs/invoice/types";

type InvoiceDocumentFrameProps = {
  document: InvoiceDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
};

export function InvoiceDocumentFrame({
  document,
  mode = "preview",
}: InvoiceDocumentFrameProps) {
  const template = invoiceTemplateRegistry[document.templateId];
  const TemplateComponent = template.component;
  // In export modes (pdf/png) omit minHeight so the article only occupies
  // actual content height — prevents Chromium producing a blank second page.
  const isExport = mode === "pdf" || mode === "png";

  return (
    <article
      data-testid={mode !== "preview" && mode !== "edit" ? "invoice-render-ready" : undefined}
      className="w-full bg-white p-8 text-[var(--voucher-ink)]"
      style={
        {
          width: `${A4_DOCUMENT_WIDTH}px`,
          ...(isExport ? {} : { minHeight: `${A4_DOCUMENT_HEIGHT}px` }),
          "--voucher-ink": "#1d1710",
          "--voucher-accent": document.branding.accentColor || "#dc2626",
        } as CSSProperties
      }
    >
      <TemplateComponent document={document} mode={mode} />
    </article>
  );
}
