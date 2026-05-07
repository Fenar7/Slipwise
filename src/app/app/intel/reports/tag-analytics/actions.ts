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

export interface TagAnalyticsResponse {
  topTags: TagSummary[];
  monthlyTrend: MonthlyTrendPoint[];
  mode: AnalyticsMode;
  dateFrom: string;
  dateTo: string;
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildDateFilter(dateFrom?: string, dateTo?: string) {
  const filter: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    filter.gte = dateFrom;
    filter.lte = dateTo;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function getTagAnalytics(
  params: TagAnalyticsParams
): Promise<TagAnalyticsResponse> {
  const { orgId } = await requireOrgContext();
  const { mode, dateFrom, dateTo } = params;

  const invoiceDateFilter = buildDateFilter(dateFrom, dateTo);
  const voucherDateFilter = dateFrom || dateTo
    ? { voucherDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
    : {};

  const includeRevenue = mode === "revenue" || mode === "combined";
  const includeExpense = mode === "expense" || mode === "combined";

  const [
    taggedInvoices,
    taggedVouchers,
  ] = await Promise.all([
    includeRevenue
      ? db.invoice.findMany({
          where: {
            organizationId: orgId,
            archivedAt: null,
            ...(invoiceDateFilter ? { invoiceDate: invoiceDateFilter as Record<string, unknown> } : {}),
            tagAssignments: { some: {} },
          },
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
          where: {
            organizationId: orgId,
            archivedAt: null,
            ...voucherDateFilter,
            tagAssignments: { some: {} },
          },
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

  const tagMap = new Map<string, TagSummary>();

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of taggedInvoices as any[]) {
    for (const a of inv.tagAssignments ?? []) {
      const entry = ensureTag(a.tag.id, a.tag.name, a.tag.slug, a.tag.color);
      entry.invoiceTotal += Number(inv.totalAmount);
      entry.invoiceCount++;
      entry.activityCount++;
      if (inv.invoiceDate && (!entry.lastActivityDate || inv.invoiceDate > entry.lastActivityDate)) {
        entry.lastActivityDate = inv.invoiceDate;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of taggedVouchers as any[]) {
    for (const a of v.tagAssignments ?? []) {
      const entry = ensureTag(a.tag.id, a.tag.name, a.tag.slug, a.tag.color);
      entry.voucherTotal += Number(v.totalAmount);
      entry.voucherCount++;
      entry.activityCount++;
      if (v.voucherDate && (!entry.lastActivityDate || v.voucherDate > entry.lastActivityDate)) {
        entry.lastActivityDate = v.voucherDate;
      }
    }
  }

  const topTags = Array.from(tagMap.values())
    .sort((a, b) => {
      const aTotal = a.invoiceTotal + a.voucherTotal;
      const bTotal = b.invoiceTotal + b.voucherTotal;
      return bTotal - aTotal;
    })
    .slice(0, 20);

  // Monthly trend: bucket by month
  const monthlyMap = new Map<string, MonthlyTrendPoint>();

  function ensureMonth(month: string) {
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, invoiceTotal: 0, voucherTotal: 0, combinedTotal: 0 });
    }
    return monthlyMap.get(month)!;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of taggedInvoices as any[]) {
    const month = formatMonth(new Date(inv.invoiceDate));
    const point = ensureMonth(month);
    point.invoiceTotal += Number(inv.totalAmount);
    point.combinedTotal += Number(inv.totalAmount);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of taggedVouchers as any[]) {
    const month = formatMonth(new Date(v.voucherDate));
    const point = ensureMonth(month);
    point.voucherTotal += Number(v.totalAmount);
    point.combinedTotal += Number(v.totalAmount);
  }

  const monthlyTrend = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    topTags,
    monthlyTrend,
    mode,
    dateFrom: dateFrom ?? "",
    dateTo: dateTo ?? "",
  };
}
