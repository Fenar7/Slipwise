import type {
  InvoiceDocument,
  InvoiceExportFormat,
} from "@/features/docs/invoice/types";
import {
  renderExportPdfViaBrowser,
  renderExportPngViaBrowser,
} from "@/lib/export/browser";
import { createInvoiceExportSession } from "@/features/docs/invoice/server/export-session-store";

type ExportInvoiceOptions = {
  invoiceDocument: InvoiceDocument;
  format: InvoiceExportFormat;
  origin: string;
};

export async function exportInvoiceDocument({
  invoiceDocument,
  format,
  origin,
}: ExportInvoiceOptions) {
  const routeMode = format === "pdf" ? "pdf" : "png";

  // Store the document in the session store and pass only a short token in the
  // render URL. This sidesteps both URL-length limits (base64 QR images make
  // the URL huge) and HTTP header-size limits (~8 KB in Node.js/Next.js).
  // The /invoice/print page already supports ?token= lookup.
  const token = createInvoiceExportSession(invoiceDocument);
  const renderUrl = `${origin}/invoice/print?token=${token}&mode=${routeMode}`;

  if (format === "pdf") {
    return renderExportPdfViaBrowser(
      renderUrl,
      '[data-testid="invoice-render-ready"]',
    );
  }

  return renderExportPngViaBrowser(
    renderUrl,
    '[data-testid="invoice-render-ready"]',
  );
}

