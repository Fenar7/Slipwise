"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import Link from "next/link";

export function SendLogToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const defaultSearch = searchParams.get("search") || "";
  
  const [searchValue, setSearchValue] = useState(defaultSearch);

  // Sync state with URL if it changes externally (e.g. back button)
  useEffect(() => {
    setSearchValue(defaultSearch);
  }, [defaultSearch]);

  // Debounced search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchValue !== defaultSearch) {
        const params = new URLSearchParams(searchParams);
        if (searchValue) {
          params.set("search", searchValue);
        } else {
          params.delete("search");
        }
        params.delete("page"); // Reset to page 1 on search
        router.push(`${pathname}?${params.toString()}`);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchValue, pathname, router, searchParams, defaultSearch]);

  const filters = ["ALL", "PENDING", "SENT", "FAILED"];

  const buildFilterUrl = (s: string) => {
    const params = new URLSearchParams(searchParams);
    if (s === "ALL") {
      params.delete("status");
    } else {
      params.set("status", s);
    }
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between gap-4">
      {/* Search Input */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
        <Input
          type="text"
          placeholder="Search email or invoice..."
          className="pl-9 h-9 bg-[var(--surface-soft)] border-[var(--border-strong)]"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filters.map((s) => (
          <Link
            key={s}
            href={buildFilterUrl(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              (s === "ALL" && !status) || status === s
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-soft)] text-[var(--muted-foreground)] hover:bg-[var(--border-strong)]"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
