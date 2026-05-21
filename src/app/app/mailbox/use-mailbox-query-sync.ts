"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ActiveFilterState, ActiveFilter } from "./types";

function parseQueryParams(searchParams: URLSearchParams): ActiveFilterState {
  const filters: ActiveFilter[] = [];
  searchParams.forEach((value, key) => {
    if (key.startsWith("f_")) {
      const field = key.slice(2);
      filters.push({ field, value, label: value });
    }
  });
  return {
    filters,
    searchQuery: searchParams.get("q") ?? "",
  };
}

function buildQueryString(state: ActiveFilterState): string {
  const params = new URLSearchParams();
  if (state.searchQuery.trim()) {
    params.set("q", state.searchQuery.trim());
  }
  for (const filter of state.filters) {
    params.set(`f_${filter.field}`, filter.value);
  }
  return params.toString();
}

export function useMailboxQuerySync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filterState, setFilterState] = useState<ActiveFilterState>(() =>
    parseQueryParams(searchParams),
  );

  // Restore from URL on mount / when URL changes externally
  useEffect(() => {
    setFilterState(parseQueryParams(searchParams));
  }, [searchParams]);

  // Debounced push to URL when local state changes
  useEffect(() => {
    const qs = buildQueryString(filterState);
    const currentQs = searchParams.toString();
    if (qs !== currentQs) {
      const timer = setTimeout(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filterState, pathname, router, searchParams]);

  const setFilterStateAndSync = useCallback(
    (updater: React.SetStateAction<ActiveFilterState>) => {
      setFilterState(updater);
    },
    [],
  );

  return { filterState, setFilterState: setFilterStateAndSync };
}
