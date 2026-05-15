"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Upload,
  SlidersHorizontal,
  X,
} from "lucide-react";

import type { ClientFilter } from "./client-workspace-mock-data";

const FILTER_CHIPS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "prospect", label: "Prospects" },
  { key: "at-risk", label: "At Risk" },
  { key: "churned", label: "Churned" },
  { key: "portal-enabled", label: "Hub Enabled" },
  { key: "portal-disabled", label: "Hub Disabled" },
];

interface ClientWorkspaceHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeFilter: ClientFilter;
  onFilterChange: (filter: ClientFilter) => void;
  resultCount: number;
}

export function ClientWorkspaceHeader({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  resultCount,
}: ClientWorkspaceHeaderProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="space-y-4">
      {/* Top bar: title + primary actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Clients
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage client relationships, portal access, and linked documents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" asChild>
            <Link href="/app/data/customers/new" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Client
            </Link>
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" asChild>
            <Link href="/app/data/customers">
              <Upload className="h-3.5 w-3.5" />
              Import
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
        </div>
      </div>

      {/* Search + quick filter chips */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex gap-2 max-w-md flex-1"
          role="search"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search clients by name, email, phone…"
              className="w-full rounded-lg border border-[var(--border-default)] bg-white py-2 pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onFilterChange(chip.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                activeFilter === chip.key
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result count + active filter summary */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          Showing{" "}
          <span className="font-medium text-[var(--text-secondary)]">
            {resultCount}
          </span>{" "}
          {resultCount === 1 ? "client" : "clients"}
        </span>
        <div className="flex items-center gap-2">
          {activeFilter !== "all" && (
            <button
              onClick={() => onFilterChange("all")}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-subtle)] px-2 py-1 text-[0.65rem] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-soft)] transition-colors"
            >
              {FILTER_CHIPS.find((c) => c.key === activeFilter)?.label}
              <X className="h-3 w-3" />
            </button>
          )}
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-subtle)] px-2 py-1 text-[0.65rem] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-soft)] transition-colors"
            >
              Search: “{searchQuery}”
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
