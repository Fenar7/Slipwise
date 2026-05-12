"use client";

import { cn } from "@/lib/utils";
import { X, SlidersHorizontal } from "lucide-react";
import type { ActiveFilter, ActiveFilterState } from "./types";

const QUICK_FILTERS: ActiveFilter[] = [
  { field: "unread", value: "true", label: "Unread" },
  { field: "assignee", value: "me", label: "Assigned to me" },
  { field: "assignee", value: "none", label: "Unassigned" },
  { field: "status", value: "pending", label: "Pending" },
  { field: "linked", value: "true", label: "Linked" },
  { field: "linked", value: "false", label: "Unlinked" },
  { field: "flagged", value: "true", label: "Flagged" },
];

interface FilterChipsBarProps {
  filterState: ActiveFilterState;
  onAddFilter: (filter: ActiveFilter) => void;
  onRemoveFilter: (field: string, value: string) => void;
  onClearAll: () => void;
}

function isActive(filterState: ActiveFilterState, filter: ActiveFilter): boolean {
  return filterState.filters.some(
    (f) => f.field === filter.field && f.value === filter.value
  );
}

export function FilterChipsBar({
  filterState,
  onAddFilter,
  onRemoveFilter,
  onClearAll,
}: FilterChipsBarProps) {
  const hasActiveFilters = filterState.filters.length > 0;

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-white px-3 py-2 scrollbar-none"
      style={{ borderColor: "#E2E5EA" }}
      role="toolbar"
      aria-label="Active filters"
      data-testid="filter-chips-bar"
    >
      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" aria-hidden="true" />

      {/* Quick filter chips */}
      {QUICK_FILTERS.map((filter) => {
        const active = isActive(filterState, filter);
        return (
          <button
            key={`${filter.field}-${filter.value}`}
            onClick={() =>
              active
                ? onRemoveFilter(filter.field, filter.value)
                : onAddFilter(filter)
            }
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              active
                ? "border-[#16294D] bg-[#16294D] text-white"
                : "border-[#E2E5EA] bg-white text-[#64748B] hover:border-[#D1D5DB] hover:text-[#0F172A]"
            )}
            aria-pressed={active}
            aria-label={`${active ? "Remove" : "Add"} filter: ${filter.label}`}
            data-testid={`filter-chip-${filter.field}-${filter.value}`}
          >
            {filter.label}
            {active && <X className="h-3 w-3" aria-hidden="true" />}
          </button>
        );
      })}

      {/* Active filter chips from state (non-quick filters) */}
      {filterState.filters
        .filter(
          (f) =>
            !QUICK_FILTERS.some((qf) => qf.field === f.field && qf.value === f.value)
        )
        .map((f) => (
          <button
            key={`${f.field}-${f.value}`}
            onClick={() => onRemoveFilter(f.field, f.value)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-[#16294D] bg-[#16294D] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
            aria-label={`Remove filter: ${f.label}`}
          >
            {f.label}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ))}

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={onClearAll}
          className="ml-1 shrink-0 text-[11px] font-medium text-[#94A3B8] underline underline-offset-2 transition-colors hover:text-[#DC2626]"
          aria-label="Clear all filters"
          data-testid="clear-filters-btn"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
