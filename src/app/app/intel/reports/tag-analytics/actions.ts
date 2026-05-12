"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

export type AnalyticsMode = "revenue" | "expense" | "combined";

export interface TagAnalyticsParams {
  mode: AnalyticsMode;
  dateFrom?: string;
  dateTo?: string;
}

export interface TagSummary {
  tagId: string;
  tagName: string;
  tagSlug: string;
  tagColor: string | null;
  invoiceTotal: number;
  invoiceCount: number;
  voucherTotal: number;
  voucherCount: number;
  activityCount: number;
  lastActivityDate: string | null;
}

export interface MonthlyTrendPoint {
  month: string;
  invoiceTotal: number;
  voucherTotal: number;
  combinedTotal: number;
}

export interface TagAnalyticsSummary {
  totalInvoiceValue: number;
  totalInvoiceCount: number;
  totalVoucherValue: number;
  totalVoucherCount: number;
  totalDocumentCount: number;
}

export interface TagAnalyticsResponse {
  topTags: TagSummary[];
  monthlyTrend: MonthlyTrendPoint[];
  summary: TagAnalyticsSummary;
  mode: AnalyticsMode;
  dateFrom: string;
  dateTo: string;
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildInvoiceWhere(
  orgId: string,
  dateFrom?: string,
  dateTo?: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    archivedAt: null,
    tagAssignments: { some: {} },
  };
  if (dateFrom || dateTo) {
    where.invoiceDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }
  return where;
}

function buildVoucherWhere(
  orgId: string,
  dateFrom?: string,
  dateTo?: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    archivedAt: null,
    tagAssignments: { some: {} },
  };
  if (dateFrom || dateTo) {
    where.voucherDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }
  return where;
}

export async function getTagAnalytics(
  params: TagAnalyticsParams
): Promise<TagAnalyticsResponse> {
  const { orgId } = await requireOrgContext();
  const { mode, dateFrom, dateTo } = params;

  const includeRevenue = mode === "revenue" || mode === "combined";
  const includeExpense = mode === "expense" || mode === "combined";

  const invoiceWhere = buildInvoiceWhere(orgId, dateFrom, dateTo);
  const voucherWhere = buildVoucherWhere(orgId, dateFrom, dateTo);

  // ── Overall summary via lightweight aggregates (no row materialization) ──
  const [invoiceAgg, voucherAgg] = await Promise.all([
    includeRevenue
      ? db.invoice.aggregate({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: invoiceWhere as any,
          _sum: { totalAmount: true },
          _count: true,
        })
      : null,
    includeExpense
      ? db.voucher.aggregate({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: voucherWhere as any,
          _sum: { totalAmount: true },
          _count: true,
        })
      : null,
  ]);

  const summary: TagAnalyticsSummary = {
    totalInvoiceValue: Number(invoiceAgg?._sum.totalAmount ?? 0),
    totalInvoiceCount: invoiceAgg?._count ?? 0,
    totalVoucherValue: Number(voucherAgg?._sum.totalAmount ?? 0),
    totalVoucherCount: voucherAgg?._count ?? 0,
    totalDocumentCount:
      (invoiceAgg?._count ?? 0) + (voucherAgg?._count ?? 0),
  };

  // ── Load tagged documents for leaderboard + monthly trend ──
  const [
    taggedInvoices,
    taggedVouchers,
  ] = await Promise.all([
    includeRevenue
      ? db.invoice.findMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: invoiceWhere as any,
          select: {
            id: true,
            totalAmount: true,
            invoiceDate: true,
            tagAssignments: {
              select: {
                tagId: true,
                tag: { select: { id: true, name: true, slug: true, color: true } },
              },
            },
          },
        })
      : [],
    includeExpense
      ? db.voucher.findMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: voucherWhere as any,
          select: {
            id: true,
            totalAmount: true,
            voucherDate: true,
            tagAssignments: {
              select: {
                tagId: true,
                tag: { select: { id: true, name: true, slug: true, color: true } },
              },
            },
          },
        })
      : [],
  ]);

  // ── Build tag map + monthly trend in a single pass per doc type ──
  const tagMap = new Map<string, TagSummary>();
  const monthlyMap = new Map<string, MonthlyTrendPoint>();

  function ensureTag(tagId: string, tagName: string, tagSlug: string, tagColor: string | null) {
    if (!tagMap.has(tagId)) {
      tagMap.set(tagId, {
        tagId,
        tagName,
        tagSlug,
        tagColor,
        invoiceTotal: 0,
        invoiceCount: 0,
        voucherTotal: 0,
        voucherCount: 0,
        activityCount: 0,
        lastActivityDate: null,
      });
    }
    return tagMap.get(tagId)!;
  }

  function ensureMonth(month: string) {
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, invoiceTotal: 0, voucherTotal: 0, combinedTotal: 0 });
    }
    return monthlyMap.get(month)!;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of taggedInvoices as any[]) {
    const amount = Number(inv.totalAmount);
    const month = formatMonth(new Date(inv.invoiceDate));
    const mp = ensureMonth(month);
    mp.invoiceTotal += amount;
    mp.combinedTotal += amount;

    for (const a of inv.tagAssignments ?? []) {
      const entry = ensureTag(a.tag.id, a.tag.name, a.tag.slug, a.tag.color);
      entry.invoiceTotal += amount;
      entry.invoiceCount++;
      entry.activityCount++;
      if (inv.invoiceDate && (!entry.lastActivityDate || inv.invoiceDate > entry.lastActivityDate)) {
        entry.lastActivityDate = inv.invoiceDate;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of taggedVouchers as any[]) {
    const amount = Number(v.totalAmount);
    const month = formatMonth(new Date(v.voucherDate));
    const mp = ensureMonth(month);
    mp.voucherTotal += amount;
    mp.combinedTotal += amount;

    for (const a of v.tagAssignments ?? []) {
      const entry = ensureTag(a.tag.id, a.tag.name, a.tag.slug, a.tag.color);
      entry.voucherTotal += amount;
      entry.voucherCount++;
      entry.activityCount++;
      if (v.voucherDate && (!entry.lastActivityDate || v.voucherDate > entry.lastActivityDate)) {
        entry.lastActivityDate = v.voucherDate;
      }
    }
  }

  // ── Mode-aware leaderboard sorting ──
  const sortKey = (a: TagSummary) => {
    if (mode === "revenue") return a.invoiceTotal;
    if (mode === "expense") return a.voucherTotal;
    return a.invoiceTotal + a.voucherTotal;
  };

  const topTags = Array.from(tagMap.values())
    .sort((a, b) => sortKey(b) - sortKey(a))
    .slice(0, 20);

  const monthlyTrend = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    topTags,
    monthlyTrend,
    summary,
    mode,
    dateFrom: dateFrom ?? "",
    dateTo: dateTo ?? "",
  };
}
