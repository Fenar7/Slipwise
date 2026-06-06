"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { generateCSV } from "@/lib/csv";

const PAGE_SIZE = 50;

export interface VoucherReportFilters {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  tagIds?: string[];
  page?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export interface VoucherReportRow {
  id: string;
  voucherNumber: string | null;
  type: string;
  voucherDate: string;
  vendorName: string;
  category: string;
  totalAmount: number;
  status: string;
  tags: string;
}

export async function getVoucherReport(filters: VoucherReportFilters) {
  const { orgId } = await requireOrgContext();
  const page = filters.page ?? 1;
  const skip = (page - 1) * PAGE_SIZE;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    archivedAt: null,
  };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.voucherDate = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.category) {
    where.lines = {
      some: {
        category: { contains: filters.category, mode: "insensitive" },
      },
    };
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tagAssignments = {
      some: { tagId: { in: filters.tagIds } },
    };
  }

  const orderBy: Record<string, string> = {};
  if (filters.sortKey) {
    const allowed = ["voucherNumber", "voucherDate", "totalAmount", "type", "status"];
    if (allowed.includes(filters.sortKey)) {
      orderBy[filters.sortKey] = filters.sortDir ?? "asc";
    }
  }
  if (!Object.keys(orderBy).length) {
    orderBy.createdAt = "desc";
  }

  const [vouchers, total, paymentAgg, receiptAgg] = await Promise.all([
    db.voucher.findMany({
      where: where,  
      skip,
      take: PAGE_SIZE,
      orderBy,
      include: {
        vendor: { select: { name: true } },
        lines: { select: { category: true } },
        tagAssignments: { include: { tag: { select: { id: true, name: true, slug: true, color: true, isArchived: true } } } },
      },
    }),
    db.voucher.count({ where: where }),  
    db.voucher.aggregate({
      where: { ...where, type: "payment" },  
      _sum: { totalAmount: true },
      _count: true,
    }),
    db.voucher.aggregate({
      where: { ...where, type: "receipt" },  
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const rows: VoucherReportRow[] = (vouchers).map((v) => {  
    const categories = (v.lines ?? [])
      .map((l: { category: string | null }) => l.category)
      .filter(Boolean);
    const uniqueCategories = [...new Set(categories)];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma include shape doesn't narrow tagAssignments type at call site
    const tagNames = ((v as any).tagAssignments ?? [])
      .map((a: { tag: { name: string } }) => a.tag.name)
      .sort();

    return {
      id: v.id,
      voucherNumber: v.voucherNumber,
      type: v.type,
      voucherDate: v.voucherDate,
      vendorName: v.vendor?.name ?? "—",
      category: uniqueCategories.join(", ") || "—",
      totalAmount: v.totalAmount,
      status: v.status,
      tags: tagNames.join(", ") || "—",
    };
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    summaryPayments: paymentAgg._sum.totalAmount ?? 0,
    summaryPaymentCount: paymentAgg._count ?? 0,
    summaryReceipts: receiptAgg._sum.totalAmount ?? 0,
    summaryReceiptCount: receiptAgg._count ?? 0,
  };
}

export async function exportVoucherReportCSV(
  filters: Omit<VoucherReportFilters, "page">
): Promise<string> {
  const allFilters = { ...filters, page: 1 } as VoucherReportFilters;
  const allRows: VoucherReportRow[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    allFilters.page = currentPage;
    const result = await getVoucherReport(allFilters);
    allRows.push(...result.rows);
    hasMore = currentPage * PAGE_SIZE < result.total;
    currentPage++;
  }

  return generateCSV(
    [
      "Voucher #",
      "Type",
      "Date",
      "Paid To / Received From",
      "Category",
      "Total Amount",
      "Status",
      "Tags",
    ],
    allRows.map((r) => [
      r.voucherNumber ?? "Draft",
      r.type,
      r.voucherDate,
      r.vendorName,
      r.category,
      r.totalAmount.toFixed(2),
      r.status,
      r.tags,
    ])
  );
}
