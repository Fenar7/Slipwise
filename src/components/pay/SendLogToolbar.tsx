"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

const VALID_STATUSES = ["ALL", "PENDING", "SENT", "FAILED"] as const;

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
    const timer = setTimeout(() => {
      if (searchValue === defaultSearch) return;
      const params = new URLSearchParams(searchParams);
      if (searchValue) {
        params.set("search", searchValue);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchValue, pathname, router, searchParams, defaultSearch]);

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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative max-w-sm w-full">
        <svg
          className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search email or invoice..."
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pl-9 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {VALID_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildFilterUrl(s)}
            className={`inline-flex items-center justify-center rounded-full px-4 py-1 text-sm font-medium transition-colors min-w-[60px] ${
              (s === "ALL" && !status) || status === s
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>
    </div>
  );
}
