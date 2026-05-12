"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

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
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
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
  return { id: t.id, name: t.name, slug: t.slug, color: t.color };
}

export function TagPicker({
  selectedIds,
  onChange,
  placeholder = "Search or create tags...",
  includeArchived = false,
  allowCreate = false,
  onTagCreated,
}: TagPickerProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
    const name = search.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A tag with this name already exists");
      return;
    }

    const color = getRandomColor();
    try {
      const newTag = await apiCreateTag({ name, color });
      setTags((prev) => [...prev, newTag]);
      onChange([...selectedIds, newTag.id]);
      setSearch("");
      onTagCreated?.(newTag);
      toast.success(`Tag "${newTag.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    }
  }, [search, tags, selectedIds, onChange, onTagCreated]);

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id));
  const unselectedFiltered = filtered.filter((t) => !selectedIds.includes(t.id));
  const canCreate = allowCreate && search.trim() && !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  if (loading) {
    return <p className="text-xs text-[var(--muted-foreground)]">Loading tags…</p>;
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:opacity-80"
              style={{
                backgroundColor: tag.color ? `${tag.color}18` : "var(--surface-soft)",
                color: tag.color ?? "var(--foreground)",
                border: `1.5px solid ${tag.color ?? "var(--border-soft)"}`,
              }}
              title={`Remove ${tag.name}`}
            >
              {tag.name}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Search / Create input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 pr-9 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) {
              e.preventDefault();
              handleCreateTag();
            }
          }}
        />
        {allowCreate && (
          <button
            type="button"
            onClick={() => {
              if (canCreate) handleCreateTag();
            }}
            disabled={!canCreate}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--muted-foreground)]"
            title={canCreate ? `Create "${search}"` : "Create new tag"}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Create prompt */}
      {canCreate && (
        <button
          type="button"
          onClick={handleCreateTag}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4" />
          Create tag "{search.trim()}"
        </button>
      )}

      {/* Available tags */}
      {unselectedFiltered.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Available tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unselectedFiltered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:bg-[var(--surface-subtle)]"
                style={{
                  borderColor: tag.color ?? "var(--border-soft)",
                  color: tag.color ?? "var(--muted-foreground)",
                }}
                title={`Add ${tag.name}`}
              >
                <Plus className="h-3 w-3" />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && tags.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {allowCreate ? "No tags yet. Type above to create your first tag." : "No tags available."}
        </p>
      )}
    </div>
  );
}
