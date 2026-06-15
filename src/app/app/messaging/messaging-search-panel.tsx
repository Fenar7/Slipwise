"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  X,
  MessageSquare,
  Hash,
  FileText,
} from "lucide-react";
import type { MessagingSearchResult, SearchResultKind } from "./types";
import { MOCK_SEARCH_RESULTS } from "./mock-data";
import { RadioPill } from "./messaging-ui-primitives";

interface MessagingSearchPanelProps {
  query: string;
  onClose: () => void;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "channels", label: "Channels & People" },
  { value: "files", label: "Files" },
];

const KIND_ORDER: SearchResultKind[] = ["message", "channel", "person", "file"];

const KIND_LABEL: Record<SearchResultKind, string> = {
  message: "Messages",
  channel: "Channels",
  person: "People",
  file: "Files",
};

function kindMatchesFilter(kind: SearchResultKind, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "messages") return kind === "message";
  if (filter === "channels") return kind === "channel" || kind === "person";
  if (filter === "files") return kind === "file";
  return true;
}

function SearchResultRow({ result }: { result: MessagingSearchResult }) {
  const icon =
    result.kind === "message" ? (
      <MessageSquare className="h-4 w-4 text-[#79747E]" />
    ) : result.kind === "channel" ? (
      <Hash className="h-4 w-4 text-[#79747E]" />
    ) : result.kind === "person" ? (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold" style={{ color: "#49454F" }}>
        {result.avatarInitials}
      </div>
    ) : (
      <FileText className="h-4 w-4 text-[#79747E]" />
    );

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
      data-testid={`search-result-${result.id}`}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#1C1B1F" }}>
          {result.title}
        </p>
        <p className="text-xs truncate" style={{ color: "#79747E" }}>
          {result.subtitle}
        </p>
      </div>
      {result.timestamp && (
        <span className="shrink-0 text-[10px]" style={{ color: "#79747E" }}>
          {new Date(result.timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
        </span>
      )}
    </button>
  );
}

export function MessagingSearchPanel({ query, onClose }: MessagingSearchPanelProps) {
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredResults = React.useMemo(() => {
    let results = MOCK_SEARCH_RESULTS;
    if (query.trim().length > 0) {
      const q = query.toLowerCase();
      results = results.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q)
      );
    }
    return results.filter((r) => kindMatchesFilter(r.kind, filter));
  }, [query, filter]);

  const grouped = React.useMemo(() => {
    const map = new Map<SearchResultKind, MessagingSearchResult[]>();
    for (const r of filteredResults) {
      const arr = map.get(r.kind) ?? [];
      arr.push(r);
      map.set(r.kind, arr);
    }
    return KIND_ORDER.map((k) => ({ kind: k, results: map.get(k) ?? [] })).filter(
      (g) => g.results.length > 0
    );
  }, [filteredResults]);

  return (
    <div
      className="shrink-0 border-b bg-white"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="search-panel"
      role="search"
      aria-label="Search results"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <RadioPill
          name="search-filter"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Close search panel"
          onClick={onClose}
          data-testid="search-panel-close"
        >
          <X className="h-4 w-4" style={{ color: "#79747E" }} />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto px-4 pb-3">
        {query.length === 0 && filter === "all" ? (
          <div data-testid="search-recent" className="space-y-2 pt-1">
            <p className="text-xs font-semibold" style={{ color: "#79747E" }}>
              Recent searches
            </p>
            <div className="flex flex-wrap gap-2">
              {["#payroll", "salary slips", "Priya Sharma"].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                  style={{ borderColor: "#E0E0E0", color: "#49454F" }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : filteredResults.length === 0 ? (
          <div
            className="py-6 text-center text-sm"
            style={{ color: "#79747E" }}
            data-testid="search-no-results"
          >
            No results for &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {grouped.map((group) => (
              <div key={group.kind}>
                <p
                  className="sticky top-0 bg-white pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: "#79747E" }}
                >
                  {KIND_LABEL[group.kind]}
                </p>
                <div className="space-y-0.5">
                  {group.results.map((r) => (
                    <SearchResultRow key={r.id} result={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
