import { NextResponse } from "next/server";
import { invoiceExportRequestSchema } from "@/features/docs/invoice/schema";
import { createInvoiceExportSession } from "@/features/docs/invoice/server/export-session-store";
import { serializeExportPayload } from "@/lib/server/export-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = invoiceExportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid invoice export payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const document = parsed.data.document;

    // Store document in the session store so the download URL stays short.
    // This avoids URL-length failures when the document contains large data
    // (e.g. a base64-encoded UPI QR code image).
    const token = createInvoiceExportSession(document);

    // Keep the payload path as a fallback for the print surface (it handles
    // both token and payload) but use token-based URLs for pdf/png downloads.
    const printPayload = encodeURIComponent(serializeExportPayload(document));

    return NextResponse.json({
      printUrl: `/invoice/print?payload=${printPayload}&mode=print&autoprint=1`,
      pdfUrl: `/api/export/invoice/download?token=${token}&format=pdf`,
      pngUrl: `/api/export/invoice/download?token=${token}&format=png`,
    });
  } catch (error) {
    console.error("Invoice export session failed", error);

    return NextResponse.json(
      {
        error: "Unable to prepare the invoice export session.",
      },
      { status: 500 },
    );
  }
}
