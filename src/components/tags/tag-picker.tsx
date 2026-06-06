"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, Plus, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { listTags, createTag, canManageTags } from "@/lib/tags/tag-service";
import type { TagData } from "@/lib/tags/tag-service";
import { TagChips } from "./tag-chips";
import { panelAppear } from "@/components/foundation/motion-primitives";

export interface TagPickerProps {
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  archivedTagIds?: string[];
  placeholder?: string;
  className?: string;
}

export function TagPicker({
  value,
  onChange,
  disabled = false,
  archivedTagIds = [],
  placeholder = "Add tag...",
  className,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userCanManage, setUserCanManage] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const selectedTags = useMemo(() => {
    return allTags.filter((t) => value.includes(t.id));
  }, [allTags, value]);

  // Fetch tags + capability on mount (include archived so historical tags are visible immediately)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [tagsResult, canManageResult] = await Promise.allSettled([
        listTags({ includeArchived: true }),
        canManageTags(),
      ]);
      if (cancelled) return;
      if (tagsResult.status === "fulfilled" && tagsResult.value.success) {
        setAllTags(tagsResult.value.data);
      } else if (tagsResult.status === "rejected") {
        setError("Failed to load tags");
      }
      if (canManageResult.status === "fulfilled") {
        setUserCanManage(canManageResult.value);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on open/close toggle
      setHighlightedIndex(-1);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on open/close toggle
      setSearch("");
    }
  }, [open]);

  // Filter tags by search
  const filteredTags = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allTags.filter((t) => !t.isArchived || value.includes(t.id));
    return allTags.filter((t) => {
      if (t.isArchived && !value.includes(t.id)) return false;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q)
      );
    });
  }, [allTags, search, value]);

  const exactMatchExists = useMemo(() => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return allTags.some(
      (t) => t.name.toLowerCase() === q || t.slug === q.replace(/\s+/g, "-")
    );
  }, [allTags, search]);

  const handleSelect = useCallback(
    (tagId: string) => {
      if (value.includes(tagId)) {
        onChange(value.filter((id) => id !== tagId));
      } else {
        onChange([...value, tagId]);
      }
      setSearch("");
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const handleRemove = useCallback(
    (tagId: string) => {
      onChange(value.filter((id) => id !== tagId));
    },
    [value, onChange]
  );

  const handleCreate = useCallback(async () => {
    const name = search.trim();
    if (!name || creating) return;

    setCreating(true);
    setCreateError(null);
    const result = await createTag({ name });
    if (result.success) {
      setAllTags((prev) => [result.data, ...prev]);
      onChange([...value, result.data.id]);
      setSearch("");
    } else {
      setCreateError(result.error);
    }
    setCreating(false);
  }, [search, creating, value, onChange]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredTags.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredTags.length - 1
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredTags.length) {
          handleSelect(filteredTags[highlightedIndex].id);
        } else if (!exactMatchExists && search.trim()) {
          handleCreate();
        }
        return;
      }

      if (
        e.key === "Backspace" &&
        search === "" &&
        value.length > 0
      ) {
        onChange(value.slice(0, -1));
        return;
      }
    },
    [filteredTags, highlightedIndex, handleSelect, handleCreate, exactMatchExists, search, value, onChange]
  );

  const showCreateOption = search.trim() && !exactMatchExists && !creating && userCanManage === true;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Selected tags + trigger */}
      <div
        className={cn(
          "flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 cursor-text transition-colors",
          "border-[var(--border-soft)] bg-[var(--surface-panel)]",
          "focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
      >
        {selectedTags.length > 0 && (
          <TagChips
            tags={selectedTags}
            onRemove={handleRemove}
            max={5}
            size="sm"
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            setHighlightedIndex(-1);
            setCreateError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none border-none p-0"
        />
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--text-muted)] transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </div>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            variants={panelAppear}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border shadow-lg",
              "border-[var(--border-soft)] bg-[var(--surface-panel)]",
              "shadow-[var(--shadow-md)]"
            )}
          >
            {/* Search bar */}
            <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-3 py-2">
              <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search tags..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none border-none p-0"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tag list */}
            <div
              ref={listRef}
              className="max-h-[220px] overflow-y-auto py-1"
            >
              {loading && (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tags...
                </div>
              )}

              {error && (
                <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                  Failed to load tags. Retry or create a new one below.
                </div>
              )}

              {!loading && !error && filteredTags.length === 0 && !showCreateOption && (
                <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                  {search.trim()
                    ? "No tags match your search."
                    : "No tags yet. Create one below."}
                </div>
              )}

              {!loading && filteredTags.map((tag, idx) => {
                const isSelected = value.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleSelect(tag.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left",
                      idx === highlightedIndex && "bg-[var(--surface-subtle)]",
                      tag.isArchived && "opacity-60"
                    )}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    {/* Color dot */}
                    {tag.color && (
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    {!tag.color && (
                      <span className="h-3 w-3 rounded-full shrink-0 bg-[var(--border-strong)]" />
                    )}
                    <span className="flex-1 truncate">{tag.name}</span>
                    {tag.isArchived && (
                      <span className="text-[0.65rem] text-[var(--text-muted)] uppercase tracking-wider">
                        Archived
                      </span>
                    )}
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-[var(--brand-primary)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Create new tag */}
            {showCreateOption && (
              <div className="border-t border-[var(--border-soft)]">
                {createError && (
                  <div className="px-3 py-2 text-xs text-[var(--state-danger)] border-b border-[var(--border-soft)]">
                    {createError}
                  </div>
                )}
                <div className="p-2">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      "text-[var(--brand-primary)] hover:bg-[var(--surface-subtle)]",
                      creating && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create &ldquo;<span className="font-semibold">{search.trim()}</span>&rdquo;
                  </button>
                </div>
              </div>
            )}

            {search.trim() && !exactMatchExists && !creating && userCanManage === false && (
              <div className="border-t border-[var(--border-soft)] px-3 py-2">
                <p className="text-xs text-[var(--text-muted)]">
                  Contact an admin to create new tags.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
