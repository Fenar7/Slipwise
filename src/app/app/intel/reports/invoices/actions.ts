"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { generateCSV } from "@/lib/csv";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

const PAGE_SIZE = 50;

export interface InvoiceReportFilters {
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  amountMin?: number;
  amountMax?: number;
  tagIds?: string[];
  page?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export interface InvoiceReportRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string | null;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  tags: string;
}

export async function getInvoiceReport(filters: InvoiceReportFilters) {
  const { orgId } = await requireOrgContext();
  const page = filters.page ?? 1;
  const skip = (page - 1) * PAGE_SIZE;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    archivedAt: null,
  };

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.invoiceDate = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.amountMin != null || filters.amountMax != null) {
    where.totalAmount = {
      ...(filters.amountMin != null ? { gte: filters.amountMin } : {}),
      ...(filters.amountMax != null ? { lte: filters.amountMax } : {}),
    };
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tagAssignments = {
      some: { tagId: { in: filters.tagIds } },
    };
  }

  const orderBy: Record<string, string> = {};
  if (filters.sortKey) {
    const allowed = ["invoiceNumber", "invoiceDate", "dueDate", "totalAmount", "status"];
    if (allowed.includes(filters.sortKey)) {
      orderBy[filters.sortKey] = filters.sortDir ?? "asc";
    }
  }
  if (!Object.keys(orderBy).length) {
    orderBy.createdAt = "desc";
  }

  const [invoices, total, amountAgg] = await Promise.all([
    db.invoice.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      skip,
      take: PAGE_SIZE,
      orderBy,
      include: {
        customer: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
        tagAssignments: { include: { tag: { select: { id: true, name: true, slug: true, color: true, isArchived: true } } } },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.invoice.count({ where: where as any }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.invoice.aggregate({ where: where as any, _sum: { totalAmount: true } }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: InvoiceReportRow[] = invoices.map((inv: any) => {
    const amountPaid = (inv.payments ?? []).reduce(
      (sum: number, p: { amount: unknown }) => sum + toAccountingNumber(p.amount as number),
      0
    );
    const totalAmount = toAccountingNumber(inv.totalAmount);
    const tagNames = (inv.tagAssignments ?? [])
      .map((a: { tag: { name: string } }) => a.tag.name)
      .sort();
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customer?.name ?? "—",
      customerId: inv.customerId,
      status: inv.status,
      invoiceDate: formatIsoDate(inv.invoiceDate),
      dueDate: inv.dueDate ? formatIsoDate(inv.dueDate) : null,
      totalAmount,
      amountPaid,
      balance: totalAmount - amountPaid,
      tags: tagNames.join(", ") || "—",
    };
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalAmount: amountAgg._sum.totalAmount ?? 0,
  };
}

export async function exportInvoiceReportCSV(
  filters: Omit<InvoiceReportFilters, "page">
): Promise<string> {
  const allFilters = { ...filters, page: 1 } as InvoiceReportFilters;
  const allRows: InvoiceReportRow[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    allFilters.page = currentPage;
    const result = await getInvoiceReport(allFilters);
    allRows.push(...result.rows);
    hasMore = currentPage * PAGE_SIZE < result.total;
    currentPage++;
  }

  return generateCSV(
    [
      "Invoice #",
      "Customer",
      "Status",
      "Issue Date",
      "Due Date",
      "Total Amount",
      "Amount Paid",
      "Balance",
      "Tags",
    ],
    allRows.map((r) => [
      r.invoiceNumber,
      r.customerName,
      r.status,
      r.invoiceDate,
      r.dueDate ?? "",
      r.totalAmount.toFixed(2),
      r.amountPaid.toFixed(2),
      r.balance.toFixed(2),
      r.tags,
    ])
  );
}
