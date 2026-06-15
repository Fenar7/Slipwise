"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, Clock, Users, Zap, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchSuggestion {
  id: string;
  text: string;
  label: string;
  category: "operator" | "filter" | "contact" | "history";
}

interface MailboxSearchSuggestionsProps {
  query: string;
  isOpen: boolean;
  onSelect: (text: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const DEBOUNCE_MS = 150;

const CATEGORY_ICONS: Record<SearchSuggestion["category"], typeof Search> = {
  operator: Zap,
  filter: Hash,
  contact: Users,
  history: Clock,
};

const CATEGORY_LABELS: Record<SearchSuggestion["category"], string> = {
  operator: "Operators",
  filter: "Filters",
  contact: "Contacts",
  history: "Recent",
};

/**
 * Gmail-style search suggestions dropdown.
 * Shows autocomplete suggestions as the user types in the search bar.
 * Supports keyboard navigation (ArrowUp/ArrowDown/Enter/Escape).
 */
export function MailboxSearchSuggestions({
  query,
  isOpen,
  onSelect,
  onClose,
  inputRef,
}: MailboxSearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (!isOpen || query.length < 1) {
      setSuggestions([]);
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);

      const params = new URLSearchParams({ q: query, limit: "8" });
      const cursorPos = inputRef.current?.selectionStart ?? query.length;
      params.set("cursor", String(cursorPos));

      fetch(`/api/mailbox/search/suggestions?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (!controller.signal.aborted) {
            setSuggestions(data.suggestions ?? []);
            setActiveIndex(-1);
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError" && !controller.signal.aborted) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, isOpen, inputRef]);

  // Group suggestions by category
  const grouped = useMemo(() => {
    const groups: Record<string, SearchSuggestion[]> = {};
    for (const s of suggestions) {
      const key = s.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [suggestions]);

  // Flat list for keyboard navigation
  const flatSuggestions = useMemo(() => suggestions, [suggestions]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-suggestion-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || flatSuggestions.length === 0) {
        if (e.key === "Escape") onClose();
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < flatSuggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : flatSuggestions.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < flatSuggestions.length) {
            onSelect(flatSuggestions[activeIndex].text);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, flatSuggestions, activeIndex, onSelect, onClose],
  );

  if (!isOpen || suggestions.length === 0) return null;

  let itemIndex = 0;

  return (
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-hidden rounded-xl border border-[#E2E5EA] bg-white shadow-lg"
      role="listbox"
      aria-label="Search suggestions"
      onKeyDown={handleKeyDown}
    >
      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {Object.entries(grouped).map(([category, items]) => {
          const Icon = CATEGORY_ICONS[category as SearchSuggestion["category"]];
          const groupLabel = CATEGORY_LABELS[category as SearchSuggestion["category"]];

          return (
            <div key={category}>
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Icon className="h-3 w-3 text-[#94A3B8]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {groupLabel}
                </span>
              </div>
              {items.map((suggestion) => {
                const currentIndex = itemIndex++;
                const isActive = currentIndex === activeIndex;

                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    data-suggestion-item
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-[#F0F4FF] text-[#16294D]"
                        : "text-[#334155] hover:bg-[#F7F8FB]",
                    )}
                    onMouseEnter={() => setActiveIndex(currentIndex)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(suggestion.text);
                    }}
                  >
                    {suggestion.category === "contact" ? (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8ECF4] text-[10px] font-semibold text-[#16294D]">
                        {suggestion.label.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {highlightMatch(suggestion.text, query)}
                      </span>
                      {suggestion.label !== suggestion.text && (
                        <span className="block truncate text-xs text-[#94A3B8]">
                          {suggestion.label}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <kbd className="ml-auto shrink-0 rounded border border-[#E2E5EA] bg-[#F7F8FB] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-[#94A3B8]">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#E2E5EA] border-t-[#16294D]" />
            Searching…
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="flex items-center justify-between border-t border-[#F1F5F9] bg-[#F8FAFC] px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] text-[#94A3B8]">
          <kbd className="rounded border border-[#E2E5EA] bg-white px-1 py-0.5 font-medium">↑↓</kbd>
          <span>navigate</span>
          <kbd className="rounded border border-[#E2E5EA] bg-white px-1 py-0.5 font-medium">↵</kbd>
          <span>select</span>
          <kbd className="rounded border border-[#E2E5EA] bg-white px-1 py-0.5 font-medium">esc</kbd>
          <span>close</span>
        </div>
      </div>
    </div>
  );
}

/** Highlight matching text within a suggestion. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return text;

  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-[#16294D]">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}
