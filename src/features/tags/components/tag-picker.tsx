"use client";

import { useEffect, useState, useCallback } from "react";
import { listTags } from "@/lib/tags/tag-service";

interface TagOption {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface TagPickerProps {
  /** Currently selected tag IDs */
  selectedIds: string[];
  /** Called when selection changes */
  onChange: (tagIds: string[]) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Show archived tags as options (off by default) */
  includeArchived?: boolean;
}

export function TagPicker({
  selectedIds,
  onChange,
  placeholder = "Search tags...",
  includeArchived = false,
}: TagPickerProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listTags({ includeArchived })
      .then((result) => {
        if (result.success && result.data) {
          setTags(result.data.map((t) => ({ id: t.id, name: t.name, slug: t.slug, color: t.color })));
        } else {
          setError(result.error ?? "Failed to load tags");
        }
      })
      .catch(() => setError("Failed to load tags"))
      .finally(() => setLoading(false));
  }, [includeArchived]);

  const filtered = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = useCallback(
    (tagId: string) => {
      if (selectedIds.includes(tagId)) {
        onChange(selectedIds.filter((id) => id !== tagId));
      } else {
        onChange([...selectedIds, tagId]);
      }
    },
    [selectedIds, onChange]
  );

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id));
  const unselectedFiltered = filtered.filter((t) => !selectedIds.includes(t.id));

  if (loading) {
    return <p className="text-xs text-[var(--muted-foreground)]">Loading tags…</p>;
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: tag.color ?? "var(--border-soft)",
                backgroundColor: tag.color ? `${tag.color}18` : "var(--surface-soft)",
                color: tag.color ?? "var(--foreground)",
              }}
              title={`Remove ${tag.name}`}
            >
              {tag.name}
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />

      {/* Available tags */}
      {unselectedFiltered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselectedFiltered.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: tag.color ?? "var(--border-soft)",
                backgroundColor: "transparent",
                color: tag.color ?? "var(--muted-foreground)",
              }}
              title={`Add ${tag.name}`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {search ? "No matching tags" : "No tags available"}
        </p>
      )}
    </div>
  );
}
