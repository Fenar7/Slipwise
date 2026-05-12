"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { toAccountingNumber } from "@/lib/accounting/utils";

// ── Types ──────────────────────────────────────────────────────────────

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardKPIs {
  pay: {
    invoicesIssued: number;
    totalDue: number;
    overdue: number;
    paidThisMonth: number;
  };
  voucher: {
    voucherSpend: number;
    voucherCount: number;
    receiptTotal: number;
  };
  salary: {
    pendingTotal: number;
    released: number;
    headcount: number;
  };
}

export interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  paid: number;
}

export interface ActivityEntry {
  id: string;
  actorName: string;
  event: string;
  docType: string | null;
  createdAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseDateRange(preset: string): DateRange {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let from: Date;

  switch (preset) {
    case "7d":
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from = new Date(to);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case "this-month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last-month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = lm;
      to.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime());
      break;
    }
    case "this-quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), q, 1);
      break;
    }
    case "this-year":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { from, to };
}

// ── getDashboardKPIs ───────────────────────────────────────────────────

export async function getDashboardKPIs(
  preset: string = "this-month"
): Promise<ActionResult<DashboardKPIs>> {
  try {
    const { orgId } = await requireOrgContext();
    const { from, to } = parseDateRange(preset);

    const [
      invoicesIssued,
      totalDue,
      overdue,
      paidThisMonth,
      voucherSpend,
      voucherCount,
      receiptTotal,
      pendingTotal,
      released,
      headcount,
    ] = await Promise.all([
      // PAY — Invoices Issued
      db.invoice.count({
        where: {
          organizationId: orgId,
          status: { not: "DRAFT" },
          issuedAt: { gte: from, lte: to },
        },
      }),

      // PAY — Total Due
      db.invoice.aggregate({
        where: {
          organizationId: orgId,
          status: { in: ["ISSUED", "DUE", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        _sum: { totalAmount: true },
      }),

      // PAY — Overdue
      db.invoice.aggregate({
        where: {
          organizationId: orgId,
          status: "OVERDUE",
        },
        _sum: { totalAmount: true },
      }),

      // PAY — Paid This Month
      db.invoicePayment.aggregate({
        where: {
          orgId,
          paidAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),

      // VOUCHER — Spend
      db.voucher.aggregate({
        where: {
          organizationId: orgId,
          type: "payment",
          createdAt: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
      }),

      // VOUCHER — Count
      db.voucher.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: from, lte: to },
        },
      }),

      // VOUCHER — Receipt Total
      db.voucher.aggregate({
        where: {
          organizationId: orgId,
          type: "receipt",
          createdAt: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
      }),

      // SALARY — Pending Total
      db.salarySlip.aggregate({
        where: {
          organizationId: orgId,
          status: { in: ["draft", "pending"] },
        },
        _sum: { netPay: true },
      }),

      // SALARY — Released
      db.salarySlip.aggregate({
        where: {
          organizationId: orgId,
          status: "released",
          createdAt: { gte: from, lte: to },
        },
        _sum: { netPay: true },
      }),

      // SALARY — Headcount
      db.salarySlip.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: from, lte: to },
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      }),
    ]);

    return {
        success: true,
        data: {
          pay: {
            invoicesIssued,
            totalDue: toAccountingNumber(totalDue._sum.totalAmount ?? 0),
            overdue: toAccountingNumber(overdue._sum.totalAmount ?? 0),
            paidThisMonth: toAccountingNumber(paidThisMonth._sum.amount ?? 0),
          },
          voucher: {
            voucherSpend: toAccountingNumber(voucherSpend._sum.totalAmount ?? 0),
            voucherCount,
            receiptTotal: toAccountingNumber(receiptTotal._sum.totalAmount ?? 0),
          },
          salary: {
            pendingTotal: toAccountingNumber(pendingTotal._sum.netPay ?? 0),
            released: toAccountingNumber(released._sum.netPay ?? 0),
            headcount: headcount.length,
          },
        },
    };
  } catch (error) {
    console.error("[getDashboardKPIs]", error);
    return { success: false, error: "Failed to load dashboard KPIs." };
  }
}

// ── getRevenueTrendData ────────────────────────────────────────────────

export async function getRevenueTrendData(): Promise<
  ActionResult<RevenueTrendPoint[]>
> {
  try {
    const { orgId } = await requireOrgContext();

    const now = new Date();
    const months: RevenueTrendPoint[] = [];

    const promises: Promise<void>[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const idx = 11 - i;
      months.push({ month: label, invoiced: 0, paid: 0 });

      promises.push(
        Promise.all([
          db.invoice.aggregate({
            where: {
              organizationId: orgId,
              status: { not: "DRAFT" },
              issuedAt: { gte: start, lte: end },
            },
            _sum: { totalAmount: true },
          }),
          db.invoicePayment.aggregate({
            where: {
              orgId,
              paidAt: { gte: start, lte: end },
            },
            _sum: { amount: true },
          }),
        ]).then(([invoiced, paid]) => {
          months[idx].invoiced = toAccountingNumber(invoiced._sum.totalAmount ?? 0);
          months[idx].paid = toAccountingNumber(paid._sum.amount ?? 0);
        })
      );
    }

    await Promise.all(promises);

    return { success: true, data: months };
  } catch (error) {
    console.error("[getRevenueTrendData]", error);
    return { success: false, error: "Failed to load revenue trend." };
  }
}

// ── getRecentActivity ──────────────────────────────────────────────────

export async function getRecentActivity(): Promise<
  ActionResult<ActivityEntry[]>
> {
  try {
    const { orgId } = await requireOrgContext();

    const entries = await db.activityLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        actorName: true,
        event: true,
        docType: true,
        createdAt: true,
      },
    });

    return { success: true, data: entries };
  } catch (error) {
    console.error("[getRecentActivity]", error);
    return { success: false, error: "Failed to load recent activity." };
  }
}
