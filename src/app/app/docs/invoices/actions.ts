"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { nextDocumentNumberTx } from "@/lib/docs";
import { getSchemaDriftActionMessage, isSchemaDriftError } from "@/lib/prisma-errors";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { StockEventType } from "@/generated/prisma/client";
import { reconcileInvoicePayment, validatePaymentAmount } from "@/lib/invoice-reconciliation";
import { postInvoiceIssueTx, postInvoicePaymentTx, reverseJournalEntryTx } from "@/lib/accounting";
import { fireWorkflowTrigger } from "@/lib/flow/workflow-engine";
import { emitInvoiceEvent } from "@/lib/document-events";
import { syncInvoiceToIndex, removeDocumentFromIndex } from "@/lib/docs-vault";
import { setInvoiceTags } from "@/lib/tags/assignment-service";
import { checkUsageLimit } from "@/lib/usage-metering";
import { getOutboundUnitCostTx, recordStockEventTx } from "@/lib/inventory/stock-events";
import {
  fromMinorUnits,
  multiplyMoneyToMinorUnits,
  normalizeMoney,
  percentageOfMinorUnits,
  sumMinorUnits,
  toMinorUnits,
} from "@/lib/money";
import { formatIsoDate, parseAccountingDate, toAccountingNumber } from "@/lib/accounting/utils";
import { consumeSequenceNumber } from "@/features/sequences/services/sequence-engine";
import { getSequenceConfig } from "@/features/sequences/services/sequence-admin";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import type { ConsumeResult } from "@/features/sequences/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "VIEWED"
  | "DUE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "DISPUTED"
  | "CANCELLED"
  | "REISSUED";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type TxClient = Prisma.TransactionClient;

export interface InvoiceLineItemInput {
  description: string;
  inventoryItemId?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
}

type NormalizedInvoiceLineItemInput = {
  description: string;
  inventoryItemId: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  amount: number;
};

export interface InvoiceInput {
  customerId?: string;
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  formData: Record<string, unknown>;
  lineItems: InvoiceLineItemInput[];
  /** Phase 29: Tag IDs to assign to this invoice */
  tagIds?: string[];
}

async function reverseInvoicePostingIfNeededTx(
  tx: TxClient,
  input: {
    orgId: string;
    actorId: string;
    invoice: {
      id: string;
      invoiceNumber: string | null;
      amountPaid: number;
      postedJournalEntryId: string | null;
      accountingStatus: string;
    };
    reason: string;
    action: "cancel" | "reissue";
  },
): Promise<string | null> {
  if (input.invoice.amountPaid > 0) {
    throw new Error(
      `Cannot ${input.action} an invoice with recorded settled payments. Reverse or refund payments first.`,
    );
  }

  if (!input.invoice.postedJournalEntryId || input.invoice.accountingStatus !== "POSTED") {
    return null;
  }

  const reversal = await reverseJournalEntryTx(tx, {
    orgId: input.orgId,
    journalEntryId: input.invoice.postedJournalEntryId,
    actorId: input.actorId,
    memo: `${input.action === "cancel" ? "Cancel" : "Reissue"} invoice ${input.invoice.invoiceNumber ?? input.invoice.id}${
      input.reason.trim() ? `: ${input.reason.trim()}` : ""
    }`,
  });

  return reversal.id;
}

function normalizeInvoiceLineItems(
  lineItems: InvoiceLineItemInput[],
): { lineItems: NormalizedInvoiceLineItemInput[]; totalAmount: number } {
  const normalizedLineItems = lineItems.map((item) => {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Invoice quantities must be greater than zero.");
    }

    if (item.inventoryItemId && !Number.isInteger(quantity)) {
      throw new Error("Inventory-linked invoice lines must use whole-number quantities.");
    }

    const unitPrice = normalizeMoney(item.unitPrice);
    const taxRate = Number.isFinite(item.taxRate) ? Math.max(item.taxRate, 0) : 0;
    const baseAmountMinor = multiplyMoneyToMinorUnits(quantity, unitPrice);
    const discountMinor = Math.min(Math.max(toMinorUnits(item.discount), 0), baseAmountMinor);
    const taxableMinor = Math.max(baseAmountMinor - discountMinor, 0);
    const taxMinor = percentageOfMinorUnits(taxableMinor, taxRate);
    const amountMinor = taxableMinor + taxMinor;

    return {
      description: item.description.trim(),
      inventoryItemId: item.inventoryItemId?.trim() || null,
      quantity,
      unitPrice,
      taxRate,
      discount: fromMinorUnits(discountMinor),
      amount: fromMinorUnits(amountMinor),
    };
  });

  return {
    lineItems: normalizedLineItems,
    totalAmount: fromMinorUnits(sumMinorUnits(normalizedLineItems.map((item) => item.amount))),
  };
}

function normalizeInvoiceDateInput(value: Date | string, fieldLabel: string): Date {
  try {
    return parseAccountingDate(value);
  } catch {
    throw new Error(`${fieldLabel} must be a valid date.`);
  }
}

function normalizeOptionalInvoiceDateInput(
  value: Date | string | null | undefined,
  fieldLabel: string,
): Date | null {
  if (!value) {
    return null;
  }

  return normalizeInvoiceDateInput(value, fieldLabel);
}

async function syncInvoiceRecordToIndex(orgId: string, invoiceId: string): Promise<void> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId },
    include: { customer: true },
  });

  if (!invoice) {
    return;
  }

  let invoiceDate: string;
  try {
    invoiceDate = formatIsoDate(invoice.invoiceDate);
  } catch (error) {
    console.warn(`Skipping invoice index sync for ${invoiceId}: invalid invoice date`, error);
    return;
  }

  await syncInvoiceToIndex(orgId, {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? "",
    status: invoice.status,
    invoiceDate,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    displayCurrency: invoice.displayCurrency,
    archivedAt: invoice.archivedAt,
    customer: invoice.customer ?? undefined,
  });
}

async function dispatchInvoiceInventoryTx(
  tx: TxClient,
  input: {
    orgId: string;
    actorId: string;
    invoiceId: string;
    lineItems: Array<{
      inventoryItemId: string | null;
      quantity: number;
      description: string;
    }>;
  },
): Promise<void> {
  for (const line of input.lineItems) {
    if (!line.inventoryItemId) {
      continue;
    }

    const dispatchQty = Math.trunc(line.quantity);
    if (dispatchQty <= 0) {
      continue;
    }

    const sourceLevel = await tx.stockLevel.findFirst({
      where: {
        inventoryItemId: line.inventoryItemId,
        orgId: input.orgId,
        availableQty: { gte: dispatchQty },
      },
      orderBy: { availableQty: "desc" },
    });

    if (!sourceLevel) {
      throw new Error(`Insufficient stock to issue invoice line "${line.description}".`);
    }

    const outboundUnitCost = await getOutboundUnitCostTx(tx, {
      orgId: input.orgId,
      inventoryItemId: line.inventoryItemId,
      warehouseId: sourceLevel.warehouseId,
      quantity: dispatchQty,
    });

    await recordStockEventTx(tx, {
      orgId: input.orgId,
      inventoryItemId: line.inventoryItemId,
      warehouseId: sourceLevel.warehouseId,
      eventType: StockEventType.SALES_DISPATCH,
      quantity: dispatchQty,
      unitCost: outboundUnitCost,
      referenceType: "Invoice",
      referenceId: input.invoiceId,
      note: `Issued from invoice ${input.invoiceId}`,
      createdByUserId: input.actorId,
    });
  }
}

async function reverseInvoiceInventoryTx(
  tx: TxClient,
  input: {
    orgId: string;
    actorId: string;
    invoiceId: string;
    reason: string;
  },
): Promise<void> {
  const stockEvents = await tx.stockEvent.findMany({
    where: {
      orgId: input.orgId,
      referenceType: "Invoice",
      referenceId: input.invoiceId,
      eventType: StockEventType.SALES_DISPATCH,
    },
    orderBy: { createdAt: "asc" },
  });

  for (const stockEvent of stockEvents) {
    await recordStockEventTx(tx, {
      orgId: input.orgId,
      inventoryItemId: stockEvent.inventoryItemId,
      warehouseId: stockEvent.warehouseId,
      eventType: StockEventType.RETURN_IN,
      quantity: stockEvent.quantity,
      unitCost: Number(stockEvent.unitCost),
      referenceType: "Invoice",
      referenceId: input.invoiceId,
      note: input.reason.trim()
        ? `Inventory restored after invoice cancellation: ${input.reason.trim()}`
        : "Inventory restored after invoice cancellation",
      createdByUserId: input.actorId,
    });
  }
}

// ─── Invoice Actions ──────────────────────────────────────────────────────────

/**
 * Assign the next official invoice number via the sequence engine.
 * Falls back to legacy OrgDefaults numbering if no active sequence
 * exists for the org (e.g. migration not yet run).
 *
 * Returns the formatted number and, when the sequence engine is used,
 * the sequence details needed to link the invoice row.
 *
 * Phase 7/Sprint 7.1: idempotencyKey (documentId) prevents double
 * consumption on retry of the same invoice.
 */
async function assignNextInvoiceNumber(
  orgId: string,
  documentDate: Date,
  tx: Prisma.TransactionClient,
): Promise<{
  invoiceNumber: string;
  sequenceId: string | null;
  sequencePeriodId: string | null;
  sequenceNumber: number | null;
}> {
  const sequenceConfig = await getSequenceConfig({
    orgId,
    documentType: "INVOICE",
  });

  if (sequenceConfig?.sequenceId) {
    const result: ConsumeResult = await consumeSequenceNumber({
      sequenceId: sequenceConfig.sequenceId,
      documentDate,
      orgId,
      tx,
    });
    return {
      invoiceNumber: result.formattedNumber,
      sequenceId: sequenceConfig.sequenceId,
      sequencePeriodId: result.periodId,
      sequenceNumber: result.sequenceNumber,
    };
  }

  // Legacy fallback — use the transaction-aware variant so the counter
  // is only advanced if the enclosing invoice transaction commits.
  const legacyNumber = await nextDocumentNumberTx(tx, orgId, "invoice");
  return {
    invoiceNumber: legacyNumber,
    sequenceId: null,
    sequencePeriodId: null,
    sequenceNumber: null,
  };
}

export async function saveInvoice(
  input: InvoiceInput,
  status: "DRAFT" | "ISSUED" = "DRAFT"
): Promise<ActionResult<{ id: string; invoiceNumber: string | null }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const limitCheck = await checkUsageLimit(orgId, "INVOICE");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Invoice limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more invoices.`,
      };
    }

    // Phase 4 / Sprint 4.2: drafts stay null; issued invoices get their
    // official number via the sequence engine inside the transaction.
    let invoiceNumber: string | null = null;
    let issueSequenceId: string | null = null;
    let issuePeriodId: string | null = null;
    let issueSequenceNumber: number | null = null;

    const normalizedInvoice = normalizeInvoiceLineItems(input.lineItems);
    const invoiceDate = normalizeInvoiceDateInput(input.invoiceDate, "Invoice date");
    const dueDate = normalizeOptionalInvoiceDateInput(input.dueDate, "Due date");

    const invoice = await db.$transaction(async (tx) => {
      if (status === "ISSUED") {
        const assigned = await assignNextInvoiceNumber(orgId, invoiceDate, tx);
        invoiceNumber = assigned.invoiceNumber;
        issueSequenceId = assigned.sequenceId;
        issuePeriodId = assigned.sequencePeriodId;
        issueSequenceNumber = assigned.sequenceNumber;
      }

      const created = await tx.invoice.create({
        data: {
          organizationId: orgId,
          customerId: input.customerId || null,
          invoiceNumber,
          invoiceDate,
          dueDate,
          status,
          notes: input.notes || null,
          formData: input.formData as Prisma.InputJsonValue,
          totalAmount: normalizedInvoice.totalAmount,
          sequenceId: issueSequenceId,
          sequencePeriodId: issuePeriodId,
          sequenceNumber: issueSequenceNumber,
          issuedAt: status === "ISSUED" ? new Date() : null,
          lineItems: {
            create: normalizedInvoice.lineItems.map((item, index) => ({
              description: item.description,
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              discount: item.discount,
              amount: item.amount,
              sortOrder: index,
            })),
          },
        },
      });

      if (status === "ISSUED") {
        await tx.invoiceStateEvent.create({
          data: {
            invoiceId: created.id,
            fromStatus: "DRAFT",
            toStatus: "ISSUED",
            actorId: userId,
          },
        });

        await tx.publicInvoiceToken.create({
          data: {
            invoiceId: created.id,
            orgId,
            token: crypto.randomUUID(),
          },
        });

        await postInvoiceIssueTx(tx, {
          orgId,
          invoiceId: created.id,
          actorId: userId,
        });

        await dispatchInvoiceInventoryTx(tx, {
          orgId,
          actorId: userId,
          invoiceId: created.id,
          lineItems: normalizedInvoice.lineItems,
        });
      }

      return created;
    });

    // Phase 17.4: Hook workflow trigger
    if (status === "ISSUED") {
      await fireWorkflowTrigger({
        triggerType: "invoice.issued",
        orgId,
        sourceModule: "invoices",
        sourceEntityType: "Invoice",
        sourceEntityId: invoice.id,
        actorId: userId,
        payload: {
          invoiceNumber: invoice.invoiceNumber ?? "",
          totalAmount: invoice.totalAmount,
          customerId: invoice.customerId,
        },
      });
    } else {
      // Draft created
      void fireWorkflowTrigger({
        triggerType: "invoice.created",
        orgId,
        sourceModule: "invoices",
        sourceEntityType: "Invoice",
        sourceEntityId: invoice.id,
        actorId: userId,
        payload: {
          invoiceNumber: invoice.invoiceNumber ?? "",
          totalAmount: invoice.totalAmount,
          customerId: invoice.customerId,
          status: invoice.status,
        },
      });
    }

    await emitInvoiceEvent(orgId, invoice.id, status === "ISSUED" ? "issued" : "created", {
      actorId: userId,
      metadata: { invoiceNumber },
    });
    await syncInvoiceRecordToIndex(orgId, invoice.id);

    if (input.tagIds !== undefined) {
      await setInvoiceTags(invoice.id, input.tagIds);
    }

    revalidatePath("/app/docs/invoices");
    return { success: true, data: { id: invoice.id, invoiceNumber } };
  } catch (error) {
    if (isSchemaDriftError(error, "Invoice")) {
      console.warn(
        "saveInvoice failed because the local database schema is behind the Prisma schema.",
      );
      return {
        success: false,
        error: getSchemaDriftActionMessage("save the invoice"),
      };
    }
    console.error("saveInvoice error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save invoice" };
  }
}

export async function updateInvoice(
  id: string,
  input: Partial<InvoiceInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (existing.accountingStatus === "POSTED" || existing.postedJournalEntryId) {
      return { success: false, error: "Posted invoices cannot be edited" };
    }

    const normalizedInvoice = input.lineItems
      ? normalizeInvoiceLineItems(input.lineItems)
      : null;

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          customerId: input.customerId,
          ...(input.invoiceDate !== undefined
            ? { invoiceDate: normalizeInvoiceDateInput(input.invoiceDate, "Invoice date") }
            : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: normalizeOptionalInvoiceDateInput(input.dueDate, "Due date") }
            : {}),
          notes: input.notes,
          formData: input.formData as Prisma.InputJsonValue | undefined,
          totalAmount: normalizedInvoice?.totalAmount ?? existing.totalAmount,
        },
      });

      if (normalizedInvoice) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLineItem.createMany({
          data: normalizedInvoice.lineItems.map((item, index) => ({
            invoiceId: id,
            description: item.description,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            discount: item.discount,
            amount: item.amount,
            sortOrder: index,
          })),
        });
      }
    });

    await emitInvoiceEvent(orgId, id, "updated", { actorId: userId });
    await syncInvoiceRecordToIndex(orgId, id);

    if (input.tagIds !== undefined) {
      await setInvoiceTags(id, input.tagIds);
    }

    revalidatePath("/app/docs/invoices");
      revalidatePath(`/app/docs/invoices/${id}`);
      return { success: true, data: { id } };
  } catch (error) {
    if (isSchemaDriftError(error, "Invoice")) {
      console.warn(
        "updateInvoice failed because the local database schema is behind the Prisma schema.",
      );
      return {
        success: false,
        error: getSchemaDriftActionMessage("update the invoice"),
      };
    }
    console.error("updateInvoice error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update invoice" };
  }
}

export async function archiveInvoice(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    await db.invoice.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await emitInvoiceEvent(orgId, id, "archived", { actorId: userId });
    await syncInvoiceRecordToIndex(orgId, id);

    revalidatePath("/app/docs/invoices");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("archiveInvoice error:", error);
    return { success: false, error: "Failed to archive invoice" };
  }
}

export async function duplicateInvoice(
  id: string
): Promise<ActionResult<{ id: string; invoiceNumber: string | null }>> {
  try {
    const { orgId } = await requireOrgContext();

    const limitCheck = await checkUsageLimit(orgId, "INVOICE");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Invoice limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more invoices.`,
      };
    }

    const existing = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: { lineItems: true },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    // Phase 4: duplicates start as drafts — no official number consumed yet.
    const duplicate = await db.invoice.create({
      data: {
        organizationId: orgId,
        customerId: existing.customerId,
        invoiceNumber: null,
        invoiceDate: parseAccountingDate(new Date()),
        dueDate: existing.dueDate,
        status: "DRAFT",
        notes: existing.notes,
        formData: existing.formData as Prisma.InputJsonValue,
        totalAmount: existing.totalAmount,
        lineItems: {
          create: existing.lineItems.map((item) => ({
            description: item.description,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            discount: item.discount,
            amount: item.amount,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });

    await Promise.all([
      emitInvoiceEvent(orgId, duplicate.id, "created", {
        metadata: { duplicatedFrom: id, invoiceNumber: null },
      }),
      emitInvoiceEvent(orgId, id, "duplicated", {
        metadata: { newInvoiceId: duplicate.id, newInvoiceNumber: null },
      }),
      syncInvoiceRecordToIndex(orgId, duplicate.id),
    ]);

    revalidatePath("/app/docs/invoices");
    return { success: true, data: { id: duplicate.id, invoiceNumber: null } };
  } catch (error) {
    console.error("duplicateInvoice error:", error);
    return { success: false, error: "Failed to duplicate invoice" };
  }
}

export async function deleteInvoice(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (existing.status !== "DRAFT") {
      return { success: false, error: "Can only delete draft invoices" };
    }

    await db.invoice.delete({ where: { id } });

    await removeDocumentFromIndex(orgId, "invoice", id);

    revalidatePath("/app/docs/invoices");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteInvoice error:", error);
    return { success: false, error: "Failed to delete invoice" };
  }
}

export async function getInvoice(id: string) {
  const { orgId } = await requireOrgContext();

  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: orgId, archivedAt: null },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      customer: true,
    },
  });

  if (!invoice) {
    return null;
  }

  return {
    ...invoice,
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    amountPaid: toAccountingNumber(invoice.amountPaid),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
    paymentPromiseDate: invoice.paymentPromiseDate ? formatIsoDate(invoice.paymentPromiseDate) : null,
    lineItems: invoice.lineItems.map((lineItem) => ({
      ...lineItem,
      amount: toAccountingNumber(lineItem.amount),
    })),
  };
}

export async function listInvoices(params?: {
  status?: InvoiceStatus;
  search?: string;
  page?: number;
  limit?: number;
  includeArchived?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sequenceId?: string;
  amountMin?: number;
  amountMax?: number;
  customerId?: string;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;

  const safeSearch = params?.search && params.search !== "undefined" ? params.search : undefined;
  const safeStatus = params?.status && params.status !== ("undefined" as unknown as InvoiceStatus) ? params.status : undefined;
  const safeSequenceId = params?.sequenceId && params.sequenceId !== "undefined" ? params.sequenceId : undefined;

  const dateFrom = params?.dateFrom && params.dateFrom !== "undefined" ? new Date(`${params.dateFrom}T00:00:00`) : undefined;
  const dateTo = params?.dateTo && params.dateTo !== "undefined" ? new Date(`${params.dateTo}T23:59:59`) : undefined;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    ...(safeStatus && { status: safeStatus }),
    ...(params?.includeArchived !== true && { archivedAt: null }),
    ...(safeSequenceId && { sequenceId: safeSequenceId }),
    ...(params?.amountMin !== undefined && !isNaN(params.amountMin) && { totalAmount: { gte: params.amountMin } }),
    ...(params?.amountMax !== undefined && !isNaN(params.amountMax) && { totalAmount: { lte: params.amountMax } }),
    ...(params?.customerId && params.customerId !== "undefined" && { customerId: params.customerId }),
    ...(safeSearch && {
      OR: [
        { invoiceNumber: { contains: safeSearch, mode: "insensitive" as const } },
        { customer: { name: { contains: safeSearch, mode: "insensitive" as const } } },
      ],
    }),
  };

  // Date range filter
  if (dateFrom && dateTo) {
    where.invoiceDate = { gte: dateFrom, lte: dateTo };
  } else if (dateFrom) {
    where.invoiceDate = { gte: dateFrom };
  } else if (dateTo) {
    where.invoiceDate = { lte: dateTo };
  }

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        publicTokens: true,
        proofs: {
          where: { reviewStatus: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            createdAt: true,
          },
        },
        tickets: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            status: true,
            category: true,
            createdAt: true,
          },
        },
      },
    }),
    db.invoice.count({ where }),
  ]);

  return {
    invoices: invoices.map((invoice) => ({
      ...invoice,
      invoiceDate: formatIsoDate(invoice.invoiceDate),
      dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
      totalAmount: toAccountingNumber(invoice.totalAmount),
      amountPaid: toAccountingNumber(invoice.amountPaid),
      remainingAmount: toAccountingNumber(invoice.remainingAmount),
      paymentPromiseDate: invoice.paymentPromiseDate
        ? formatIsoDate(invoice.paymentPromiseDate)
        : null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── State Machine ────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["VIEWED", "DUE", "PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "CANCELLED"],
  VIEWED: ["DUE", "PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "CANCELLED"],
  DUE: ["PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE", "DISPUTED", "CANCELLED"],
  PAID: ["DISPUTED", "REISSUED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "DISPUTED", "CANCELLED"],
  DISPUTED: ["ISSUED", "CANCELLED"],
  CANCELLED: [],
  REISSUED: [],
};

function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Status Transitions ───────────────────────────────────────────────────────

/**
 * Execute the full issue lifecycle for a draft invoice.
 *
 * This is the authoritative issue path.  It is called by both the
 * web-app `issueInvoice` server action and the API v1 send endpoint
 * so that no issued invoice can skip critical side effects (state
 * event, public token, accounting posting, inventory dispatch,
 * workflow trigger, event emission, index sync).
 *
 * The caller is responsible for authz (org scoping, status check)
 * before invoking this helper.
 *
 * Phase 7/Sprint 7.1: re-reads invoice number inside the transaction
 * to prevent concurrent issue calls from assigning duplicate numbers
 * (TOCTOU hardening). The sequence engine idempotency key (invoiceId)
 * also guards against double-consumption on retry.
 */
export async function performIssueInvoice(
  orgId: string,
  actorId: string,
  invoiceId: string,
): Promise<{ invoiceNumber: string }> {
  const preexisting = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId },
    include: { lineItems: { where: { inventoryItemId: { not: null } } } },
  });

  if (!preexisting) {
    throw new Error("Invoice not found");
  }

  if (!canTransition(preexisting.status, "ISSUED")) {
    throw new Error(`Cannot issue invoice in ${preexisting.status} status`);
  }

  let invoiceNumber = "";
  let issueSequenceId: string | null = null;
  let issuePeriodId: string | null = null;
  let issueSequenceNumber: number | null = null;

  await db.$transaction(async (tx) => {
    const current = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { invoiceNumber: true, status: true },
    });

    if (!current) {
      throw new Error("Invoice not found inside transaction");
    }

    const docDate = new Date(preexisting.invoiceDate);

    if (!current.invoiceNumber) {
      const assigned = await assignNextInvoiceNumber(orgId, docDate, tx);
      invoiceNumber = assigned.invoiceNumber;
      issueSequenceId = assigned.sequenceId;
      issuePeriodId = assigned.sequencePeriodId;
      issueSequenceNumber = assigned.sequenceNumber;
    } else {
      invoiceNumber = current.invoiceNumber;
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        ...(!current.invoiceNumber
          ? {
              invoiceNumber,
              sequenceId: issueSequenceId,
              sequencePeriodId: issuePeriodId,
              sequenceNumber: issueSequenceNumber,
            }
          : {}),
      },
    });

    await tx.invoiceStateEvent.create({
      data: {
        invoiceId,
        fromStatus: preexisting.status,
        toStatus: "ISSUED",
        actorId,
      },
    });

    await tx.publicInvoiceToken.create({
      data: {
        invoiceId,
        orgId,
        token: crypto.randomUUID(),
      },
    });

    await postInvoiceIssueTx(tx, {
      orgId,
      invoiceId,
      actorId,
    });

    await dispatchInvoiceInventoryTx(tx, {
      orgId,
      actorId,
      invoiceId,
      lineItems: preexisting.lineItems,
    });
  });

  await fireWorkflowTrigger({
    triggerType: "invoice.issued",
    orgId,
    sourceModule: "invoices",
    sourceEntityType: "Invoice",
    sourceEntityId: invoiceId,
    actorId,
    payload: {
      invoiceNumber,
      totalAmount: preexisting.totalAmount,
      customerId: preexisting.customerId,
    },
  });

  await Promise.all([
    emitInvoiceEvent(orgId, invoiceId, "issued", {
      actorId,
      metadata: { invoiceNumber },
    }),
    syncInvoiceRecordToIndex(orgId, invoiceId),
  ]);

  revalidatePath("/app/docs/invoices");
  revalidatePath(`/app/docs/invoices/${invoiceId}`);

  return { invoiceNumber };
}

export async function issueInvoice(id: string): Promise<ActionResult<{ invoiceNumber: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const rateLimit = await rateLimitByOrg(orgId, RATE_LIMITS.invoiceIssue);
    if (!rateLimit.success) {
      return { success: false, error: `Rate limit exceeded for invoice issue. Retry after ${rateLimit.retryAfter ?? 60} seconds.` };
    }

    const { invoiceNumber } = await performIssueInvoice(orgId, userId, id);
    return { success: true, data: { invoiceNumber } };
  } catch (error) {
    console.error("issueInvoice error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to issue invoice" };
  }
}

export async function markInvoicePaid(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true, totalAmount: true, amountPaid: true },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (existing.status === "PAID") {
      return { success: false, error: "Invoice is already paid" };
    }

    if (existing.status === "CANCELLED") {
      return { success: false, error: "Cannot mark a cancelled invoice as paid" };
    }

    if (existing.status === "DRAFT") {
      return { success: false, error: "Cannot mark a draft invoice as paid" };
    }

    // Backwards-compat: compute remaining from totalAmount - amountPaid so that
    // legacy records (where remainingAmount column still holds the default 0) work correctly.
    const remaining = fromMinorUnits(
      Math.max(
        toMinorUnits(toAccountingNumber(existing.totalAmount)) -
          toMinorUnits(toAccountingNumber(existing.amountPaid)),
        0,
      ),
    );

    if (remaining <= 0) {
      return { success: false, error: "Invoice has no remaining balance" };
    }

    await db.$transaction(async (tx) => {
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: id,
          orgId,
          amount: remaining,
          method: "manual",
          source: "admin_manual",
          status: "SETTLED",
          recordedByUserId: userId,
        },
      });

      await postInvoicePaymentTx(tx, {
        orgId,
        invoicePaymentId: payment.id,
        actorId: userId,
      });
    });

    const reconcileResult = await reconcileInvoicePayment(id, userId);

    if (reconcileResult.statusChanged) {
      const eventType =
        reconcileResult.derivedStatus === "PAID"
          ? "paid"
          : reconcileResult.derivedStatus === "PARTIALLY_PAID"
            ? "partially_paid"
            : null;

      if (eventType) {
        await emitInvoiceEvent(orgId, id, eventType, {
          actorId: userId,
          metadata: {
            amountPaid: reconcileResult.amountPaid,
            remainingAmount: reconcileResult.remainingAmount,
          },
        });
      }
    }

    await syncInvoiceRecordToIndex(orgId, id);

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${id}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("markInvoicePaid error:", error);
    return { success: false, error: "Failed to mark invoice as paid" };
  }
}

interface RecordPaymentInput {
  amount: number;
  method?: string;
  paidAt?: Date;
  note?: string;
  plannedNextPaymentDate?: string; // ISO date string, only valid if amount < remaining
}

export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput
): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (existing.status === "DRAFT" || existing.status === "REISSUED") {
      return { success: false, error: `Cannot record payment for invoice in ${existing.status} status` };
    }

    const validation = await validatePaymentAmount(invoiceId, input.amount);
    if (!validation.valid) {
      return { success: false, error: validation.error! };
    }

    const remaining = validation.remaining;

    if (input.plannedNextPaymentDate && input.amount < remaining) {
      const promiseDate = new Date(input.plannedNextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (promiseDate < today) {
        return { success: false, error: "Planned next payment date must be today or in the future" };
      }
    }

    // ─── High-Value Payment Gate ───────────────────────────────────────────────
    const orgDefaults = await db.orgDefaults.findUnique({
      where: { organizationId: orgId },
      select: { requireDualApprovalPayment: true, highValuePaymentThreshold: true },
    });
    if (orgDefaults?.requireDualApprovalPayment && input.amount > orgDefaults.highValuePaymentThreshold) {
      // Create an ApprovalRequest; do NOT record the payment yet.
      const profile = await db.profile.findUnique({ where: { id: userId }, select: { name: true } });
      await db.approvalRequest.create({
        data: {
          docType: "invoice_payment_pending",
          docId: invoiceId,
          orgId,
          requestedById: userId,
          requestedByName: profile?.name ?? null,
          status: "PENDING",
          note: `High-value payment of ₹${input.amount.toLocaleString("en-IN")} pending dual approval.`,
        },
      });
      return {
        success: false,
        error: `Payment of ₹${input.amount.toLocaleString("en-IN")} exceeds the high-value threshold (₹${orgDefaults.highValuePaymentThreshold.toLocaleString("en-IN")}) and requires a second admin's approval. An approval request has been created.`,
      };
    }

    await db.$transaction(async (tx) => {
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId,
          orgId,
          amount: input.amount,
          method: input.method ?? null,
          paidAt: input.paidAt ?? new Date(),
          note: input.note ?? null,
          source: "admin_manual",
          status: "SETTLED",
          recordedByUserId: userId,
          plannedNextPaymentDate:
            input.amount < remaining ? (input.plannedNextPaymentDate ?? null) : null,
        },
      });

      await postInvoicePaymentTx(tx, {
        orgId,
        invoicePaymentId: payment.id,
        actorId: userId,
      });
    });

    const reconcileResult = await reconcileInvoicePayment(invoiceId, userId);

    if (reconcileResult.statusChanged) {
      const eventType =
        reconcileResult.derivedStatus === "PAID"
          ? "paid"
          : reconcileResult.derivedStatus === "PARTIALLY_PAID"
            ? "partially_paid"
            : null;

      if (eventType) {
        await emitInvoiceEvent(orgId, invoiceId, eventType, {
          actorId: userId,
          metadata: {
            amountPaid: reconcileResult.amountPaid,
            remainingAmount: reconcileResult.remainingAmount,
          },
        });
      }
    }

    await syncInvoiceRecordToIndex(orgId, invoiceId);

    // Sprint 25.1: fire invoice.paid trigger once invoice reaches PAID status
    const updated = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, invoiceNumber: true, totalAmount: true, customerId: true, organizationId: true },
    });
    if (updated?.status === "PAID") {
      void fireWorkflowTrigger({
        triggerType: "invoice.paid",
        orgId,
        sourceModule: "invoices",
        sourceEntityType: "Invoice",
        sourceEntityId: invoiceId,
        actorId: userId,
        payload: {
          invoiceNumber: updated.invoiceNumber,
          totalAmount: updated.totalAmount,
          customerId: updated.customerId,
        },
      });
    }

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${invoiceId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("recordPayment error:", error);
    return { success: false, error: "Failed to record payment" };
  }
}

export async function markOverdue(invoiceId: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (!canTransition(existing.status, "OVERDUE")) {
      return { success: false, error: `Cannot mark invoice as overdue from ${existing.status} status` };
    }

    await db.$transaction([
      db.invoice.update({
        where: { id: invoiceId },
        data: { status: "OVERDUE", overdueAt: new Date() },
      }),
      db.invoiceStateEvent.create({
        data: {
          invoiceId,
          fromStatus: existing.status,
          toStatus: "OVERDUE",
          actorId: userId,
        },
      }),
    ]);

    await Promise.all([
      emitInvoiceEvent(orgId, invoiceId, "overdue", { actorId: userId }),
      syncInvoiceRecordToIndex(orgId, invoiceId),
    ]);

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${invoiceId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("markOverdue error:", error);
    return { success: false, error: "Failed to mark invoice as overdue" };
  }
}

export async function disputeInvoice(
  invoiceId: string,
  reason: string
): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (!canTransition(existing.status, "DISPUTED")) {
      return { success: false, error: `Cannot dispute invoice in ${existing.status} status` };
    }

    await db.$transaction([
      db.invoice.update({
        where: { id: invoiceId },
        data: { status: "DISPUTED" },
      }),
      db.invoiceStateEvent.create({
        data: {
          invoiceId,
          fromStatus: existing.status,
          toStatus: "DISPUTED",
          actorId: userId,
          reason,
        },
      }),
    ]);

    await Promise.all([
      emitInvoiceEvent(orgId, invoiceId, "disputed", {
        actorId: userId,
        metadata: { reason },
      }),
      syncInvoiceRecordToIndex(orgId, invoiceId),
    ]);

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${invoiceId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("disputeInvoice error:", error);
    return { success: false, error: "Failed to dispute invoice" };
  }
}

export async function cancelInvoice(
  invoiceId: string,
  reason: string
): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (!canTransition(existing.status, "CANCELLED")) {
      return { success: false, error: `Cannot cancel invoice in ${existing.status} status` };
    }

    await db.$transaction(async (tx) => {
      const reversalJournalId = await reverseInvoicePostingIfNeededTx(tx, {
        orgId,
        actorId: userId,
        invoice: {
          id: existing.id,
          invoiceNumber: existing.invoiceNumber,
          amountPaid: toAccountingNumber(existing.amountPaid),
          postedJournalEntryId: existing.postedJournalEntryId,
          accountingStatus: existing.accountingStatus,
        },
        reason,
        action: "cancel",
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "CANCELLED",
          ...(reversalJournalId
            ? {
                accountingStatus: "REVERSED",
                revenueRecognitionStatus: "PENDING",
              }
            : {}),
        },
      });

      await tx.invoiceStateEvent.create({
        data: {
          invoiceId,
          fromStatus: existing.status,
          toStatus: "CANCELLED",
          actorId: userId,
          reason,
          metadata: reversalJournalId ? ({ reversalJournalId } as Prisma.InputJsonValue) : undefined,
        },
      });

      await reverseInvoiceInventoryTx(tx, {
        orgId,
        actorId: userId,
        invoiceId,
        reason,
      });
    });

    await Promise.all([
      emitInvoiceEvent(orgId, invoiceId, "cancelled", {
        actorId: userId,
        metadata: { reason },
      }),
      syncInvoiceRecordToIndex(orgId, invoiceId),
    ]);

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${invoiceId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("cancelInvoice error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel invoice",
    };
  }
}

export async function reissueInvoice(
  invoiceId: string,
  reason: string
): Promise<ActionResult<{ id: string; invoiceNumber: string | null }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: { lineItems: true },
    });

    if (!existing) {
      return { success: false, error: "Invoice not found" };
    }

    if (!canTransition(existing.status, "REISSUED")) {
      return { success: false, error: `Cannot reissue invoice in ${existing.status} status` };
    }

    // Phase 4: reissue creates a new DRAFT — no official number yet.

    const result = await db.$transaction(async (tx) => {
      const reversalJournalId = await reverseInvoicePostingIfNeededTx(tx, {
        orgId,
        actorId: userId,
        invoice: {
          id: existing.id,
          invoiceNumber: existing.invoiceNumber,
          amountPaid: toAccountingNumber(existing.amountPaid),
          postedJournalEntryId: existing.postedJournalEntryId,
          accountingStatus: existing.accountingStatus,
        },
        reason,
        action: "reissue",
      });

      const newInvoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          customerId: existing.customerId,
          invoiceNumber: null, // Phase 4: draft — no official number yet
          invoiceDate: parseAccountingDate(new Date()),
          dueDate: existing.dueDate,
          status: "DRAFT",
          notes: existing.notes,
          formData: existing.formData as Prisma.InputJsonValue,
          totalAmount: existing.totalAmount,
          originalId: invoiceId,
          lineItems: {
            create: existing.lineItems.map((item) => ({
              description: item.description,
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              discount: item.discount,
              amount: item.amount,
              sortOrder: item.sortOrder,
            })),
          },
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "REISSUED",
          reissueReason: reason,
          ...(reversalJournalId
            ? {
                accountingStatus: "REVERSED",
                revenueRecognitionStatus: "PENDING",
              }
            : {}),
        },
      });

      await tx.invoiceStateEvent.create({
        data: {
          invoiceId,
          fromStatus: existing.status,
          toStatus: "REISSUED",
          actorId: userId,
          reason,
          metadata: {
            newInvoiceId: newInvoice.id,
            newInvoiceNumber: null,
            ...(reversalJournalId ? { reversalJournalId } : {}),
          } as Prisma.InputJsonValue,
        },
      });

      return newInvoice;
    });

    await Promise.all([
      emitInvoiceEvent(orgId, invoiceId, "reissued", {
        actorId: userId,
        metadata: { newInvoiceId: result.id, newInvoiceNumber: null, reason },
      }),
      emitInvoiceEvent(orgId, result.id, "created", {
        actorId: userId,
        metadata: { reissuedFromId: invoiceId, invoiceNumber: null },
      }),
      syncInvoiceRecordToIndex(orgId, invoiceId),
      syncInvoiceRecordToIndex(orgId, result.id),
    ]);

    revalidatePath("/app/docs/invoices");
    revalidatePath(`/app/docs/invoices/${invoiceId}`);
    return { success: true, data: { id: result.id, invoiceNumber: null } };
  } catch (error) {
    console.error("reissueInvoice error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reissue invoice",
    };
  }
}

export async function getInvoicePayments(invoiceId: string) {
  const { orgId } = await requireOrgContext();
  const payments = await db.invoicePayment.findMany({
    where: { invoiceId, invoice: { organizationId: orgId } },
    orderBy: { paidAt: "desc" },
  });

  return payments.map((payment) => ({
    ...payment,
    amount: toAccountingNumber(payment.amount),
    plannedNextPaymentDate: payment.plannedNextPaymentDate
      ? formatIsoDate(payment.plannedNextPaymentDate)
      : null,
  }));
}

// ─── Timeline & Tokens ───────────────────────────────────────────────────────

export async function getInvoiceTimeline(invoiceId: string) {
  const { orgId } = await requireOrgContext();

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId },
    select: { id: true },
  });

  if (!invoice) return [];

  return db.invoiceStateEvent.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPublicToken(invoiceId: string) {
  const { orgId } = await requireOrgContext();

  return db.publicInvoiceToken.findFirst({
    where: { invoiceId, orgId },
    orderBy: { createdAt: "desc" },
  });
}
