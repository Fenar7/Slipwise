import { Suspense } from "react";
import Link from "next/link";
import { queryVault } from "@/lib/docs-vault";
import type { DocType, VaultRow } from "@/lib/docs-vault";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { cn } from "@/lib/utils";
import { Search, ArrowRight, FileText, Receipt, Banknote, FileCheck } from "lucide-react";
import { TagFilterChips } from "@/components/tags/tag-filter-chips";

export const metadata = {
  title: "Document Vault | Slipwise",
  description: "Unified view of all invoices, vouchers, salary slips, and quotes across your organisation.",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDetailHref(row: VaultRow): string {
  switch (row.docType as DocType) {
    case "invoice": return `/app/docs/invoices/${row.documentId}`;
    case "voucher": return `/app/docs/vouchers/${row.documentId}`;
    case "salary_slip": return `/app/docs/salary-slips/${row.documentId}`;
    case "quote": return `/app/docs/quotes/${row.documentId}`;
    default: return "#";
  }
}

// ─── Type + Status maps ──────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; variant: Parameters<typeof StatusBadge>[0]["variant"] }> = {
  invoice: { label: "Invoice", icon: FileText, variant: "info" },
  voucher: { label: "Voucher", icon: Receipt, variant: "default" },
  salary_slip: { label: "Salary Slip", icon: Banknote, variant: "warning" },
  quote: { label: "Quote", icon: FileCheck, variant: "success" },
};

const STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  ISSUED: "info",
  VIEWED: "info",
  DUE: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  DISPUTED: "danger",
  CANCELLED: "neutral",
  REISSUED: "info",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "neutral",
  CONVERTED: "success",
  draft: "neutral",
  approved: "success",
  released: "info",
};

// ─── Row component ────────────────────────────────────────────────────────────

function VaultTableRow({ row }: { row: VaultRow }) {
  const typeConfig = DOC_TYPE_CONFIG[row.docType] ?? { label: row.docType, icon: FileText, variant: "neutral" };
  const statusVariant = STATUS_VARIANTS[row.status] ?? "neutral";
  const TypeIcon = typeConfig.icon;

  return (
    <tr className="group transition-colors hover:bg-[var(--surface-subtle)]">
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-subtle)] text-[var(--text-muted)] transition-colors group-hover:bg-[var(--surface-selected)] group-hover:text-[var(--brand-primary)]">
            <TypeIcon className="h-3.5 w-3.5" />
          </span>
          <StatusBadge variant={typeConfig.variant}>{typeConfig.label}</StatusBadge>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <Link
          href={getDetailHref(row)}
          className="text-sm font-semibold text-[var(--brand-primary)] hover:underline transition-colors"
        >
          {row.documentNumber}
        </Link>
      </td>
      <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)] max-w-xs truncate">
        {row.titleOrSummary}
      </td>
      <td className="px-4 py-3.5 text-sm text-[var(--text-muted)]">
        {row.counterpartyLabel ?? "—"}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-1.5">
          <StatusBadge variant={statusVariant}>{row.status.replace(/_/g, " ")}</StatusBadge>
          {row.operationalBadges?.map((badge) => (
            <Link
              key={`${row.documentId}-${badge.kind}`}
              href={badge.href}
              className={cn(
                "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider transition-colors",
                badge.kind === "pending_proof"
                  ? "bg-[var(--state-warning-soft)] text-[var(--state-warning)]"
                  : "bg-[var(--state-info-soft)] text-[var(--state-info)]"
              )}
            >
              {badge.label}
            </Link>
          ))}
        </div>
      </td>
      <td className="px-4 py-3.5 text-sm text-[var(--text-muted)] whitespace-nowrap">
        {formatDate(row.primaryDate)}
      </td>
      <td className="px-4 py-3.5 text-sm text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">
        {row.amount > 0 ? formatCurrency(row.amount, row.currency) : "—"}
      </td>
      <td className="px-4 py-3.5 text-sm text-[var(--text-muted)] whitespace-nowrap">
        {formatDate(row.updatedAt)}
      </td>
      <td className="px-4 py-3.5 text-right">
        <Link
          href={getDetailHref(row)}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

// ─── Vault table ─────────────────────────────────────────────────────────────

async function VaultTable({
  docType,
  status,
  archived,
  search,
  sortBy,
  sortDir,
  page,
  tagIds,
}: {
  docType?: string;
  status?: string;
  archived?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  page: number;
  tagIds?: string[];
}) {
  const result = await queryVault({
    docType: (docType as DocType) || "all",
    status: status || "all",
    archived: (archived as "active" | "archived" | "all") || "active",
    search: search || "",
    sortBy: (sortBy as "updatedAt" | "createdAt" | "primaryDate" | "amount") || "updatedAt",
    sortDir: (sortDir as "asc" | "desc") || "desc",
    page,
    limit: 25,
    tagIds,
  });

  const { rows, total, totalPages } = result;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-subtle)] px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
          <FileText className="h-7 w-7 text-[var(--text-muted)]" />
        </div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">No documents found</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {search ? `No results for "${search}". Try different search terms.` :
            archived === "archived" ? "No archived documents." :
            "Create an invoice, voucher, salary slip, or quote to see it here."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/app/docs/invoices/new"
            className="rounded-lg bg-[var(--brand-cta)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C]"
          >
            New Invoice
          </Link>
          <Link
            href="/app/docs/quotes/new"
            className="rounded-lg border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            New Quote
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="slipwise-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Number</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title / Summary</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Counterparty</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Amount</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-soft)]">
            {rows.map((row) => (
              <VaultTableRow key={`${row.docType}-${row.documentId}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            {total} document{total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
                className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                ← Previous
              </Link>
            )}
            <span className="flex items-center px-3 text-xs font-medium text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`?page=${page + 1}`}
                className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function buildUrl(params: Record<string, string>, overrides: Record<string, string>) {
  const merged = { ...params, ...overrides, page: "1" };
  const qs = Object.entries(merged)
    .filter(([, v]) => v && v !== "all" && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "?";
}

function TypeFilter({ current, params }: { current: string; params: Record<string, string> }) {
  const types = [
    { value: "all", label: "All Types" },
    { value: "invoice", label: "Invoices" },
    { value: "voucher", label: "Vouchers" },
    { value: "salary_slip", label: "Salary Slips" },
    { value: "quote", label: "Quotes" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => {
        const active = current === t.value || (!current && t.value === "all");
        return (
          <Link
            key={t.value}
            href={buildUrl(params, { docType: t.value })}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-[var(--brand-primary)] text-white"
                : "bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-selected)]"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function ArchivedFilter({ current, params }: { current: string; params: Record<string, string> }) {
  const options = [
    { value: "active", label: "Active" },
    { value: "all", label: "All" },
    { value: "archived", label: "Archived" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1">
      {options.map((o) => {
        const active = current === o.value || (!current && o.value === "active");
        return (
          <Link
            key={o.value}
            href={buildUrl(params, { archived: o.value })}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active ? "bg-[var(--brand-primary)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

function SortSelect({ params }: { params: Record<string, string> }) {
  const sorts = [
    { value: "updatedAt", label: "Recently updated" },
    { value: "createdAt", label: "Recently created" },
    { value: "primaryDate", label: "Primary date" },
    { value: "amount", label: "Amount (high–low)" },
  ];
  const current = params.sortBy ?? "updatedAt";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">Sort:</span>
      <div className="flex flex-wrap gap-1">
        {sorts.map((s) => (
          <Link
            key={s.value}
            href={buildUrl(params, {
              sortBy: s.value,
              sortDir: s.value === "amount" ? "desc" : "desc",
            })}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              current === s.value
                ? "bg-[var(--surface-selected)] text-[var(--brand-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);

  const docType = params.docType ?? "all";
  const archived = params.archived ?? "active";
  const search = params.search ?? "";
  const sortBy = params.sortBy ?? "updatedAt";
  const sortDir = params.sortDir ?? "desc";
  const status = params.status ?? "all";
  const tagIdStr = params.tagId;
  const tagIds = tagIdStr ? (Array.isArray(tagIdStr) ? tagIdStr : [tagIdStr]) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Link href="/app/docs" className="hover:text-[var(--text-primary)] transition-colors">Docs</Link>
            <span>/</span>
            <span className="font-medium text-[var(--text-secondary)]">Vault</span>
          </nav>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Document Vault</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Unified view of invoices, vouchers, salary slips, and quotes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/docs/invoices/new"
            className="rounded-lg bg-[var(--brand-cta)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C]"
          >
            + Invoice
          </Link>
          <Link
            href="/app/docs/vouchers/new"
            className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            + Voucher
          </Link>
          <Link
            href="/app/docs/quotes/new"
            className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            + Quote
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3">
        {/* Search */}
        <form method="GET" className="flex-1">
          {params.docType && <input type="hidden" name="docType" value={params.docType} />}
          {params.archived && <input type="hidden" name="archived" value={params.archived} />}
          {params.sortBy && <input type="hidden" name="sortBy" value={params.sortBy} />}
          {params.sortDir && <input type="hidden" name="sortDir" value={params.sortDir} />}

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search number, counterparty, title…"
              className="w-full rounded-lg border border-[var(--border-default)] bg-white py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
          </div>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <TypeFilter current={docType} params={params} />
          <Suspense fallback={null}>
            <TagFilterChips />
          </Suspense>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <ArchivedFilter current={archived} params={params} />
            <SortSelect params={params} />
          </div>
        </div>
      </div>

      {/* Vault table */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
            Loading vault…
          </div>
        }
      >
        <VaultTable
          docType={docType}
          status={status}
          archived={archived}
          search={search}
          sortBy={sortBy}
          sortDir={sortDir}
          page={page}
          tagIds={tagIds}
        />
      </Suspense>

      {/* Footer nav */}
      <div className="mt-8 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
        <Link href="/app/docs" className="hover:text-[var(--text-primary)] transition-colors">← Back to Docs</Link>
        <Link href="/app/docs/templates" className="hover:text-[var(--text-primary)] transition-colors">Templates</Link>
        <Link href="/app/docs/pdf-studio" className="hover:text-[var(--text-primary)] transition-colors">PDF Studio</Link>
      </div>
    </div>
  );
}
