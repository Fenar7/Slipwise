import { InvoiceDocumentFrame } from "@/features/docs/invoice/components/invoice-document-frame";
import { InvoicePrintEffects } from "@/features/docs/invoice/components/invoice-print-effects";
import type { InvoiceDocument } from "@/features/docs/invoice/types";

type InvoicePrintSurfaceProps = {
  documentData: InvoiceDocument | null;
  mode: "print" | "pdf" | "png";
  autoPrint?: boolean;
};

export function InvoicePrintSurface({
  documentData,
  mode,
  autoPrint = false,
}: InvoicePrintSurfaceProps) {
  if (!documentData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]">
            Invoice render
          </p>
          <h1 className="mt-4 text-3xl text-[var(--foreground)]">
            Render payload unavailable
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted-foreground)]">
            Open this page through the invoice workspace so the normalized
            document payload can be passed into the print surface.
          </p>
        </div>
      </main>
    );
  }

  const bodyClasses =
    mode === "print"
      ? "min-h-screen bg-white px-4 py-6 md:px-8 md:py-10"
      : "bg-white p-0";

  return (
    <main className={bodyClasses}>
      <InvoicePrintEffects
        title={`${documentData.title} ${documentData.invoiceNumber}`}
        autoPrint={mode === "print" && autoPrint}
      />
      <div
        className={
          mode === "print"
            ? "mx-auto w-fit rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-white shadow-[0_24px_48px_rgba(38,30,20,0.08)]"
            : mode === "png"
              ? "w-fit"
              : "mx-auto w-fit"
        }
      >
        <InvoiceDocumentFrame document={documentData} mode={mode} />
      </div>
    </main>
  );
}
