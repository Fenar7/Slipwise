/**
 * SW Docs — Vault query layer
 *
 * Phase 19 Sprint 19.1: Unified Document Vault
 *
 * This module is the central server-side helper for the DocumentIndex table.
 * It provides:
 *   - upsertDocumentIndex()  — called from each create/update/archive action
 *   - queryVault()           — drives the /app/docs/vault listing page
 *   - getDocsSummary()       — drives the /app/docs suite home page
 *
 * Source of truth remains the original document models (Invoice, Voucher,
 * SalarySlip, Quote). DocumentIndex is the read-optimised listing layer.
 */

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

// ─── Document type constants ────────────────────────────────────────────────

export type DocType = "invoice" | "voucher" | "salary_slip" | "quote";

export const DOC_TYPES: DocType[] = ["invoice", "voucher", "salary_slip", "quote"];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  invoice: "Invoice",
  voucher: "Voucher",
  salary_slip: "Salary Slip",
  quote: "Quote",
};

// ─── Upsert helper (called from each document action) ───────────────────────

export interface DocumentIndexPayload {
  orgId: string;
  docType: DocType;
  documentId: string;
  documentNumber: string | null;
  titleOrSummary: string;
  counterpartyLabel?: string | null;
  status: string;
  primaryDate: Date;
  amount?: number;
  currency?: string;
  archivedAt?: Date | null;
}

const DRAFT_PLACEHOLDER = "(Draft)";

function resolveDocumentNumber(raw: string | null): string {
  if (!raw || raw.trim() === "") return DRAFT_PLACEHOLDER;
  return raw;
}

/**
 * Upsert a document into the DocumentIndex.
 * Idempotent — safe to call on every create, update, and archive action.
 *
 * Handles draft documents that lack an official number at creation time
 * by using a "(Draft)" placeholder.  The placeholder is replaced with the
 * real official number when the document transitions to finalized status
 * (e.g. DRAFT→ISSUED for invoices, draft→approved for vouchers).
 */
export async function upsertDocumentIndex(
  payload: DocumentIndexPayload
): Promise<void> {
  const documentNumber = resolveDocumentNumber(payload.documentNumber);

  await db.documentIndex.upsert({
    where: {
      orgId_docType_documentId: {
        orgId: payload.orgId,
        docType: payload.docType,
        documentId: payload.documentId,
      },
    },
    create: {
      organization: { connect: { id: payload.orgId } },
      docType: payload.docType,
      documentId: payload.documentId,
      documentNumber,
      titleOrSummary: payload.titleOrSummary,
      counterpartyLabel: payload.counterpartyLabel ?? null,
      status: payload.status,
      primaryDate: payload.primaryDate,
      amount: payload.amount ?? 0,
      currency: payload.currency ?? "INR",
      archivedAt: payload.archivedAt ?? null,
    },
    update: {
      documentNumber,
      titleOrSummary: payload.titleOrSummary,
      counterpartyLabel: payload.counterpartyLabel ?? null,
      status: payload.status,
      primaryDate: payload.primaryDate,
      amount: payload.amount ?? 0,
      currency: payload.currency ?? "INR",
      archivedAt: payload.archivedAt ?? null,
    },
  });
}

// ─── Vault query ─────────────────────────────────────────────────────────────

export interface VaultQueryParams {
  docType?: DocType | "all";
  status?: string;
  /** "active" (default) | "archived" | "all" */
  archived?: "active" | "archived" | "all";
  search?: string;
  sortBy?: "updatedAt" | "createdAt" | "primaryDate" | "amount";
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
  /** Phase 29: Filter by one or more tag IDs (match any) */
  tagIds?: string[];
}

export interface VaultRow {
  id: string;
  orgId: string;
  docType: string;
  documentId: string;
  documentNumber: string;
  titleOrSummary: string;
  counterpartyLabel: string | null;
  status: string;
  primaryDate: Date;
  amount: number;
  currency: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  operationalBadges?: Array<{
    kind: "pending_proof" | "open_ticket";
    label: string;
    href: string;
  }>;
}

export interface VaultResult {
  rows: VaultRow[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Query the vault — org‑scoped, filtered, searched, sorted.
 * Calls requireOrgContext() internally so it's safe to call in server actions.
 */
export async function queryVault(params: VaultQueryParams = {}): Promise<VaultResult> {
  const { orgId } = await requireOrgContext();

  const page = params.page ?? 1;
  const limit = params.limit ?? 25;
  const skip = (page - 1) * limit;

  // Build `where`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { orgId };

  if (params.docType && params.docType !== "all") {
    where.docType = params.docType;
  }

  if (params.status && params.status !== "all") {
    where.status = { equals: params.status, mode: "insensitive" };
  }

  // Archived visibility
  const archivedFilter = params.archived ?? "active";
  if (archivedFilter === "active") {
    where.archivedAt = null;
  } else if (archivedFilter === "archived") {
    where.archivedAt = { not: null };
  }
  // "all" → no filter

  // Text search
  if (params.search && params.search.trim() !== "") {
    const q = params.search.trim();
    where.OR = [
      { documentNumber: { contains: q, mode: "insensitive" } },
      { titleOrSummary: { contains: q, mode: "insensitive" } },
      { counterpartyLabel: { contains: q, mode: "insensitive" } },
    ];
  }

  // Phase 29: Tag-aware filtering via relational joins
  if (params.tagIds && params.tagIds.length > 0) {
    const [taggedInvoiceIds, taggedVoucherIds] = await Promise.all([
      db.invoiceTagAssignment.findMany({
        where: { tagId: { in: params.tagIds } },
        select: { invoiceId: true },
        distinct: ["invoiceId"],
      }),
      db.voucherTagAssignment.findMany({
        where: { tagId: { in: params.tagIds } },
        select: { voucherId: true },
        distinct: ["voucherId"],
      }),
    ]);

    const matchingDocIds = [
      ...taggedInvoiceIds.map((a) => a.invoiceId),
      ...taggedVoucherIds.map((a) => a.voucherId),
    ];

    if (matchingDocIds.length === 0) {
      return { rows: [], total: 0, page, totalPages: 0 };
    }

    where.documentId = { in: matchingDocIds };
  }

  // Sort
  const sortBy = params.sortBy ?? "updatedAt";
  const sortDir = params.sortDir ?? "desc";
  const orderBy = { [sortBy]: sortDir };

  const [rows, total] = await Promise.all([
    db.documentIndex.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    db.documentIndex.count({ where }),
  ]);

  const typedRows = rows as VaultRow[];
  const invoiceRows = typedRows.filter((row) => row.docType === "invoice");

  if (invoiceRows.length > 0) {
    const invoiceIds = invoiceRows.map((row) => row.documentId);
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: orgId,
        id: { in: invoiceIds },
      },
      select: {
        id: true,
        proofs: {
          where: { reviewStatus: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
        },
        tickets: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, category: true, status: true },
        },
      },
    });

    const invoiceActivity = new Map(
      invoices.map((invoice) => {
        const operationalBadges: VaultRow["operationalBadges"] = [];

        if (invoice.proofs[0]) {
          operationalBadges.push({
            kind: "pending_proof",
            label: "Payment proof pending review",
            href: `/app/pay/proofs/${invoice.proofs[0].id}`,
          });
        }

        if (invoice.tickets[0]) {
          operationalBadges.push({
            kind: "open_ticket",
            label:
              invoice.tickets[0].status === "IN_PROGRESS"
                ? "Customer query in progress"
                : "Customer query open",
            href: `/app/flow/tickets/${invoice.tickets[0].id}`,
          });
        }

        return [invoice.id, operationalBadges];
      }),
    );

    for (const row of typedRows) {
      if (row.docType !== "invoice") continue;
      row.operationalBadges = invoiceActivity.get(row.documentId) ?? [];
    }
  }

  return {
    rows: typedRows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Docs suite home summary ─────────────────────────────────────────────────

export interface DocsSummary {
  counts: Record<DocType, number>;
  totalActive: number;
  recentDocuments: VaultRow[];
}

/**
 * Aggregate counts and recent documents for the SW Docs suite home page.
 * Org‑scoped via requireOrgContext().
 */
export async function getDocsSummary(): Promise<DocsSummary> {
  const { orgId } = await requireOrgContext();

  const [invoiceCount, voucherCount, salarySlipCount, quoteCount, recentDocuments] =
    await Promise.all([
      db.documentIndex.count({ where: { orgId, docType: "invoice", archivedAt: null } }),
      db.documentIndex.count({ where: { orgId, docType: "voucher", archivedAt: null } }),
      db.documentIndex.count({ where: { orgId, docType: "salary_slip", archivedAt: null } }),
      db.documentIndex.count({ where: { orgId, docType: "quote", archivedAt: null } }),
      db.documentIndex.findMany({
        where: { orgId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);

  const counts: Record<DocType, number> = {
    invoice: invoiceCount,
    voucher: voucherCount,
    salary_slip: salarySlipCount,
    quote: quoteCount,
  };

  return {
    counts,
    totalActive: invoiceCount + voucherCount + salarySlipCount + quoteCount,
    recentDocuments: recentDocuments as VaultRow[],
  };
}

// ─── Index removal ──────────────────────────────────────────────────────────

/**
 * Remove a document from the DocumentIndex.
 * Safe to call when permanently deleting a document (e.g. draft delete)
 * so the index does not retain orphaned entries.
 */
export async function removeDocumentFromIndex(
  orgId: string,
  docType: DocType,
  documentId: string,
): Promise<void> {
  await db.documentIndex.deleteMany({
    where: { orgId, docType, documentId },
  });
}

// ─── Sync helpers for specific document types ────────────────────────────────

/** Sync a single invoice into DocumentIndex. Safe to call from invoice actions. */
export async function syncInvoiceToIndex(
  orgId: string,
  invoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    invoiceDate: string;
    totalAmount: number;
    displayCurrency?: string | null;
    archivedAt?: Date | null;
    customer?: { name: string } | null;
  }
): Promise<void> {
  await upsertDocumentIndex({
    orgId,
    docType: "invoice",
    documentId: invoice.id,
    documentNumber: invoice.invoiceNumber ?? "",
    titleOrSummary: `Invoice ${invoice.invoiceNumber ?? "Draft"}`,
    counterpartyLabel: invoice.customer?.name ?? null,
    status: invoice.status,
    primaryDate: new Date(invoice.invoiceDate),
    amount: invoice.totalAmount,
    currency: invoice.displayCurrency ?? "INR",
    archivedAt: invoice.archivedAt ?? null,
  });
}

/** Sync a single voucher into DocumentIndex. */
export async function syncVoucherToIndex(
  orgId: string,
  voucher: {
    id: string;
    voucherNumber: string | null;
    status: string;
    voucherDate: string;
    totalAmount: number;
    type: string;
    archivedAt?: Date | null;
    vendor?: { name: string } | null;
  }
): Promise<void> {
  const typeLabel = voucher.type === "receipt" ? "Receipt" : "Payment";
  const displayNumber = voucher.voucherNumber ?? null;
  await upsertDocumentIndex({
    orgId,
    docType: "voucher",
    documentId: voucher.id,
    documentNumber: displayNumber,
    titleOrSummary: `${typeLabel} Voucher ${voucher.voucherNumber ?? "Draft"}`,
    counterpartyLabel: voucher.vendor?.name ?? null,
    status: voucher.status,
    primaryDate: new Date(voucher.voucherDate),
    amount: voucher.totalAmount,
    currency: "INR",
    archivedAt: voucher.archivedAt ?? null,
  });
}

/** Sync a single salary slip into DocumentIndex. */
export async function syncSalarySlipToIndex(
  orgId: string,
  slip: {
    id: string;
    slipNumber: string;
    status: string;
    month: number;
    year: number;
    netPay: number;
    archivedAt?: Date | null;
    employee?: { name: string } | null;
  }
): Promise<void> {
  // Primary date: first day of the payslip month
  const primaryDate = new Date(slip.year, slip.month - 1, 1);
  await upsertDocumentIndex({
    orgId,
    docType: "salary_slip",
    documentId: slip.id,
    documentNumber: slip.slipNumber,
    titleOrSummary: `Salary Slip ${slip.slipNumber} — ${slip.year}/${String(slip.month).padStart(2, "0")}`,
    counterpartyLabel: slip.employee?.name ?? null,
    status: slip.status,
    primaryDate,
    amount: slip.netPay,
    currency: "INR",
    archivedAt: slip.archivedAt ?? null,
  });
}

/** Sync a single quote into DocumentIndex. */
export async function syncQuoteToIndex(
  orgId: string,
  quote: {
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    issueDate: Date;
    totalAmount: number;
    currency?: string;
    archivedAt?: Date | null;
    customer?: { name: string } | null;
  }
): Promise<void> {
  await upsertDocumentIndex({
    orgId,
    docType: "quote",
    documentId: quote.id,
    documentNumber: quote.quoteNumber,
    titleOrSummary: quote.title || `Quote ${quote.quoteNumber}`,
    counterpartyLabel: quote.customer?.name ?? null,
    status: quote.status,
    primaryDate: quote.issueDate,
    amount: quote.totalAmount,
    currency: quote.currency ?? "INR",
    archivedAt: quote.archivedAt ?? null,
  });
}
