import "server-only";

import crypto from "node:crypto";
import type {
  PaymentRunStatus,
  Prisma,
  VendorBillStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { nextDocumentNumberTx } from "@/lib/docs";
import { ensureBooksSetup } from "./accounts";
import { postVendorBillPaymentTx, postVendorBillTx } from "./posting";
import { cleanText, formatIsoDate, roundMoney, toAccountingNumber } from "./utils";
import { fireWorkflowTrigger } from "../flow/workflow-engine";

type TxClient = Prisma.TransactionClient;

const MONEY_TOLERANCE = 0.005;

export interface VendorBillLineInput {
  description: string;
  quantity?: number;
  unitPrice?: number;
  taxRate?: number;
}

export interface SaveVendorBillInput {
  orgId: string;
  actorId: string;
  vendorId?: string | null;
  expenseAccountId?: string | null;
  billDate: string;
  dueDate?: string | null;
  currency?: string | null;
  notes?: string | null;
  status?: VendorBillStatus;
  formData?: Prisma.InputJsonValue;
  lines: VendorBillLineInput[];
}

export interface CreateVendorBillPaymentInput {
  orgId: string;
  actorId: string;
  vendorBillId: string;
  amount: number;
  paidAt?: Date;
  method?: string | null;
  note?: string | null;
  source?: string | null;
  paymentRunId?: string | null;
}

export interface CreatePaymentRunInput {
  orgId: string;
  actorId: string;
  scheduledDate: Date;
  notes?: string | null;
  items: Array<{
    vendorBillId: string;
    amount: number;
  }>;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdueDate(dueDate?: string | null) {
  if (!dueDate) {
    return false;
  }

  return dueDate < todayIsoDate();
}

function normalizeVendorBillLines(lines: VendorBillLineInput[]) {
  if (lines.length === 0) {
    throw new Error("At least one vendor bill line is required.");
  }

  return lines.map((line, index) => {
    const description = cleanText(line.description);
    if (!description) {
      throw new Error(`Line ${index + 1} description is required.`);
    }

    const quantity = roundMoney(line.quantity ?? 1);
    const unitPrice = roundMoney(line.unitPrice ?? 0);
    const taxRate = roundMoney(line.taxRate ?? 0);

    if (quantity <= 0) {
      throw new Error(`Line ${index + 1} quantity must be greater than zero.`);
    }

    if (unitPrice < 0) {
      throw new Error(`Line ${index + 1} unit price cannot be negative.`);
    }

    if (taxRate < 0) {
      throw new Error(`Line ${index + 1} tax rate cannot be negative.`);
    }

    const lineSubtotal = roundMoney(quantity * unitPrice);
    const lineTax = roundMoney((lineSubtotal * taxRate) / 100);

    return {
      description,
      quantity,
      unitPrice,
      taxRate,
      lineSubtotal,
      lineTax,
      lineTotal: roundMoney(lineSubtotal + lineTax),
      sortOrder: index,
    };
  });
}

function buildPaymentRunNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `PRUN-${datePart}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function deriveVendorBillTaxTotalsTx(
  tx: TxClient,
  orgId: string,
  vendorId: string | null | undefined,
  lines: ReturnType<typeof normalizeVendorBillLines>,
) {
  const totalTax = roundMoney(lines.reduce((sum, line) => sum + line.lineTax, 0));

  if (totalTax === 0) {
    return {
      gstTotalCgst: 0,
      gstTotalSgst: 0,
      gstTotalIgst: 0,
      gstTotalCess: 0,
      taxAmount: 0,
    };
  }

  const [defaults, vendor] = await Promise.all([
    tx.orgDefaults.findUnique({
      where: { organizationId: orgId },
      select: { gstStateCode: true, country: true },
    }),
    vendorId
      ? tx.vendor.findFirst({
          where: { id: vendorId, organizationId: orgId },
          select: { gstin: true },
        })
      : Promise.resolve(null),
  ]);

  const orgStateCode = defaults?.gstStateCode?.trim();
  const vendorStateCode = vendor?.gstin?.slice(0, 2).trim();
  const splitIntraState =
    defaults?.country === "IN" &&
    !!orgStateCode &&
    !!vendorStateCode &&
    orgStateCode === vendorStateCode;

  if (splitIntraState) {
    const cgst = roundMoney(totalTax / 2);
    const sgst = roundMoney(totalTax - cgst);
    return {
      gstTotalCgst: cgst,
      gstTotalSgst: sgst,
      gstTotalIgst: 0,
      gstTotalCess: 0,
      taxAmount: totalTax,
    };
  }

  return {
    gstTotalCgst: 0,
    gstTotalSgst: 0,
    gstTotalIgst: totalTax,
    gstTotalCess: 0,
    taxAmount: totalTax,
  };
}

function deriveVendorBillLifecycleStatus(input: {
  totalAmount: number;
  amountPaid: number;
  dueDate?: string | null;
}): VendorBillStatus {
  if (roundMoney(input.amountPaid) <= MONEY_TOLERANCE) {
    if (isOverdueDate(input.dueDate)) {
      return "OVERDUE";
    }
    return "APPROVED";
  }

  if (roundMoney(input.totalAmount - input.amountPaid) <= MONEY_TOLERANCE) {
    return "PAID";
  }

  return "PARTIALLY_PAID";
}

async function refreshVendorBillOverdueStatesTx(tx: TxClient, orgId: string) {
  // Use a native Date object to satisfy Prisma's DateTime validation
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  await tx.vendorBill.updateMany({
    where: {
      orgId,
      archivedAt: null,
      remainingAmount: { gt: MONEY_TOLERANCE },
      status: "APPROVED",
      dueDate: { not: null, lt: todayDate },
    },
    data: {
      status: "OVERDUE",
    },
  });

  await tx.vendorBill.updateMany({
    where: {
      orgId,
      archivedAt: null,
      status: "OVERDUE",
      OR: [
        { dueDate: null },
        { dueDate: { gte: todayDate } },
        { remainingAmount: { lte: MONEY_TOLERANCE } },
      ],
    },
    data: {
      status: "APPROVED",
    },
  });
}

export async function refreshVendorBillOverdueStates(orgId: string) {
  return db.$transaction((tx) => refreshVendorBillOverdueStatesTx(tx, orgId));
}

async function createVendorBillPaymentTx(
  tx: TxClient,
  input: CreateVendorBillPaymentInput,
) {
  const bill = await tx.vendorBill.findFirst({
    where: {
      id: input.vendorBillId,
      orgId: input.orgId,
      archivedAt: null,
    },
    select: {
      id: true,
      billNumber: true,
      totalAmount: true,
      amountPaid: true,
      remainingAmount: true,
      dueDate: true,
      status: true,
    },
  });

  if (!bill) {
    throw new Error("Vendor bill not found.");
  }

  if (bill.status === "DRAFT" || bill.status === "PENDING_APPROVAL" || bill.status === "CANCELLED") {
    throw new Error("Payments can only be recorded for approved vendor bills.");
  }

  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const billTotalAmount = toAccountingNumber(bill.totalAmount);
  const billAmountPaid = toAccountingNumber(bill.amountPaid);
  const billRemainingAmount = toAccountingNumber(bill.remainingAmount);

  if (amount > billRemainingAmount + MONEY_TOLERANCE) {
    throw new Error("Payment amount exceeds the remaining vendor bill balance.");
  }

  const payment = await tx.vendorBillPayment.create({
    data: {
      orgId: input.orgId,
      vendorBillId: bill.id,
      paymentRunId: input.paymentRunId ?? undefined,
      amount,
      paidAt: input.paidAt ?? new Date(),
      method: cleanText(input.method),
      note: cleanText(input.note),
      source: cleanText(input.source) ?? "admin_manual",
      status: "SETTLED",
      recordedByUserId: input.actorId,
    },
  });

  await postVendorBillPaymentTx(tx, {
    orgId: input.orgId,
    vendorBillPaymentId: payment.id,
    actorId: input.actorId,
  });

  const nextAmountPaid = roundMoney(billAmountPaid + amount);
  const nextRemainingAmount = roundMoney(Math.max(0, billTotalAmount - nextAmountPaid));

  await tx.vendorBill.update({
    where: { id: bill.id },
    data: {
      amountPaid: nextAmountPaid,
      remainingAmount: nextRemainingAmount,
      status: deriveVendorBillLifecycleStatus({
        totalAmount: billTotalAmount,
        amountPaid: nextAmountPaid,
        dueDate: bill.dueDate ? formatIsoDate(bill.dueDate) : null,
      }),
    },
  });

  await tx.auditLog.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "books.vendor_bill.payment_recorded",
      entityType: "vendor_bill_payment",
      entityId: payment.id,
      metadata: {
        vendorBillId: bill.id,
        billNumber: bill.billNumber,
        amount,
        paymentRunId: input.paymentRunId ?? null,
      },
    },
  });

  return payment;
}

export async function createVendorBill(input: SaveVendorBillInput) {
  await ensureBooksSetup(input.orgId);

  const normalizedLines = normalizeVendorBillLines(input.lines);
  const status = input.status ?? "DRAFT";

  const bill = await db.$transaction(async (tx) => {
    const billNumber = await nextDocumentNumberTx(tx, input.orgId, "vendorBill");
    const subtotalAmount = roundMoney(
      normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0),
    );
    const taxTotals = await deriveVendorBillTaxTotalsTx(
      tx,
      input.orgId,
      input.vendorId,
      normalizedLines,
    );
    const totalAmount = roundMoney(subtotalAmount + taxTotals.taxAmount);
    const lifecycleStatus =
      status === "APPROVED"
        ? deriveVendorBillLifecycleStatus({
            totalAmount,
            amountPaid: 0,
            dueDate: input.dueDate,
          })
        : status;

    const created = await tx.vendorBill.create({
      data: {
        orgId: input.orgId,
        vendorId: input.vendorId ?? undefined,
        expenseAccountId: input.expenseAccountId ?? undefined,
        billNumber,
        billDate: input.billDate,
        dueDate: input.dueDate ?? undefined,
        status: lifecycleStatus,
        formData: input.formData ?? {},
        subtotalAmount,
        taxAmount: taxTotals.taxAmount,
        totalAmount,
        amountPaid: 0,
        remainingAmount: totalAmount,
        currency: cleanText(input.currency) ?? "INR",
        gstTotalCgst: taxTotals.gstTotalCgst,
        gstTotalSgst: taxTotals.gstTotalSgst,
        gstTotalIgst: taxTotals.gstTotalIgst,
        gstTotalCess: taxTotals.gstTotalCess,
        notes: cleanText(input.notes),
        lines: {
          create: normalizedLines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineTotal: line.lineTotal,
            sortOrder: line.sortOrder,
          })),
        },
      },
      include: { lines: true },
    });

    if (lifecycleStatus === "APPROVED" || lifecycleStatus === "OVERDUE") {
      await postVendorBillTx(tx, {
        orgId: input.orgId,
        vendorBillId: created.id,
        actorId: input.actorId,
      });
    }

    await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: "books.vendor_bill.created",
        entityType: "vendor_bill",
        entityId: created.id,
        metadata: { billNumber, status: lifecycleStatus, totalAmount },
      },
    });

    return created;
  });

  // Phase 17.4: Fire trigger AFTER transaction commits
  await fireWorkflowTrigger({
    triggerType: "vendor_bill.submitted",
    orgId: input.orgId,
    sourceModule: "books",
    sourceEntityType: "vendor_bill",
    sourceEntityId: bill.id,
    actorId: input.actorId,
    payload: {
      billNumber: bill.billNumber,
      totalAmount: roundMoney(toAccountingNumber(bill.totalAmount)),
      vendorId: bill.vendorId,
    },
  });

  return bill;
}

export async function updateVendorBill(
  orgId: string,
  vendorBillId: string,
  input: Partial<Omit<SaveVendorBillInput, "orgId">>,
) {
  await ensureBooksSetup(orgId);
  await refreshVendorBillOverdueStates(orgId);

  return db.$transaction(async (tx) => {
    const existing = await tx.vendorBill.findFirst({
      where: {
        id: vendorBillId,
        orgId,
        archivedAt: null,
      },
      select: {
        id: true,
        vendorId: true,
        totalAmount: true,
        amountPaid: true,
        dueDate: true,
        status: true,
        accountingStatus: true,
      },
    });

    if (!existing) {
      throw new Error("Vendor bill not found.");
    }

    if (existing.accountingStatus === "POSTED") {
      throw new Error("Posted vendor bills cannot be edited. Reopen or reverse the accounting entry first.");
    }

    const normalizedLines = input.lines ? normalizeVendorBillLines(input.lines) : null;
    const subtotalAmount = normalizedLines
      ? roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0))
      : undefined;
    const taxTotals = normalizedLines
      ? await deriveVendorBillTaxTotalsTx(tx, orgId, input.vendorId ?? existing.vendorId, normalizedLines)
      : null;
    const totalAmount = subtotalAmount !== undefined && taxTotals
      ? roundMoney(subtotalAmount + taxTotals.taxAmount)
      : undefined;
    const requestedStatus = input.status ?? existing.status;
    const existingAmountPaid = toAccountingNumber(existing.amountPaid);
    const existingTotalAmount = toAccountingNumber(existing.totalAmount);
    const nextAmountPaid =
      totalAmount === undefined ? existingAmountPaid : Math.min(existingAmountPaid, totalAmount);
    const nextRemainingAmount =
      totalAmount === undefined ? undefined : roundMoney(Math.max(0, totalAmount - nextAmountPaid));
    const resolvedTotalAmount = totalAmount ?? existingTotalAmount;
    const resolvedDueDate = input.dueDate ?? (existing.dueDate ? formatIsoDate(existing.dueDate) : null);
    const nextStatus =
      requestedStatus === "APPROVED" ||
      requestedStatus === "OVERDUE" ||
      requestedStatus === "PARTIALLY_PAID" ||
      requestedStatus === "PAID"
        ? deriveVendorBillLifecycleStatus({
            totalAmount: resolvedTotalAmount,
            amountPaid: nextAmountPaid,
            dueDate: resolvedDueDate,
          })
        : requestedStatus;

    await tx.vendorBill.update({
      where: { id: vendorBillId },
      data: {
        vendorId: input.vendorId ?? undefined,
        expenseAccountId: input.expenseAccountId ?? undefined,
        billDate: input.billDate,
        dueDate: input.dueDate ?? undefined,
        status: nextStatus,
        currency: input.currency ? cleanText(input.currency) ?? "INR" : undefined,
        notes: input.notes !== undefined ? cleanText(input.notes) : undefined,
        formData: input.formData ?? undefined,
        ...(subtotalAmount !== undefined ? { subtotalAmount } : {}),
        ...(taxTotals
          ? {
              taxAmount: taxTotals.taxAmount,
              gstTotalCgst: taxTotals.gstTotalCgst,
              gstTotalSgst: taxTotals.gstTotalSgst,
              gstTotalIgst: taxTotals.gstTotalIgst,
              gstTotalCess: taxTotals.gstTotalCess,
            }
          : {}),
        ...(totalAmount !== undefined
          ? {
              totalAmount,
              amountPaid: nextAmountPaid,
              remainingAmount: nextRemainingAmount,
            }
          : {}),
      },
    });

    if (normalizedLines) {
      await tx.vendorBillLine.deleteMany({ where: { vendorBillId } });
      await tx.vendorBillLine.createMany({
        data: normalizedLines.map((line) => ({
          vendorBillId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
          sortOrder: line.sortOrder,
        })),
      });
    }

    if (nextStatus === "APPROVED" || nextStatus === "OVERDUE") {
      await postVendorBillTx(tx, {
        orgId,
        vendorBillId,
        actorId: input.actorId,
      });
    }

    return tx.vendorBill.findUniqueOrThrow({
      where: { id: vendorBillId },
      include: {
        vendor: true,
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { paidAt: "desc" } },
      },
    });
  });
}

export async function archiveVendorBill(orgId: string, vendorBillId: string) {
  const bill = await db.vendorBill.findFirst({
    where: {
      id: vendorBillId,
      orgId,
      archivedAt: null,
    },
    select: {
      id: true,
      accountingStatus: true,
    },
  });

  if (!bill) {
    throw new Error("Vendor bill not found.");
  }

  if (bill.accountingStatus === "POSTED") {
    throw new Error("Posted vendor bills cannot be archived.");
  }

  return db.vendorBill.update({
    where: { id: vendorBillId },
    data: { archivedAt: new Date() },
  });
}

export async function getVendorBill(orgId: string, vendorBillId: string) {
  await ensureBooksSetup(orgId);
  await refreshVendorBillOverdueStates(orgId);

  const bill = await db.vendorBill.findFirst({
    where: {
      id: vendorBillId,
      orgId,
      archivedAt: null,
    },
    include: {
      vendor: true,
      expenseAccount: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      lines: {
        orderBy: { sortOrder: "asc" },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        include: {
          paymentRun: {
            select: {
              id: true,
              runNumber: true,
              status: true,
            },
          },
        },
      },
      approvalRequests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!bill) {
    return null;
  }

  return {
    ...bill,
    billDate: formatIsoDate(bill.billDate),
    dueDate: bill.dueDate ? formatIsoDate(bill.dueDate) : null,
    subtotalAmount: roundMoney(bill.subtotalAmount),
    taxAmount: roundMoney(bill.taxAmount),
    totalAmount: roundMoney(bill.totalAmount),
    amountPaid: roundMoney(bill.amountPaid),
    remainingAmount: roundMoney(bill.remainingAmount),
    gstTotalCgst: roundMoney(bill.gstTotalCgst),
    gstTotalSgst: roundMoney(bill.gstTotalSgst),
    gstTotalIgst: roundMoney(bill.gstTotalIgst),
    gstTotalCess: roundMoney(bill.gstTotalCess),
    payments: bill.payments.map((payment) => ({
      ...payment,
      amount: roundMoney(payment.amount),
    })),
  };
}

export async function listVendorBills(
  orgId: string,
  params: {
    status?: VendorBillStatus;
    vendorId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  await ensureBooksSetup(orgId);
  await refreshVendorBillOverdueStates(orgId);

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.VendorBillWhereInput = {
    orgId,
    archivedAt: null,
    ...(params.status ? { status: params.status } : {}),
    ...(params.vendorId ? { vendorId: params.vendorId } : {}),
    ...(params.search
      ? {
          OR: [
            { billNumber: { contains: params.search, mode: "insensitive" } },
            { vendor: { name: { contains: params.search, mode: "insensitive" } } },
            { notes: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [bills, total] = await Promise.all([
    db.vendorBill.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
        approvalRequests: {
          where: { status: "PENDING" },
          select: { id: true },
        },
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.vendorBill.count({ where }),
  ]);

  return {
    bills: bills.map((bill) => ({
      ...bill,
      billDate: formatIsoDate(bill.billDate),
      dueDate: bill.dueDate ? formatIsoDate(bill.dueDate) : null,
      subtotalAmount: roundMoney(bill.subtotalAmount),
      taxAmount: roundMoney(bill.taxAmount),
      totalAmount: roundMoney(bill.totalAmount),
      amountPaid: roundMoney(bill.amountPaid),
      remainingAmount: roundMoney(bill.remainingAmount),
      gstTotalCgst: roundMoney(bill.gstTotalCgst),
      gstTotalSgst: roundMoney(bill.gstTotalSgst),
      gstTotalIgst: roundMoney(bill.gstTotalIgst),
      gstTotalCess: roundMoney(bill.gstTotalCess),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createVendorBillPayment(input: CreateVendorBillPaymentInput) {
  await ensureBooksSetup(input.orgId);
  return db.$transaction((tx) => createVendorBillPaymentTx(tx, input));
}

export async function listVendorBillPayments(
  orgId: string,
  params: {
    vendorBillId?: string;
    paymentRunId?: string;
  } = {},
) {
  await ensureBooksSetup(orgId);

  return db.vendorBillPayment.findMany({
    where: {
      orgId,
      ...(params.vendorBillId ? { vendorBillId: params.vendorBillId } : {}),
      ...(params.paymentRunId ? { paymentRunId: params.paymentRunId } : {}),
    },
    include: {
      vendorBill: {
        select: {
          id: true,
          billNumber: true,
          vendor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      paymentRun: {
        select: {
          id: true,
          runNumber: true,
          status: true,
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });
}

export async function createPaymentRun(input: CreatePaymentRunInput) {
  await ensureBooksSetup(input.orgId);
  await refreshVendorBillOverdueStates(input.orgId);

  if (input.items.length === 0) {
    throw new Error("At least one vendor bill is required to create a payment run.");
  }

  return db.$transaction(async (tx) => {
    const billIds = input.items.map((item) => item.vendorBillId);
    const uniqueBillIds = new Set(billIds);

    if (uniqueBillIds.size !== billIds.length) {
      throw new Error("Each vendor bill can only appear once in a payment run.");
    }

    const bills = await tx.vendorBill.findMany({
      where: {
        id: { in: billIds },
        orgId: input.orgId,
        archivedAt: null,
      },
      select: {
        id: true,
        billNumber: true,
        remainingAmount: true,
        status: true,
      },
    });

    if (bills.length !== billIds.length) {
      throw new Error("One or more vendor bills could not be found.");
    }

    const billById = new Map(bills.map((bill) => [bill.id, bill]));
    const runNumber = buildPaymentRunNumber();
    const normalizedItems = input.items.map((item) => {
      const bill = billById.get(item.vendorBillId);
      if (!bill) {
        throw new Error("Vendor bill not found.");
      }
      if (bill.status === "DRAFT" || bill.status === "PENDING_APPROVAL" || bill.status === "CANCELLED") {
        throw new Error(`Vendor bill ${bill.billNumber} is not ready for payment.`);
      }
      const amount = roundMoney(item.amount);
      if (amount <= 0) {
        throw new Error(`Payment amount for ${bill.billNumber} must be greater than zero.`);
      }
      if (amount > toAccountingNumber(bill.remainingAmount) + MONEY_TOLERANCE) {
        throw new Error(`Payment amount exceeds the remaining balance for ${bill.billNumber}.`);
      }
      return {
        vendorBillId: bill.id,
        proposedAmount: amount,
      };
    });

    const totalAmount = roundMoney(
      normalizedItems.reduce((sum, item) => sum + item.proposedAmount, 0),
    );

    const run = await tx.paymentRun.create({
      data: {
        orgId: input.orgId,
        runNumber,
        scheduledDate: input.scheduledDate,
        totalAmount,
        notes: cleanText(input.notes),
        requestedByUserId: input.actorId,
        items: {
          create: normalizedItems.map((item) => ({
            vendorBillId: item.vendorBillId,
            proposedAmount: item.proposedAmount,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: "books.payment_run.created",
        entityType: "payment_run",
        entityId: run.id,
        metadata: {
          runNumber,
          totalAmount,
          itemCount: normalizedItems.length,
        },
      },
    });

    return run;
  });
}

export async function approvePaymentRun(
  orgId: string,
  paymentRunId: string,
  actorId: string,
) {
  await ensureBooksSetup(orgId);

  return db.$transaction((tx) => approvePaymentRunTx(tx, orgId, paymentRunId, actorId));
}

export async function approvePaymentRunTx(
  tx: TxClient,
  orgId: string,
  paymentRunId: string,
  actorId: string,
) {
  const run = await tx.paymentRun.findFirst({
    where: {
      id: paymentRunId,
      orgId,
    },
    select: {
      id: true,
      runNumber: true,
      status: true,
      requestedByUserId: true,
    },
  });

  if (!run) {
    throw new Error("Payment run not found.");
  }

  if (run.status !== "PENDING_APPROVAL") {
    throw new Error("Only payment runs awaiting approval can be approved.");
  }

  if (run.requestedByUserId && run.requestedByUserId === actorId) {
    throw new Error("You cannot approve a payment run that you requested.");
  }

  const updated = await tx.paymentRun.update({
    where: { id: paymentRunId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: actorId,
    },
  });

  await tx.auditLog.create({
    data: {
      orgId,
      actorId,
      action: "books.payment_run.approved",
      entityType: "payment_run",
      entityId: paymentRunId,
      metadata: {
        runNumber: run.runNumber,
      },
    },
  });

  return updated;
}

export async function executePaymentRun(input: {
  orgId: string;
  actorId: string;
  paymentRunId: string;
  paidAt?: Date;
  method?: string | null;
  note?: string | null;
}) {
  await ensureBooksSetup(input.orgId);

  try {
    const result = await db.$transaction(async (tx) => {
      const run = await tx.paymentRun.findFirst({
        where: {
          id: input.paymentRunId,
          orgId: input.orgId,
        },
        include: {
          items: {
            where: { status: { in: ["PENDING", "APPROVED"] } },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!run) {
        throw new Error("Payment run not found.");
      }

      if (run.status === "PENDING_APPROVAL") {
        throw new Error("This payment run is still awaiting approval.");
      }

      if (run.status === "DRAFT" || run.status === "REJECTED" || run.status === "FAILED") {
        throw new Error("Only approved payment runs can be executed.");
      }

      if (run.status === "COMPLETED") {
        throw new Error("This payment run has already been executed.");
      }

      if (run.status === "CANCELLED") {
        throw new Error("Cancelled payment runs cannot be executed.");
      }

      if (run.items.length === 0) {
        throw new Error("This payment run has no pending items to execute.");
      }

      if (run.requestedByUserId && run.requestedByUserId === input.actorId) {
        throw new Error("The requester must be different from the payment executor.");
      }

      if (run.approvedByUserId && run.approvedByUserId === input.actorId) {
        throw new Error("The approver must be different from the payment executor.");
      }

      await tx.paymentRun.update({
        where: { id: run.id },
        data: { status: "PROCESSING" },
      });

      for (const item of run.items) {
        const executionAmount = roundMoney(toAccountingNumber(item.approvedAmount ?? item.proposedAmount));
        const payment = await createVendorBillPaymentTx(tx, {
          orgId: input.orgId,
          actorId: input.actorId,
          vendorBillId: item.vendorBillId,
          amount: executionAmount,
          paidAt: input.paidAt,
          method: input.method,
          note: cleanText(input.note) ?? `Payment run ${run.runNumber}`,
          source: "payment_run",
          paymentRunId: run.id,
        });

        await tx.paymentRunItem.update({
          where: { id: item.id },
          data: {
            status: "PAID",
            approvedAmount: executionAmount,
            executedPaymentId: payment.id,
          },
        });
      }

      await tx.paymentRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          executedAt: input.paidAt ?? new Date(),
          executedByUserId: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: input.orgId,
          actorId: input.actorId,
          action: "books.payment_run.executed",
          entityType: "payment_run",
          entityId: run.id,
          metadata: {
            runNumber: run.runNumber,
            executedItemCount: run.items.length,
          },
        },
      });

      return tx.paymentRun.findUniqueOrThrow({
        where: { id: run.id },
        include: {
          items: {
            include: {
              vendorBill: {
                select: { id: true, billNumber: true },
              },
              executedPayment: true,
            },
            orderBy: { createdAt: "asc" },
          },
          approvalRequests: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    });

    return result;
  } catch (error) {
    // Phase 17.4: Hook payment run failure trigger (fires after transaction rolls back)
    await fireWorkflowTrigger({
      triggerType: "payment_run.failed",
      orgId: input.orgId,
      sourceModule: "books",
      sourceEntityType: "payment_run",
      sourceEntityId: input.paymentRunId,
      actorId: input.actorId,
      payload: {
        error: error instanceof Error ? error.message : "Unknown execution failure",
      },
    });
    throw error;
  }
}

export async function getPaymentRun(orgId: string, paymentRunId: string) {
  await ensureBooksSetup(orgId);

  const run = await db.paymentRun.findFirst({
    where: {
      id: paymentRunId,
      orgId,
    },
    include: {
      items: {
        include: {
          vendorBill: {
            select: {
              id: true,
              billNumber: true,
              dueDate: true,
              totalAmount: true,
              remainingAmount: true,
              vendor: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          executedPayment: true,
        },
        orderBy: { createdAt: "asc" },
      },
      approvalRequests: {
        orderBy: { createdAt: "desc" },
      },
      payments: {
        orderBy: { paidAt: "desc" },
      },
    },
  });

  if (!run) {
    return null;
  }

  return {
    ...run,
    totalAmount: roundMoney(run.totalAmount),
    items: run.items.map((item) => ({
      ...item,
      proposedAmount: roundMoney(item.proposedAmount),
      approvedAmount: item.approvedAmount === null ? null : roundMoney(item.approvedAmount),
      vendorBill: {
        ...item.vendorBill,
        dueDate: item.vendorBill.dueDate ? formatIsoDate(item.vendorBill.dueDate) : null,
        totalAmount: roundMoney(item.vendorBill.totalAmount),
        remainingAmount: roundMoney(item.vendorBill.remainingAmount),
      },
      executedPayment: item.executedPayment
        ? {
            ...item.executedPayment,
            amount: roundMoney(item.executedPayment.amount),
          }
        : null,
    })),
    payments: run.payments.map((payment) => ({
      ...payment,
      amount: roundMoney(payment.amount),
    })),
  };
}

export async function listPaymentRuns(
  orgId: string,
  params: {
    status?: PaymentRunStatus;
    page?: number;
    limit?: number;
  } = {},
) {
  await ensureBooksSetup(orgId);

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.PaymentRunWhereInput = {
    orgId,
    ...(params.status ? { status: params.status } : {}),
  };

  const [runs, total] = await Promise.all([
    db.paymentRun.findMany({
      where,
      include: {
        items: {
          include: {
            vendorBill: {
              select: {
                billNumber: true,
              },
            },
          },
        },
        approvalRequests: {
          where: { status: "PENDING" },
          select: { id: true },
        },
      },
      orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.paymentRun.count({ where }),
  ]);

  return {
    runs: runs.map((run) => ({
      ...run,
      totalAmount: roundMoney(run.totalAmount),
      items: run.items.map((item) => ({
        ...item,
        proposedAmount: roundMoney(item.proposedAmount),
        approvedAmount: item.approvedAmount === null ? null : roundMoney(item.approvedAmount),
      })),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Reject / Resubmit ────────────────────────────────────────────────────────

/**
 * Rejects a payment run that is awaiting approval.
 * Only PENDING_APPROVAL runs can be rejected. The run transitions to REJECTED
 * and the reason is recorded for auditability. The actor must be identified.
 */
export async function rejectPaymentRun(input: {
  orgId: string;
  paymentRunId: string;
  reason: string;
  actorId: string;
}) {
  await ensureBooksSetup(input.orgId);

  return db.$transaction(async (tx) => {
    const run = await tx.paymentRun.findFirst({
      where: { id: input.paymentRunId, orgId: input.orgId },
      select: { id: true, runNumber: true, status: true, requestedByUserId: true },
    });

    if (!run) {
      throw new Error("Payment run not found.");
    }

    if (run.status !== "PENDING_APPROVAL") {
      throw new Error("Only pending approval runs can be rejected");
    }

    if (run.requestedByUserId && run.requestedByUserId === input.actorId) {
      throw new Error("You cannot reject a payment run that you requested.");
    }

    const updated = await tx.paymentRun.update({
      where: { id: input.paymentRunId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedByUserId: input.actorId,
        rejectionReason: input.reason,
      },
    });

    await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: "books.payment_run.rejected",
        entityType: "payment_run",
        entityId: input.paymentRunId,
        metadata: {
          runNumber: run.runNumber,
          reason: input.reason,
        },
      },
    });

    return updated;
  });
}

/**
 * Resubmits a rejected payment run back to DRAFT so the submitter can revise
 * and re-request approval. Clears all rejection state. Only REJECTED runs can
 * be resubmitted.
 */
export async function resubmitPaymentRun(input: {
  orgId: string;
  paymentRunId: string;
  actorId: string;
}) {
  await ensureBooksSetup(input.orgId);

  return db.$transaction(async (tx) => {
    const run = await tx.paymentRun.findFirst({
      where: { id: input.paymentRunId, orgId: input.orgId },
      select: { id: true, runNumber: true, status: true, requestedByUserId: true },
    });

    if (!run) {
      throw new Error("Payment run not found.");
    }

    if (run.status !== "REJECTED") {
      throw new Error("Only rejected runs can be resubmitted");
    }

    if (run.requestedByUserId && run.requestedByUserId !== input.actorId) {
      throw new Error("Only the original requester can resubmit this payment run.");
    }

    const updated = await tx.paymentRun.update({
      where: { id: input.paymentRunId },
      data: {
        status: "DRAFT",
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: "books.payment_run.resubmitted",
        entityType: "payment_run",
        entityId: input.paymentRunId,
        metadata: {
          runNumber: run.runNumber,
        },
      },
    });

    return updated;
  });
}
