"use server";

import { db } from "@/lib/db";
import { requireOrgContext, requireRole } from "@/lib/auth";
import { EInvoiceStatus, EInvoiceRequestType } from "@/generated/prisma/client";
import {
  generateEInvoice,
  validateForEInvoice,
} from "@/lib/compliance/einvoice";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// ─── Generate IRN ─────────────────────────────────────────────────────────────

export async function generateEInvoiceAction(
  invoiceId: string
): Promise<ActionResult<{ irnNumber: string; qrCodeDataUrl: string }>> {
  const { orgId, userId } = await requireRole("admin");

  const [invoice, org, orgDefaults, config] = await Promise.all([
    db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: { lineItems: true },
    }),
    db.organization.findUnique({ where: { id: orgId } }),
    db.orgDefaults.findUnique({ where: { organizationId: orgId } }),
    db.eInvoiceConfig.findUnique({ where: { orgId } }),
  ]);

  if (!invoice || invoice.organizationId !== orgId) {
    return { success: false, error: "Invoice not found." };
  }
  if (!org) return { success: false, error: "Organization not found." };
  if (!config?.enabled) {
    return {
      success: false,
      error: "E-Invoicing is not enabled. Configure it at Settings → Compliance → E-Invoice.",
    };
  }

  const validationErrors = validateForEInvoice(invoice);
  if (validationErrors.length > 0) {
    return { success: false, error: validationErrors.join("; ") };
  }

  // Create pending request record
  const requestRecord = await db.eInvoiceRequest.create({
    data: {
      orgId,
      invoiceId,
      requestType: EInvoiceRequestType.GENERATE_IRN,
      status: EInvoiceStatus.SUBMITTED,
      triggeredByUserId: userId,
    },
  });

  const lineItems = invoice.lineItems.map((li) => ({
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    amount: li.amount,
    taxRate: li.taxRate,
  }));

  const result = await generateEInvoice(
    { ...invoice, lineItems },
    { name: org.name, gstin: orgDefaults?.gstin ?? null, address: orgDefaults?.businessAddress ?? null },
    config
  );

  if (!result.success) {
    await db.eInvoiceRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: EInvoiceStatus.FAILED,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        requestPayload: result.requestPayload as object ?? undefined,
      },
    });
    return { success: false, error: result.errorMessage ?? "IRN generation failed." };
  }

  // Persist success atomically
  await db.$transaction([
    db.eInvoiceRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: EInvoiceStatus.SUCCESS,
        irnNumber: result.irnNumber,
        ackNumber: result.ackNumber,
        ackDate: result.ackDate,
        signedQrCode: result.signedQrCode,
        requestPayload: result.requestPayload as object ?? undefined,
        responsePayload: result.responsePayload as object ?? undefined,
      },
    }),
    db.invoice.update({
      where: { id: invoiceId },
      data: {
        irnNumber: result.irnNumber,
        irnAckNumber: result.ackNumber,
        irnAckDate: result.ackDate,
        irnQrCode: result.qrCodeDataUrl,
      },
    }),
  ]);

  return {
    success: true,
    data: {
      irnNumber: result.irnNumber!,
      qrCodeDataUrl: result.qrCodeDataUrl!,
    },
  };
}

// ─── Cancel IRN ───────────────────────────────────────────────────────────────

export async function cancelIrnAction(
  invoiceId: string,
  cancelReason: string
): Promise<ActionResult<void>> {
  const { orgId, userId } = await requireRole("admin");

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.organizationId !== orgId) {
    return { success: false, error: "Invoice not found." };
  }
  if (!invoice.irnNumber) {
    return { success: false, error: "No IRN exists for this invoice." };
  }

  // NIC rule: cancellation only within 24 hours of generation
  const generationRecord = await db.eInvoiceRequest.findFirst({
    where: { invoiceId, requestType: EInvoiceRequestType.GENERATE_IRN, status: EInvoiceStatus.SUCCESS },
    orderBy: { createdAt: "desc" },
  });

  if (generationRecord) {
    const hoursSinceGeneration = (Date.now() - generationRecord.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceGeneration > 24) {
      return { success: false, error: "IRN cancellation window has expired (must cancel within 24 hours of generation)." };
    }
  }

  await db.$transaction([
    db.eInvoiceRequest.create({
      data: {
        orgId,
        invoiceId,
        requestType: EInvoiceRequestType.CANCEL_IRN,
        status: EInvoiceStatus.SUCCESS,
        cancelReason,
        cancelledAt: new Date(),
        triggeredByUserId: userId,
      },
    }),
    db.invoice.update({
      where: { id: invoiceId },
      data: {
        irnNumber: null,
        irnAckNumber: null,
        irnAckDate: null,
        irnQrCode: null,
      },
    }),
  ]);

  return { success: true, data: undefined };
}

// ─── E-Invoice Config ─────────────────────────────────────────────────────────

export async function getEInvoiceConfig() {
  const { orgId } = await requireOrgContext();
  return db.eInvoiceConfig.findUnique({ where: { orgId } });
}

export async function upsertEInvoiceConfig(data: {
  enabled: boolean;
  irpEnvironment: "sandbox" | "production";
  gstin?: string;
  autoGenerateIrn: boolean;
  autoGenerateEwb: boolean;
  ewbDefaultTransportMode?: string;
}): Promise<ActionResult<void>> {
  const { orgId } = await requireRole("admin");

  await db.eInvoiceConfig.upsert({
    where: { orgId },
    create: { orgId, ...data },
    update: data,
  });

  return { success: true, data: undefined };
}

// ─── Compliance Dashboard ─────────────────────────────────────────────────────

export async function getComplianceDashboard() {
  const { orgId } = await requireOrgContext();

  const [eInvoiceStats, gstr2bStats, tdsStats] = await Promise.all([
    db.eInvoiceRequest.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { id: true },
    }),
    db.gstr2bImport.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        period: true,
        status: true,
        totalEntries: true,
        matchedCount: true,
        unmatchedCount: true,
        createdAt: true,
      },
    }),
    db.tdsRecord.groupBy({
      by: ["certStatus"],
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { tdsAmount: true },
    }),
  ]);

  return { eInvoiceStats, gstr2bStats, tdsStats };
}

// ─── List E-Invoice Requests ──────────────────────────────────────────────────

export async function listEInvoiceRequests(invoiceId: string) {
  const { orgId } = await requireOrgContext();

  return db.eInvoiceRequest.findMany({
    where: { orgId, invoiceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAllEInvoiceRequests() {
  const { orgId } = await requireOrgContext();

  const requests = await db.eInvoiceRequest.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          totalAmount: true,
          customer: { select: { name: true } },
        },
      },
    },
    take: 50,
  });

  return requests.map((req) => ({
    ...req,
    invoice: {
      ...req.invoice,
      totalAmount: Number(req.invoice.totalAmount),
    },
  }));
}
