"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { browseTemplates } from "./actions";
import Image from "next/image";
import { Search, Star, Download, Filter } from "lucide-react";

const CATEGORIES = ["All", "Invoice", "Voucher", "Salary Slip"] as const;
const PRICE_FILTERS = ["all", "free", "paid"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
  { value: "top-rated", label: "Top Rated" },
] as const;

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  templateType: string;
  category: string[];
  price: number;
  rating: number;
  reviewCount: number;
  downloadCount: number;
  publisherDisplayName: string;
  previewImageUrl: string;
}

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [priceFilter, setPriceFilter] =
    useState<(typeof PRICE_FILTERS)[number]>("all");
  const [sort, setSort] =
    useState<"popular" | "newest" | "top-rated">("newest");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const pageSize = 12;

  useEffect(() => {
    async function load() {
      const filters: Parameters<typeof browseTemplates>[0] = {
        search: search || undefined,
        category: category !== "All" ? category : undefined,
        priceFilter,
        sort,
        page,
        pageSize,
      };

      const result = await browseTemplates(filters);
      if (result.success) {
        setTemplates(result.data.templates);
        setTotal(result.data.total);
      }
    }

    startTransition(() => {
      load();
    });
  }, [search, category, priceFilter, sort, page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="slipwise-shell-bg min-h-screen">
      <div className="mx-auto max-w-[80rem] px-3 py-5 sm:px-4 lg:px-5 lg:py-7 space-y-6">
        {/* Header */}
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-[var(--text-muted)]">
            Discover Templates
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[var(--text-primary)] md:text-[2.4rem]">
            Template Marketplace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
            Browse and install professional templates created by the Slipwise community and verified publishers.
          </p>
        </div>

        {/* Search + filters bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-[var(--border-default)] bg-white py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-[var(--shadow-xs)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRICE_FILTERS.map((pf) => (
              <button
                key={pf}
                onClick={() => {
                  setPriceFilter(pf);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all",
                  priceFilter === pf
                    ? "border border-transparent bg-[var(--text-primary)] text-white shadow-[var(--shadow-xs)]"
                    : "border border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                )}
              >
                {pf}
              </button>
            ))}

            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "popular" | "newest" | "top-rated")
              }
              className="rounded-full border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-xs)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all",
                category === cat
                  ? "border border-transparent bg-[var(--brand-cta)] text-white shadow-[var(--shadow-xs)]"
                  : "border border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        {total > 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-primary)]">{total}</span> template
            {total !== 1 ? "s" : ""}
          </p>
        )}

        {/* Template grid */}
        {isPending ? (
          <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--brand-primary)]" />
              <span className="text-sm">Loading templates...</span>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-white p-12 text-center">
            <Filter className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
            <p className="mt-4 text-[var(--text-secondary)]">No templates found.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--text-muted)]">
              Page <span className="font-medium text-[var(--text-primary)]">{page}</span> of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template }: { template: TemplateItem }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-white shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5">
      {template.previewImageUrl && (
        <div className="relative bg-[var(--surface-subtle)] mb-0 aspect-video overflow-hidden">
          <Image
            src={template.previewImageUrl}
            alt={template.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
          />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
            {template.name}
          </h3>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider",
              template.price === 0
                ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
                : "bg-[var(--state-info-soft)] text-[var(--state-info)]"
            )}
          >
            {template.price === 0 ? "FREE" : `₹${template.price}`}
          </span>
        </div>

        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
          {template.description}
        </p>

        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-[var(--state-warning)] text-[var(--state-warning)]" />
            <span className="font-medium text-[var(--text-primary)]">{template.rating.toFixed(1)}</span>
            <span>({template.reviewCount})</span>
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {template.downloadCount} installs
          </span>
        </div>

        <div className="mt-1 text-xs text-[var(--text-muted)]">
          {template.templateType}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          By {template.publisherDisplayName}
        </div>
      </div>
    </div>
  );
}
