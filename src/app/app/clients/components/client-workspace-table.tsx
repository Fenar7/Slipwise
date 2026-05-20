import Link from "next/link";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableEmpty,
} from "@/components/ui/finance-table";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { ClientWorkspaceRowView } from "./client-workspace-row";
import type {
  ClientWorkspaceRow,
  ClientFilter,
} from "./client-workspace-mock-data";

interface ClientWorkspaceTableProps {
  clients: ClientWorkspaceRow[];
  total: number;
  page: number;
  totalPages: number;
  searchQuery: string;
  activeFilter: ClientFilter;
  sort?: { key: "name" | "outstandingBalance" | "lastActivityAt"; dir: "asc" | "desc" } | undefined;
}

function SortLink({
  sortKey,
  currentSort,
  label,
  searchParams,
}: {
  sortKey: "name" | "outstandingBalance" | "lastActivityAt";
  currentSort: ClientWorkspaceTableProps["sort"];
  label: string;
  searchParams: URLSearchParams;
}) {
  const nextDir =
    currentSort?.key === sortKey && currentSort.dir === "asc" ? "desc" : "asc";
  const next = new URLSearchParams(searchParams);
  next.set("sort", `${sortKey}:${nextDir}`);

  return (
    <Link
      href={`/app/clients?${next.toString()}`}
      className="inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
    </Link>
  );
}

function PageLink({
  page,
  label,
  searchParams,
  disabled,
}: {
  page: number;
  label: React.ReactNode;
  searchParams: URLSearchParams;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] opacity-40 cursor-not-allowed">
        {label}
      </span>
    );
  }
  const next = new URLSearchParams(searchParams);
  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }
  const qs = next.toString();
  return (
    <Link
      href={`/app/clients${qs ? `?${qs}` : ""}`}
      className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
    >
      {label}
    </Link>
  );
}

export function ClientWorkspaceTable({
  clients,
  total,
  page,
  totalPages,
  searchQuery,
  activeFilter,
  sort,
}: ClientWorkspaceTableProps) {
  const searchParams = new URLSearchParams();
  if (searchQuery) searchParams.set("search", searchQuery);
  if (activeFilter !== "all") searchParams.set("filter", activeFilter);
  if (sort) searchParams.set("sort", `${sort.key}:${sort.dir}`);

  const pageSize = 20;
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const hasRows = clients.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <FinanceTable>
          <FinanceTableHeader>
            <FinanceTableHead className="w-10 px-3">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--focus-ring)]"
                aria-label="Select all visible rows"
                disabled
              />
            </FinanceTableHead>
            <FinanceTableHead>
              <SortLink
                sortKey="name"
                currentSort={sort}
                label="Client"
                searchParams={searchParams}
              />
            </FinanceTableHead>
            <FinanceTableHead>Email</FinanceTableHead>
            <FinanceTableHead>Phone</FinanceTableHead>
            <FinanceTableHead>Portal</FinanceTableHead>
            <FinanceTableHead>Status</FinanceTableHead>
            <FinanceTableHead align="right">
              <SortLink
                sortKey="outstandingBalance"
                currentSort={sort}
                label="Outstanding"
                searchParams={searchParams}
              />
            </FinanceTableHead>
            <FinanceTableHead>Documents</FinanceTableHead>
            <FinanceTableHead>
              <SortLink
                sortKey="lastActivityAt"
                currentSort={sort}
                label="Last Activity"
                searchParams={searchParams}
              />
            </FinanceTableHead>
            <FinanceTableHead align="right" className="w-40">
              Actions
            </FinanceTableHead>
          </FinanceTableHeader>

          <FinanceTableBody>
            {!hasRows ? (
              <FinanceTableEmpty
                colSpan={10}
                message="No clients match your filters"
              />
            ) : (
              clients.map((client) => (
                <ClientWorkspaceRowView key={client.id} client={client} />
              ))
            )}
          </FinanceTableBody>
        </FinanceTable>
      </div>

      {/* Pagination */}
      {hasRows && (
        <div className="flex items-center justify-between border-t border-[var(--border-soft)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            Showing{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {startItem}–{endItem}
            </span>{" "}
            of{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {total}
            </span>
          </p>
          <div className="flex items-center gap-1">
            <PageLink
              page={page - 1}
              label={
                <>
                  <ChevronLeft className="mr-1 h-3 w-3" />
                  Previous
                </>
              }
              searchParams={searchParams}
              disabled={page <= 1}
            />
            <span className="px-2 text-xs font-medium text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            <PageLink
              page={page + 1}
              label={
                <>
                  Next
                  <ChevronRight className="ml-1 h-3 w-3" />
                </>
              }
              searchParams={searchParams}
              disabled={page >= totalPages}
            />
          </div>
        </div>
      )}
    </div>
  );
}
