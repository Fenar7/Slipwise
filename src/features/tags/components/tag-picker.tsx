"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

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
  /** Allow creating new tags */
  allowCreate?: boolean;
  /** Called when a new tag is created */
  onTagCreated?: (tag: TagOption) => void;
}

const COLORS = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#84CC16",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
];

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

async function fetchTags(includeArchived = false): Promise<TagOption[]> {
  const qs = includeArchived ? "?includeArchived=true" : "";
  const res = await fetch(`/api/tags${qs}`);
  if (!res.ok) throw new Error("Failed to load tags");
  const json = await res.json();
  if (!json.tags) throw new Error("Invalid response");
  return json.tags.map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    slug: t.slug as string,
    color: t.color as string | null,
  }));
}

async function apiCreateTag(input: { name: string; color: string }): Promise<TagOption> {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to create tag");
  }
  const json = await res.json();
  const t = json.tag;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
  };
}

export function TagPicker({
  selectedIds,
  onChange,
  placeholder = "Search tags...",
  includeArchived = false,
  allowCreate = false,
  onTagCreated,
}: TagPickerProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    fetchTags(includeArchived)
      .then((data) => setTags(data))
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

  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;

    const color = getRandomColor();
    try {
      const newTag = await apiCreateTag({
        name: newTagName.trim(),
        color,
      });
      setTags((prev) => [...prev, newTag]);
      onChange([...selectedIds, newTag.id]);
      setNewTagName("");
      setIsCreating(false);
      onTagCreated?.(newTag);
      toast.success(`Tag "${newTag.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    }
  }, [newTagName, selectedIds, onChange, onTagCreated]);

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id));
  const unselectedFiltered = filtered.filter((t) => !selectedIds.includes(t.id));
  const showCreateOption = allowCreate && search.trim() && !filtered.some((t) => t.name.toLowerCase() === search.toLowerCase());

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
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
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
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-[var(--border-default)] bg-white px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && isCreating) {
              e.preventDefault();
              handleCreateTag();
            }
          }}
        />
        {allowCreate && !isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            title="Create new tag"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Create new tag input */}
      {isCreating && (
        <div className="flex gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] p-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Enter tag name..."
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateTag();
              } else if (e.key === "Escape") {
                setIsCreating(false);
                setNewTagName("");
              }
            }}
            onBlur={() => {
              if (!newTagName.trim()) {
                setIsCreating(false);
              }
            }}
          />
          <button
            type="button"
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
            className="rounded-md bg-[var(--brand-cta)] px-3 py-1 text-xs font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewTagName("");
            }}
            className="rounded-md px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Available tags */}
      {unselectedFiltered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselectedFiltered.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
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

      {/* Create option when searching for non-existent tag */}
      {showCreateOption && allowCreate && (
        <button
          type="button"
          onClick={() => {
            setNewTagName(search);
            setIsCreating(true);
          }}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create tag "{search}"
        </button>
      )}

      {!loading && filtered.length === 0 && !showCreateOption && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {search ? "No matching tags" : "No tags available"}
        </p>
      )}
    </div>
  );
}
