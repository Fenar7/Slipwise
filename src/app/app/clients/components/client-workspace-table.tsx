"use client";

import { useMemo, useState, useCallback } from "react";
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
  searchQuery: string;
  activeFilter: ClientFilter;
  pageSize?: number;
}

export function ClientWorkspaceTable({
  clients,
  searchQuery,
  activeFilter,
  pageSize = 10,
}: ClientWorkspaceTableProps) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<"name" | "outstandingBalance" | "lastActivityAt">("lastActivityAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let data = [...clients];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.contactName.toLowerCase().includes(q)
      );
    }

    // Lifecycle / portal filter
    if (activeFilter !== "all") {
      data = data.filter((c) => {
        switch (activeFilter) {
          case "active":
            return c.lifecycleStage === "ACTIVE" || c.lifecycleStage === "WON";
          case "prospect":
            return c.lifecycleStage === "PROSPECT" || c.lifecycleStage === "QUALIFIED";
          case "at-risk":
            return c.lifecycleStage === "AT_RISK" || c.lifecycleStage === "NEGOTIATION";
          case "churned":
            return c.lifecycleStage === "CHURNED";
          case "portal-enabled":
            return c.portalStatus === "enabled";
          case "portal-disabled":
            return c.portalStatus !== "enabled";
          default:
            return true;
        }
      });
    }

    // Sort
    data.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "outstandingBalance") {
        cmp = a.outstandingBalance - b.outstandingBalance;
      } else if (sortKey === "lastActivityAt") {
        cmp = new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return data;
  }, [clients, searchQuery, activeFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const somePageSelected =
    pageRows.some((r) => selectedIds.has(r.id)) && !allPageSelected;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageRows.forEach((r) => {
          if (checked) next.add(r.id);
          else next.delete(r.id);
        });
        return next;
      });
    },
    [pageRows]
  );

  const handleSelectRow = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  const startItem = filtered.length === 0 ? 0 : startIdx + 1;
  const endItem = Math.min(startIdx + pageSize, filtered.length);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] text-[var(--text-muted)] uppercase tracking-wider">
              Bulk actions shell
            </span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <FinanceTable>
          <FinanceTableHeader>
            <FinanceTableHead className="w-10 px-3">
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePageSelected;
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--focus-ring)]"
                aria-label="Select all visible rows"
              />
            </FinanceTableHead>
            <FinanceTableHead>
              <button
                onClick={() => toggleSort("name")}
                className="inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
              >
                Client
                <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
              </button>
            </FinanceTableHead>
            <FinanceTableHead>Email</FinanceTableHead>
            <FinanceTableHead>Phone</FinanceTableHead>
            <FinanceTableHead>Portal</FinanceTableHead>
            <FinanceTableHead>Status</FinanceTableHead>
            <FinanceTableHead align="right">
              <button
                onClick={() => toggleSort("outstandingBalance")}
                className="inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
              >
                Outstanding
                <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
              </button>
            </FinanceTableHead>
            <FinanceTableHead>Documents</FinanceTableHead>
            <FinanceTableHead>
              <button
                onClick={() => toggleSort("lastActivityAt")}
                className="inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
              >
                Last Activity
                <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
              </button>
            </FinanceTableHead>
            <FinanceTableHead align="right" className="w-40">
              Actions
            </FinanceTableHead>
          </FinanceTableHeader>

          <FinanceTableBody>
            {pageRows.length === 0 ? (
              <FinanceTableEmpty
                colSpan={10}
                message="No clients match your filters"
              />
            ) : (
              pageRows.map((client) => (
                <ClientWorkspaceRowView
                  key={client.id}
                  client={client}
                  selected={selectedIds.has(client.id)}
                  onSelect={handleSelectRow}
                />
              ))
            )}
          </FinanceTableBody>
        </FinanceTable>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--border-soft)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            Showing{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {startItem}–{endItem}
            </span>{" "}
            of{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {filtered.length}
            </span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 1}
              className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Previous
            </button>
            <span className="px-2 text-xs font-medium text-[var(--text-muted)]">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="ml-1 h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
