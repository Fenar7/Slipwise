"use client";

import { useState, useRef } from "react";
import { Search, X, SlidersHorizontal, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface MailboxCommandBarProps {
  activeViewLabel: string;
  totalCount?: number;
  unreadCount?: number;
}

export function MailboxCommandBar({
  activeViewLabel,
  totalCount,
  unreadCount,
}: MailboxCommandBarProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearching = query.length > 0;

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
              {totalCount} thread{totalCount !== 1 ? "s" : ""}
              {unreadCount ? (
                <span className="ml-1 font-semibold text-[#DC2626]">· {unreadCount} unread</span>
              ) : null}
            </span>
          )}
        </div>
      )}

      {/* Search input */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-all",
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search threads…"
          className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
          aria-label="Search mailbox threads"
        />
        {isSearching && (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E2E5EA] transition-colors hover:bg-[#D1D5DB]"
            aria-label="Clear search"
          >
            <X className="h-2.5 w-2.5 text-[#64748B]" />
          </button>
        )}
      </div>

      {/* Filter button */}
      <button
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E2E5EA] bg-white transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
        title="Filter threads"
        aria-label="Filter threads"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-[#64748B]" />
      </button>

      {/* Compose button */}
      <button
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
