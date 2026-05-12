"use server";

import { db } from "@/lib/db";
import { requireRole, requireOrgContext } from "@/lib/auth";
import { checkFeature } from "@/lib/plans/enforcement";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import { revalidatePath } from "next/cache";
import { generateIrn, cancelIrn } from "@/lib/irp-client";
import { validateGstin } from "@/lib/gst/compute";
import type { IrnGenerateRequest } from "@/lib/irp-client";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

interface IrnData {
  irnNumber: string;
  irnAckNumber: string;
  irnAckDate: string;
  irnQrCode: string | null;
}

// ─── Generate IRN ─────────────────────────────────────────────────────────────

export async function generateInvoiceIrn(
  invoiceId: string
): Promise<ActionResult<IrnData>> {
  try {
    const { orgId } = await requireRole("admin");

    const hasFeature = await checkFeature(orgId, "gstEInvoicing");
    if (!hasFeature) {
      return { success: false, error: "Upgrade to Pro for e-Invoicing" };
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: { lineItems: true, customer: true },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    if (invoice.status !== "ISSUED" && invoice.status !== "DUE") {
      return {
        success: false,
        error: "Invoice must be in ISSUED or DUE status to generate IRN",
      };
    }

    // Return existing IRN if already generated
    if (invoice.irnNumber) {
      return {
        success: true,
        data: {
          irnNumber: invoice.irnNumber,
          irnAckNumber: invoice.irnAckNumber ?? "",
          irnAckDate: invoice.irnAckDate?.toISOString() ?? "",
          irnQrCode: invoice.irnQrCode ?? null,
        },
      };
    }

    // Validate GSTINs
    if (!invoice.supplierGstin) {
      return { success: false, error: "Supplier GSTIN is required for IRN generation" };
    }
    if (!invoice.customerGstin) {
      return { success: false, error: "Customer GSTIN is required for IRN generation" };
    }

    const supplierValidation = validateGstin(invoice.supplierGstin);
    if (!supplierValidation.valid) {
      return { success: false, error: `Invalid supplier GSTIN: ${supplierValidation.error}` };
    }

    const customerValidation = validateGstin(invoice.customerGstin);
    if (!customerValidation.valid) {
      return { success: false, error: `Invalid customer GSTIN: ${customerValidation.error}` };
    }

    // Fetch org defaults for supplier details
    const orgDefaults = await db.orgDefaults.findUnique({
      where: { organizationId: orgId },
    });

    const org = await db.organization.findUnique({
      where: { id: orgId },
    });

    // Build IrnGenerateRequest
    const totalAmount = toAccountingNumber(invoice.totalAmount);
    const totalCgst = toAccountingNumber(invoice.gstTotalCgst);
    const totalSgst = toAccountingNumber(invoice.gstTotalSgst);
    const totalIgst = toAccountingNumber(invoice.gstTotalIgst);
    const totalCess = toAccountingNumber(invoice.gstTotalCess);

    const request: IrnGenerateRequest = {
      invoiceNumber: invoice.invoiceNumber ?? "",
      invoiceDate: formatDateForIrp(formatIsoDate(invoice.invoiceDate)),
      invoiceType: "INV",
      supplierGstin: invoice.supplierGstin,
      supplierLegalName: org?.name ?? "",
      supplierAddress: orgDefaults?.businessAddress ?? "",
      supplierStateCode: supplierValidation.stateCode,
      supplierPincode: extractPincode(orgDefaults?.businessAddress ?? ""),
      buyerGstin: invoice.customerGstin,
      buyerLegalName: invoice.customer?.name ?? "",
      buyerAddress: invoice.customer?.address ?? "",
      buyerStateCode: customerValidation.stateCode,
      buyerPincode: extractPincode(invoice.customer?.address ?? ""),
      totalAmount,
      totalTaxableAmount: totalAmount - totalCgst - totalSgst - totalIgst - totalCess,
      totalCgst,
      totalSgst,
      totalIgst,
      totalCess,
      reverseCharge: invoice.reverseCharge,
      lineItems: invoice.lineItems.map((item, index) => ({
        slNo: index + 1,
        productDescription: item.description,
        hsnCode: item.hsnCode ?? item.sacCode ?? "",
        quantity: item.quantity,
        unit: "NOS",
        unitPrice: item.unitPrice,
        totalAmount: toAccountingNumber(item.amount),
        taxableAmount: toAccountingNumber(item.amount),
        gstRate: item.gstRate,
        cgstAmount: toAccountingNumber(item.cgstAmount),
        sgstAmount: toAccountingNumber(item.sgstAmount),
        igstAmount: toAccountingNumber(item.igstAmount),
        cessAmount: toAccountingNumber(item.cessAmount),
      })),
    };

    const result = await generateIrn(request);

    if (!result.success) {
      return {
        success: false,
        error: result.error?.userMessage ?? result.error?.message ?? "IRN generation failed",
      };
    }

    // Update invoice with IRN data
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        irnNumber: result.irn,
        irnAckNumber: result.ackNo,
        irnAckDate: result.ackDate ? parseIrpDate(result.ackDate) : new Date(),
        irnQrCode: result.signedQrCode ?? null,
      },
    });

    revalidatePath(`/app/docs/invoices/${invoiceId}`);

    return {
      success: true,
      data: {
        irnNumber: result.irn ?? "",
        irnAckNumber: result.ackNo ?? "",
        irnAckDate: result.ackDate ?? new Date().toISOString(),
        irnQrCode: result.signedQrCode ?? null,
      },
    };
  } catch (error) {
    console.error("generateInvoiceIrn error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate IRN",
    };
  }
}

// ─── Cancel IRN ───────────────────────────────────────────────────────────────

export async function cancelInvoiceIrn(
  invoiceId: string,
  reason: string,
  remark: string
): Promise<ActionResult<{ cancelled: boolean }>> {
  try {
    const { orgId } = await requireRole("admin");

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    if (!invoice.irnNumber) {
      return { success: false, error: "Invoice does not have an IRN to cancel" };
    }

    if (!invoice.supplierGstin) {
      return { success: false, error: "Supplier GSTIN is missing" };
    }

    const cancelReason = (["1", "2", "3", "4"].includes(reason) ? reason : "4") as
      | "1"
      | "2"
      | "3"
      | "4";

    const result = await cancelIrn(
      invoice.irnNumber,
      cancelReason,
      remark,
      invoice.supplierGstin
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error?.userMessage ?? result.error?.message ?? "IRN cancellation failed",
      };
    }

    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        irnNumber: null,
        irnAckNumber: null,
        irnAckDate: null,
        irnQrCode: null,
      },
    });

    revalidatePath(`/app/docs/invoices/${invoiceId}`);

    return { success: true, data: { cancelled: true } };
  } catch (error) {
    console.error("cancelInvoiceIrn error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel IRN",
    };
  }
}

// ─── Get IRN Status ───────────────────────────────────────────────────────────

export async function getInvoiceIrnStatus(
  invoiceId: string
): Promise<
  ActionResult<{
    irnNumber: string | null;
    irnAckNumber: string | null;
    irnAckDate: string | null;
    irnQrCode: string | null;
  }>
> {
  try {
    const { orgId } = await requireOrgContext();

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      select: {
        irnNumber: true,
        irnAckNumber: true,
        irnAckDate: true,
        irnQrCode: true,
      },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    return {
      success: true,
      data: {
        irnNumber: invoice.irnNumber,
        irnAckNumber: invoice.irnAckNumber,
        irnAckDate: invoice.irnAckDate?.toISOString() ?? null,
        irnQrCode: invoice.irnQrCode,
      },
    };
  } catch (error) {
    console.error("getInvoiceIrnStatus error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get IRN status",
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert YYYY-MM-DD or similar to DD/MM/YYYY for IRP */
function formatDateForIrp(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/** Parse IRP date format DD/MM/YYYY HH:mm:ss to Date */
function parseIrpDate(dateStr: string): Date {
  const [datePart] = dateStr.split(" ");
  const [day, month, year] = datePart.split("/");
  return new Date(`${year}-${month}-${day}`);
}

/** Extract 6-digit pincode from address string */
function extractPincode(address: string): string {
  const match = address.match(/\b[1-9]\d{5}\b/);
  return match?.[0] ?? "000000";
}
