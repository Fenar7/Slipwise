"use server";

import { db } from "@/lib/db";
import {
  computeMrrArr,
  computeBurnRate,
  computeRunway,
  computeDso,
  computeDpo,
  computeCollectionRate,
  computeGrossMargin,
  computeWorkingCapital,
  mrrToArr,
  type KpiResult,
  type RecurringRevenueData,
  type ExpenseData,
  type CashData,
  type ReceivablesData,
  type PayablesData,
  type CollectionData,
  type MarginData,
  type WorkingCapitalData,
} from "./kpi";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

export interface ExecutiveSnapshot {
  kpis: KpiResult[];
  arr: number;
  generatedAt: Date;
  period: string;
}

const SPARKLINE_MONTHS = 6;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function monthsAgo(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - n);
  return r;
}

function daysInRange(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeysEndingAt(d: Date, count: number = SPARKLINE_MONTHS): string[] {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    keys.push(monthKey(startOfMonth(monthsAgo(d, offset))));
  }
  return keys;
}

function buildMonthBuckets(keys: string[]): Map<string, number> {
  return new Map(keys.map((key) => [key, 0]));
}

function addBucketAmount(
  buckets: Map<string, number>,
  bucketKey: string,
  amount: number
) {
  buckets.set(bucketKey, round2((buckets.get(bucketKey) ?? 0) + amount));
}

function periodBounds(
  period: "MTD" | "QTD" | "YTD",
  now: Date
): [Date, Date, Date, Date] {
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (period) {
    case "MTD":
      start = startOfMonth(now);
      prevStart = monthsAgo(start, 1);
      prevEnd = new Date(start.getTime() - 1);
      break;
    case "QTD":
      start = startOfQuarter(now);
      prevStart = monthsAgo(start, 3);
      prevEnd = new Date(start.getTime() - 1);
      break;
    case "YTD":
      start = startOfYear(now);
      prevStart = new Date(start.getFullYear() - 1, 0, 1);
      prevEnd = new Date(start.getTime() - 1);
      break;
  }

  return [start, now, prevStart, prevEnd];
}

async function getBankBalanceAt(orgId: string, asOf: Date): Promise<number> {
  const accounts = await db.bankAccount.findMany({
    where: { orgId },
    select: { id: true },
  });

  const balances = await Promise.all(
    accounts.map((account) =>
      db.bankTransaction.findFirst({
        where: {
          bankAccountId: account.id,
          txnDate: { lte: asOf },
        },
        orderBy: { txnDate: "desc" },
        select: { runningBalance: true },
      })
    )
  );

  return balances.reduce(
    (sum, balance) => sum + toAccountingNumber(balance?.runningBalance ?? 0),
    0
  );
}

async function queryRecurringRevenue(
  orgId: string,
  periodEnd: Date
): Promise<RecurringRevenueData> {
  const sparklineStart = startOfMonth(monthsAgo(periodEnd, SPARKLINE_MONTHS - 1));
  const sparklineMonths = monthKeysEndingAt(periodEnd);
  const [rules, generatedInvoices] = await Promise.all([
    db.recurringInvoiceRule.findMany({
      where: { orgId, status: "ACTIVE" },
      include: { baseInvoice: { select: { totalAmount: true } } },
    }),
    db.invoice.findMany({
      where: {
        organizationId: orgId,
        generatedFromRuleId: { not: null },
        invoiceDate: { gte: sparklineStart },
        status: { not: "CANCELLED" },
      },
      select: { invoiceDate: true, totalAmount: true },
    }),
  ]);

  const currentMrr = round2(
    rules.reduce((sum, rule) => sum + toAccountingNumber(rule.baseInvoice?.totalAmount ?? 0), 0)
  );
  const activeCount = rules.length;
  const avgRecurringAmount = activeCount > 0 ? round2(currentMrr / activeCount) : 0;
  const buckets = buildMonthBuckets(sparklineMonths);

  for (const invoice of generatedInvoices) {
    addBucketAmount(
      buckets,
      formatIsoDate(invoice.invoiceDate).slice(0, 7),
      toAccountingNumber(invoice.totalAmount ?? 0),
    );
  }

  const monthlyMrr = sparklineMonths.map((bucket) => round2(buckets.get(bucket) ?? 0));

  return {
    activeRecurringRules: activeCount,
    avgRecurringAmount,
    previousMrr: monthlyMrr.at(-2) ?? currentMrr,
    monthlyMrr,
  };
}

async function queryExpenses(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date
): Promise<ExpenseData> {
  const sparklineStart = startOfMonth(monthsAgo(periodEnd, SPARKLINE_MONTHS - 1));
  const sparklineMonths = monthKeysEndingAt(periodEnd);
  const [
    currentBills,
    prevBills,
    currentPayroll,
    prevPayroll,
    monthlyBillPayments,
    monthlyPayrollRuns,
  ] = await Promise.all([
    db.vendorBillPayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
    db.vendorBillPayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { amount: true },
    }),
    db.payrollRun.aggregate({
      where: {
        orgId,
        status: "FINALIZED",
        finalizedAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { totalNetPay: true },
    }),
    db.payrollRun.aggregate({
      where: {
        orgId,
        status: "FINALIZED",
        finalizedAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { totalNetPay: true },
    }),
    db.vendorBillPayment.findMany({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: sparklineStart, lte: periodEnd },
      },
      select: { amount: true, paidAt: true },
    }),
    db.payrollRun.findMany({
      where: {
        orgId,
        status: "FINALIZED",
        finalizedAt: { gte: sparklineStart, lte: periodEnd },
      },
      select: { totalNetPay: true, period: true },
    }),
  ]);

  const currentOutflow =
    toAccountingNumber(currentBills._sum.amount ?? 0) +
    Number(currentPayroll._sum.totalNetPay ?? 0);
  const previousOutflow =
    toAccountingNumber(prevBills._sum.amount ?? 0) +
    Number(prevPayroll._sum.totalNetPay ?? 0);
  const buckets = buildMonthBuckets(sparklineMonths);

  for (const payment of monthlyBillPayments) {
    if (payment.paidAt) {
      addBucketAmount(buckets, monthKey(payment.paidAt), toAccountingNumber(payment.amount ?? 0));
    }
  }

  for (const run of monthlyPayrollRuns) {
    addBucketAmount(buckets, run.period, Number(run.totalNetPay ?? 0));
  }

  return {
    currentOutflow,
    previousOutflow,
    monthlyOutflow: sparklineMonths.map((bucket) => round2(buckets.get(bucket) ?? 0)),
  };
}

async function queryCash(orgId: string): Promise<CashData> {
  const currentBalance = await getBankBalanceAt(orgId, new Date());
  return { currentBalance, monthlyBurn: 0 };
}

async function queryReceivables(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date
): Promise<ReceivablesData> {
  const [receivable, revenue, prevRevenue, prevReceivable] = await Promise.all([
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ["ISSUED", "OVERDUE"] },
      },
      _sum: { remainingAmount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        issuedAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { totalAmount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        issuedAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { totalAmount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ["ISSUED", "OVERDUE"] },
        issuedAt: { lte: prevEnd },
      },
      _sum: { remainingAmount: true },
    }),
  ]);

  const days = daysInRange(periodStart, periodEnd);
  const prevDays = daysInRange(prevStart, prevEnd);
  const totalRevenue = toAccountingNumber(revenue._sum.totalAmount ?? 0);
  const previousRevenue = toAccountingNumber(prevRevenue._sum.totalAmount ?? 0);
  const totalReceivable = toAccountingNumber(receivable._sum.remainingAmount ?? 0);
  const previousReceivable = toAccountingNumber(prevReceivable._sum.remainingAmount ?? 0);
  const previousDso =
    previousRevenue > 0 ? (previousReceivable / previousRevenue) * prevDays : 0;
  const currentDso =
    totalRevenue > 0 ? (totalReceivable / totalRevenue) * days : 0;

  return {
    totalReceivable,
    totalRevenue,
    daysInPeriod: days,
    previousDso,
    previousReceivable,
    monthlyDso: [round2(previousDso), round2(currentDso)],
  };
}

async function queryPayables(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date
): Promise<PayablesData> {
  const [payable, cost, prevCost, prevPayable] = await Promise.all([
    db.vendorBill.aggregate({
      where: {
        orgId,
        status: { in: ["APPROVED", "PARTIALLY_PAID"] },
      },
      _sum: { remainingAmount: true },
    }),
    db.vendorBillPayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
    db.vendorBillPayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { amount: true },
    }),
    db.vendorBill.aggregate({
      where: {
        orgId,
        status: { in: ["APPROVED", "PARTIALLY_PAID"] },
        billDate: { lte: prevEnd },
      },
      _sum: { remainingAmount: true },
    }),
  ]);

  const days = daysInRange(periodStart, periodEnd);
  const prevDays = daysInRange(prevStart, prevEnd);
  const totalPayable = toAccountingNumber(payable._sum.remainingAmount ?? 0);
  const totalCost = toAccountingNumber(cost._sum.amount ?? 0);
  const previousPayable = toAccountingNumber(prevPayable._sum.remainingAmount ?? 0);
  const previousCost = toAccountingNumber(prevCost._sum.amount ?? 0);
  const previousDpo =
    previousCost > 0 ? (previousPayable / previousCost) * prevDays : 0;
  const currentDpo =
    totalCost > 0 ? (totalPayable / totalCost) * days : 0;

  return {
    totalPayable,
    totalCost,
    daysInPeriod: days,
    previousDpo,
    previousPayable,
    monthlyDpo: [round2(previousDpo), round2(currentDpo)],
  };
}

async function queryCollections(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date
): Promise<CollectionData> {
  const sparklineStart = startOfMonth(monthsAgo(periodEnd, SPARKLINE_MONTHS - 1));
  const sparklineMonths = monthKeysEndingAt(periodEnd);
  const [
    collected,
    invoiced,
    prevCollected,
    prevInvoiced,
    monthlyCollections,
    monthlyInvoices,
  ] = await Promise.all([
    db.invoicePayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        issuedAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { totalAmount: true },
    }),
    db.invoicePayment.aggregate({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { amount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: orgId,
        issuedAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { totalAmount: true },
    }),
    db.invoicePayment.findMany({
      where: {
        orgId,
        status: "SETTLED",
        paidAt: { gte: sparklineStart, lte: periodEnd },
      },
      select: { amount: true, paidAt: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId: orgId,
        issuedAt: { gte: sparklineStart, lte: periodEnd },
      },
      select: { totalAmount: true, issuedAt: true },
    }),
  ]);

  const totalCollected = toAccountingNumber(collected._sum.amount ?? 0);
  const totalInvoiced = toAccountingNumber(invoiced._sum.totalAmount ?? 0);
  const previousCollected = toAccountingNumber(prevCollected._sum.amount ?? 0);
  const previousInvoiced = toAccountingNumber(prevInvoiced._sum.totalAmount ?? 0);
  const previousRate =
    previousInvoiced > 0 ? (previousCollected / previousInvoiced) * 100 : 0;
  const collectionsByMonth = buildMonthBuckets(sparklineMonths);
  const invoicesByMonth = buildMonthBuckets(sparklineMonths);

  for (const payment of monthlyCollections) {
    if (payment.paidAt) {
      addBucketAmount(
        collectionsByMonth,
        monthKey(payment.paidAt),
        toAccountingNumber(payment.amount ?? 0),
      );
    }
  }

  for (const invoice of monthlyInvoices) {
    if (invoice.issuedAt) {
      addBucketAmount(
        invoicesByMonth,
        monthKey(invoice.issuedAt),
        toAccountingNumber(invoice.totalAmount ?? 0),
      );
    }
  }

  return {
    totalCollected,
    totalInvoiced,
    previousRate,
    monthlyRates: sparklineMonths.map((bucket) => {
      const billed = invoicesByMonth.get(bucket) ?? 0;
      const collectedAmount = collectionsByMonth.get(bucket) ?? 0;
      return billed > 0 ? round2((collectedAmount / billed) * 100) : 0;
    }),
  };
}

async function queryMargins(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date
): Promise<MarginData> {
  const sparklineStart = startOfMonth(monthsAgo(periodEnd, SPARKLINE_MONTHS - 1));
  const sparklineMonths = monthKeysEndingAt(periodEnd);
  const [revenue, costs, prevRevenue, prevCosts, monthlyRevenue, monthlyCosts] =
    await Promise.all([
      db.invoice.aggregate({
        where: {
          organizationId: orgId,
          issuedAt: { gte: periodStart, lte: periodEnd },
        },
        _sum: { totalAmount: true },
      }),
      db.vendorBillPayment.aggregate({
        where: {
          orgId,
          status: "SETTLED",
          paidAt: { gte: periodStart, lte: periodEnd },
        },
        _sum: { amount: true },
      }),
      db.invoice.aggregate({
        where: {
          organizationId: orgId,
          issuedAt: { gte: prevStart, lte: prevEnd },
        },
        _sum: { totalAmount: true },
      }),
      db.vendorBillPayment.aggregate({
        where: {
          orgId,
          status: "SETTLED",
          paidAt: { gte: prevStart, lte: prevEnd },
        },
        _sum: { amount: true },
      }),
      db.invoice.findMany({
        where: {
          organizationId: orgId,
          issuedAt: { gte: sparklineStart, lte: periodEnd },
        },
        select: { totalAmount: true, issuedAt: true },
      }),
      db.vendorBillPayment.findMany({
        where: {
          orgId,
          status: "SETTLED",
          paidAt: { gte: sparklineStart, lte: periodEnd },
        },
        select: { amount: true, paidAt: true },
      }),
    ]);

  const totalRevenue = toAccountingNumber(revenue._sum.totalAmount ?? 0);
  const totalDirectCosts = toAccountingNumber(costs._sum.amount ?? 0);
  const previousRevenue = toAccountingNumber(prevRevenue._sum.totalAmount ?? 0);
  const previousCosts = toAccountingNumber(prevCosts._sum.amount ?? 0);
  const previousMargin =
    previousRevenue > 0
      ? ((previousRevenue - previousCosts) / previousRevenue) * 100
      : 0;
  const revenueByMonth = buildMonthBuckets(sparklineMonths);
  const costByMonth = buildMonthBuckets(sparklineMonths);

  for (const invoice of monthlyRevenue) {
    if (invoice.issuedAt) {
      addBucketAmount(
        revenueByMonth,
        monthKey(invoice.issuedAt),
        toAccountingNumber(invoice.totalAmount ?? 0),
      );
    }
  }

  for (const payment of monthlyCosts) {
    if (payment.paidAt) {
        addBucketAmount(costByMonth, monthKey(payment.paidAt), toAccountingNumber(payment.amount ?? 0));
    }
  }

  return {
    totalRevenue,
    totalDirectCosts,
    previousMargin,
    monthlyMargins: sparklineMonths.map((bucket) => {
      const monthRevenue = revenueByMonth.get(bucket) ?? 0;
      const monthCost = costByMonth.get(bucket) ?? 0;
      return monthRevenue > 0
        ? round2(((monthRevenue - monthCost) / monthRevenue) * 100)
        : 0;
    }),
  };
}

async function queryWorkingCapital(
  orgId: string,
  prevEnd: Date,
  cashBalance: number,
  receivables: number,
  payables: number,
  previousReceivables: number,
  previousPayables: number
): Promise<WorkingCapitalData> {
  const previousCashBalance = await getBankBalanceAt(orgId, prevEnd);
  const currentWorkingCapital = cashBalance + receivables - payables;
  const previousWorkingCapital =
    previousCashBalance + previousReceivables - previousPayables;

  return {
    currentAssets: cashBalance + receivables,
    currentLiabilities: payables,
    previousWorkingCapital: round2(previousWorkingCapital),
    monthlyWc: [round2(previousWorkingCapital), round2(currentWorkingCapital)],
  };
}

export async function computeExecutiveKpis(
  orgId: string,
  period: "MTD" | "QTD" | "YTD" = "MTD"
): Promise<ExecutiveSnapshot> {
  const now = new Date();
  const [periodStart, periodEnd, prevStart, prevEnd] = periodBounds(period, now);

  const [rrData, expData, cashData, recData, payData, colData, margData] =
    await Promise.all([
      queryRecurringRevenue(orgId, periodEnd),
      queryExpenses(orgId, periodStart, periodEnd, prevStart, prevEnd),
      queryCash(orgId),
      queryReceivables(orgId, periodStart, periodEnd, prevStart, prevEnd),
      queryPayables(orgId, periodStart, periodEnd, prevStart, prevEnd),
      queryCollections(orgId, periodStart, periodEnd, prevStart, prevEnd),
      queryMargins(orgId, periodStart, periodEnd, prevStart, prevEnd),
    ]);

  cashData.monthlyBurn = expData.currentOutflow;

  const mrrKpi = computeMrrArr(rrData);
  const burnKpi = computeBurnRate(expData);
  const runwayKpi = computeRunway(cashData);
  const dsoKpi = computeDso(recData);
  const dpoKpi = computeDpo(payData);
  const collectionKpi = computeCollectionRate(colData);
  const marginKpi = computeGrossMargin(margData);

  const wcData = await queryWorkingCapital(
    orgId,
    prevEnd,
    cashData.currentBalance,
    recData.totalReceivable,
    payData.totalPayable,
    recData.previousReceivable ?? 0,
    payData.previousPayable ?? 0
  );
  const wcKpi = computeWorkingCapital(wcData);

  const kpis = [
    mrrKpi,
    burnKpi,
    runwayKpi,
    dsoKpi,
    dpoKpi,
    collectionKpi,
    marginKpi,
    wcKpi,
  ];

  return {
    kpis,
    arr: mrrToArr(mrrKpi.currentValue),
    generatedAt: now,
    period,
  };
}
