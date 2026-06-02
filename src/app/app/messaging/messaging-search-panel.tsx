"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  X,
  MessageSquare,
  Hash,
  FileText,
  CheckSquare,
  Video,
} from "lucide-react";
import type { MessagingSearchResult, SearchResultKind, MessageSearchResult } from "./types";
import { RadioPill } from "./messaging-ui-primitives";

interface MessagingSearchPanelProps {
  query: string;
  onClose: () => void;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "channels", label: "Conversations" },
  { value: "tasks", label: "Tasks" },
  { value: "meetings", label: "Meetings" },
  { value: "files", label: "Files" },
];

const KIND_ORDER: SearchResultKind[] = ["message", "conversation", "task", "meeting", "file"];

const KIND_LABEL: Record<string, string> = {
  message: "Messages",
  conversation: "Conversations",
  task: "Tasks",
  meeting: "Meetings",
  file: "Files",
};

function SearchResultRow({ result }: { result: MessagingSearchResult }) {
  const icon =
    result.kind === "message" ? (
      <MessageSquare className="h-4 w-4 text-[#79747E]" />
    ) : result.kind === "conversation" ? (
      <Hash className="h-4 w-4 text-[#79747E]" />
    ) : result.kind === "task" ? (
      <CheckSquare className="h-4 w-4 text-[#79747E]" />
    ) : result.kind === "meeting" ? (
      <Video className="h-4 w-4 text-[#79747E]" />
    ) : (
      <FileText className="h-4 w-4 text-[#79747E]" />
    );

  const subtitle = result.kind === "message"
    ? (result as MessageSearchResult).snippet
    : result.subtitle;

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
        <p className="text-xs truncate text-[#79747E]" style={{ color: "#79747E" }}>
          {subtitle}
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
  const [results, setResults] = React.useState<MessagingSearchResult[]>([]);
  const [facets, setFacets] = React.useState<Record<string, number>>({ message: 0, conversation: 0, task: 0, meeting: 0, file: 0 });
  const [searchState, setSearchState] = React.useState<"active" | "degraded" | "unindexed">("active");
  const [unindexedKinds, setUnindexedKinds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setFacets({ message: 0, conversation: 0, task: 0, meeting: 0, file: 0 });
      setSearchState("active");
      setUnindexedKinds([]);
      setLoading(false);
      setError(null);
      return;
    }

    const filterToKindsMap: Record<string, string[]> = {
      all: ["message", "conversation", "task", "meeting", "file"],
      messages: ["message"],
      channels: ["conversation"],
      tasks: ["task"],
      meetings: ["meeting"],
      files: ["file"],
    };

    const abortController = new AbortController();

    const fetchSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const kindsParam = filterToKindsMap[filter].join(",");
        const res = await fetch(
          `/api/messaging/search?q=${encodeURIComponent(query)}&kinds=${kindsParam}&limit=20`,
          { signal: abortController.signal }
        );
        if (!res.ok) {
          throw new Error("Failed to load search results.");
        }
        const json = await res.json();
        if (json.success && json.data) {
          setResults(json.data.results || []);
          setFacets(json.data.facets || { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 });
          setSearchState(json.data.state || "active");
          setUnindexedKinds(json.data.unindexedKinds || []);
        } else {
          throw new Error(json.error?.message || "Failed to load search results.");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Search fetch failed:", err);
          setError(err.message || "An unexpected error occurred.");
          setSearchState("degraded");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSearch();

    return () => {
      abortController.abort();
    };
  }, [query, filter]);

  const grouped = React.useMemo(() => {
    const map = new Map<SearchResultKind, MessagingSearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.kind) ?? [];
      arr.push(r);
      map.set(r.kind, arr);
    }
    return KIND_ORDER.map((k) => ({ kind: k, results: map.get(k) ?? [] })).filter(
      (g) => g.results.length > 0
    );
  }, [results]);

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
        {searchState === "degraded" && (
          <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center gap-2" data-testid="search-degraded-banner">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Search indexing is currently degraded. Results may be incomplete.
          </div>
        )}

        {unindexedKinds.length > 0 && searchState !== "unindexed" && (
          <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center gap-2" data-testid="search-unindexed-warning">
            ⚠️ Some requested search types ({unindexedKinds.join(", ")}) are not yet available in this sprint.
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-[#79747E]" data-testid="search-loading">
            <span className="inline-block animate-spin mr-2">⏳</span> Loading results...
          </div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-red-600" data-testid="search-error">
            {error}
          </div>
        ) : query.length === 0 && filter === "all" ? (
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
        ) : (filter === "files" || searchState === "unindexed") ? (
          <div className="py-8 text-center text-sm text-[#79747E]" data-testid="search-unindexed">
            File search is not yet available in this sprint.
          </div>
        ) : results.length === 0 ? (
          unindexedKinds.length > 0 ? (
            <div
              className="py-6 text-center text-sm"
              style={{ color: "#79747E" }}
              data-testid="search-no-results-unindexed"
            >
              No results for &ldquo;{query}&rdquo; (some requested types like {unindexedKinds.join(", ")} are not yet available).
            </div>
          ) : (
            <div
              className="py-6 text-center text-sm"
              style={{ color: "#79747E" }}
              data-testid="search-no-results"
            >
              No results for &ldquo;{query}&rdquo;.
            </div>
          )
        ) : (
          <div className="space-y-3 pt-1">
            {grouped.map((group) => (
              <div key={group.kind}>
                <p
                  className="sticky top-0 bg-white pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide flex items-center justify-between"
                  style={{ color: "#79747E" }}
                >
                  <span>{KIND_LABEL[group.kind]}</span>
                  <span className="text-[9px] bg-gray-100 rounded-full px-1.5 py-0.5 font-normal">
                    {facets[group.kind] || group.results.length}
                  </span>
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
