"use client";

import { useState, useRef, useCallback } from "react";
import { Search, X, SlidersHorizontal, PenSquare, Bookmark, MessageSquare, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MailboxSearchMeta } from "@/lib/mailbox/thread-service";
import type { ActiveFilter, ActiveFilterState, SupportedSavedViewSmartViewId, MailboxSearchMode } from "./types";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";
import { MailboxSyncStateChip } from "./mailbox-sync-status";
import { MailboxSearchSuggestions } from "./mailbox-search-suggestions";

interface MailboxCommandBarProps {
  activeViewLabel: string;
  totalCount?: number | null;
  loadedCount?: number;
  unreadCount?: number;
  searchMeta?: MailboxSearchMeta | null;
  itemLabel?: "thread" | "draft";
  onCompose?: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onClearSearch?: () => void;
  searchMode?: MailboxSearchMode;
  onSearchModeChange?: (mode: MailboxSearchMode) => void;
  filterState?: ActiveFilterState;
  isFilterPanelOpen?: boolean;
  onToggleFilterPanel?: () => void;
  onSaveView?: (params: { label: ActiveFilter["label"]; filters: ActiveFilter[]; searchQuery?: string; smartViewId?: SupportedSavedViewSmartViewId | null }) => Promise<unknown>;
  smartViewId?: SupportedSavedViewSmartViewId;
  syncStatus?: MailboxSyncPresentation | null;
  onSyncNow?: () => void;
  isSyncPending?: boolean;
}

export function MailboxCommandBar({
  activeViewLabel,
  totalCount,
  loadedCount,
  unreadCount,
  searchMeta,
  itemLabel = "thread",
  onCompose,
  searchQuery = "",
  onSearchQueryChange,
  onClearSearch,
  searchMode = "threads",
  onSearchModeChange,
  filterState,
  isFilterPanelOpen = false,
  onToggleFilterPanel,
  onSaveView,
  smartViewId,
  syncStatus,
  onSyncNow,
  isSyncPending = false,
}: MailboxCommandBarProps) {
  const [focused, setFocused] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearching = searchQuery.length > 0;

  const handleFocus = useCallback(() => {
    setFocused(true);
    setSuggestionsOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion before closing
    setTimeout(() => {
      setFocused(false);
      setSuggestionsOpen(false);
    }, 150);
  }, []);

  const handleSuggestionSelect = useCallback(
    (text: string) => {
      onSearchQueryChange?.(text);
      setSuggestionsOpen(false);
      // Refocus input and place cursor at end
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        const len = inputRef.current?.value.length ?? 0;
        inputRef.current?.setSelectionRange(len, len);
      });
    },
    [onSearchQueryChange],
  );

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-2 border-b px-3"
      style={{ borderColor: "#E2E5EA", background: "#FFFFFF" }}
      role="toolbar"
      aria-label="Mailbox command bar"
    >
      {/* View label + counts */}
      {!focused && !isSearching && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-sm font-bold text-[#0F172A]">{activeViewLabel}</h2>
          {totalCount !== undefined && (
            <span className="shrink-0 text-xs text-[#94A3B8]">
              {((searchMeta?.mode === "gmail_exact" || searchMeta?.mode === "hybrid") && !searchMeta.totalCountIsExact)
                ? `Loaded ${loadedCount ?? totalCount ?? 0} `
                : `${totalCount ?? 0} `}
              {searchMeta?.searchMode === "messages"
                ? (totalCount ?? loadedCount ?? 0) === 1
                  ? "message"
                  : "messages"
                : itemLabel === "draft"
                ? totalCount === 1
                  ? "draft"
                  : "drafts"
                : (totalCount ?? loadedCount ?? 0) === 1
                ? "thread"
                : "threads"}
              {((searchMeta?.mode === "gmail_exact" || searchMeta?.mode === "hybrid") && !searchMeta.totalCountIsExact) ? (
                <span className="ml-1">via Gmail search</span>
              ) : null}
              {unreadCount ? (
                <span className="ml-1 font-semibold text-[#DC2626]">· {unreadCount} unread</span>
              ) : null}
              {searchMeta?.partial ? (
                <span className="ml-1 font-medium text-amber-600">· partial results</span>
              ) : null}
            </span>
          )}
          {syncStatus ? <MailboxSyncStateChip sync={syncStatus} /> : null}
        </div>
      )}

      {/* Search input with suggestions dropdown */}
      <div
        className={cn(
          "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-all",
          focused || isSearching
            ? "flex-1 border-[#16294D] bg-white ring-2 ring-[rgba(22,41,77,0.12)]"
            : "w-48 border-[#E2E5EA] bg-[#F7F8FB] hover:border-[#D1D5DB]"
        )}
      >
        <Search
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            focused || isSearching ? "text-[#16294D]" : "text-[#94A3B8]"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            onSearchQueryChange?.(e.target.value);
            setSuggestionsOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            // Let suggestions handle keyboard events when open
            if (suggestionsOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              // Suggestions component handles this
            }
          }}
          placeholder="Search threads…"
          className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
          aria-label="Search mailbox threads"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen}
          role="combobox"
        />
        {isSearching && (
          <button
            onClick={() => {
              onClearSearch?.();
              inputRef.current?.focus();
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E2E5EA] transition-colors hover:bg-[#D1D5DB]"
            aria-label="Clear search"
          >
            <X className="h-2.5 w-2.5 text-[#64748B]" />
          </button>
        )}

        {/* Search suggestions dropdown */}
        <MailboxSearchSuggestions
          query={searchQuery}
          isOpen={suggestionsOpen && focused}
          onSelect={handleSuggestionSelect}
          onClose={() => setSuggestionsOpen(false)}
          inputRef={inputRef}
        />
      </div>

      {/* Sprint B: Search mode switch — visible when searching */}
      {isSearching && onSearchModeChange && (
        <div className="flex shrink-0 items-center rounded-lg border border-[#E2E5EA] bg-white" role="radiogroup" aria-label="Search mode">
          <button
            type="button"
            role="radio"
            aria-checked={searchMode === "threads"}
            onClick={() => onSearchModeChange("threads")}
            className={cn(
              "flex items-center gap-1 rounded-l-lg px-2 py-1 text-xs font-medium transition-colors",
              searchMode === "threads"
                ? "bg-[#16294D] text-white"
                : "text-[#64748B] hover:bg-[#F7F8FB]"
            )}
            title="Search threads"
          >
            <Layers className="h-3 w-3" />
            <span className="hidden sm:inline">Threads</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={searchMode === "messages"}
            onClick={() => onSearchModeChange("messages")}
            className={cn(
              "flex items-center gap-1 rounded-r-lg px-2 py-1 text-xs font-medium transition-colors",
              searchMode === "messages"
                ? "bg-[#16294D] text-white"
                : "text-[#64748B] hover:bg-[#F7F8FB]"
            )}
            title="Search messages"
          >
            <MessageSquare className="h-3 w-3" />
            <span className="hidden sm:inline">Messages</span>
          </button>
        </div>
      )}

      {/* Filter button */}
      <button
        type="button"
        onClick={onToggleFilterPanel}
        className={cn(
          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
          isFilterPanelOpen
            ? "border-[#16294D] bg-[#0F172A] text-white ring-2 ring-[rgba(22,41,77,0.12)]"
            : filterState && filterState.filters.length > 0
            ? "border-[#16294D] bg-[#16294D] text-white"
            : "border-[#E2E5EA] bg-white text-[#64748B] hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
        )}
        title="Filter threads"
        aria-label="Filter threads"
        aria-pressed={filterState ? filterState.filters.length > 0 : false}
        aria-expanded={isFilterPanelOpen}
        aria-controls="mailbox-filter-panel"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {filterState && filterState.filters.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-[9px] font-bold text-white">
            {filterState.filters.length}
          </span>
        )}
      </button>

      {/* Save view button */}
      {onSaveView && (
        <button
          type="button"
          onClick={async () => {
            const label = window.prompt("Save view as:");
            if (!label) return;
            await onSaveView({
              label,
              filters: filterState?.filters ?? [],
              searchQuery: filterState?.searchQuery,
              smartViewId: smartViewId ?? null,
            });
          }}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
            "border-[#E2E5EA] bg-white text-[#64748B] hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
          )}
          title="Save current view"
          aria-label="Save current view"
        >
          <Bookmark className="h-3.5 w-3.5" />
        </button>
      )}

      {onSyncNow && syncStatus && (
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncStatus.isSyncing || isSyncPending}
          className={cn(
            "hidden h-7 shrink-0 items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors md:flex",
            syncStatus.isSyncing || isSyncPending
              ? "cursor-not-allowed border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
              : "border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]",
          )}
          aria-label="Sync mailbox now"
        >
          {syncStatus.isSyncing || isSyncPending ? "Syncing…" : "Sync now"}
        </button>
      )}
      {/* Compose button */}
      <button
        onClick={onCompose}
        className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
        style={{ background: "#16294D" }}
        title="Compose new message"
        aria-label="Compose new message"
      >
        <PenSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Compose</span>
      </button>
    </div>
  );
}
