"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Tag, X, Plus, Minus, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { listTags } from "@/lib/tags/tag-service";
import type { TagData } from "@/lib/tags/tag-service";
import { TagChips } from "@/components/tags/tag-chips";

export interface BulkTagBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  entityType: "invoice" | "voucher";
  bulkAddAction: (ids: string[], tagId: string) => Promise<{ success: boolean; error?: string }>;
  bulkRemoveAction: (ids: string[], tagId: string) => Promise<{ success: boolean; error?: string }>;
}

export function BulkTagBar({
  selectedIds,
  onClearSelection,
  entityType,
  bulkAddAction,
  bulkRemoveAction,
}: BulkTagBarProps) {
  const [open, setOpen] = useState<"add" | "remove" | null>(null);
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [fetchTags, setFetchTagsTrigger] = useState(0);

  const loadTags = useCallback(async () => {
    setLoading(true);
    const result = await listTags({ includeArchived: false });
    if (result.success) {
      setTags(result.data);
    }
    setLoading(false);
  }, []);

  const handleOpen = (mode: "add" | "remove") => {
    setOpen(mode);
    setSelectedTagId(null);
    loadTags();
  };

  const handleApply = async () => {
    if (!selectedTagId || selectedIds.length === 0) return;

    const action = open === "add" ? bulkAddAction : bulkRemoveAction;
    const result = await action(selectedIds, selectedTagId);

    if (result.success) {
      toast.success(
        `${open === "add" ? "Added" : "Removed"} tag ${open === "add" ? "to" : "from"} ${selectedIds.length} ${entityType}${selectedIds.length > 1 ? "s" : ""}`
      );
      setOpen(null);
      setSelectedTagId(null);
      onClearSelection();
    } else {
      toast.error(result.error || "Operation failed");
    }
  };

  if (selectedIds.length === 0) return null;

  const label = entityType === "invoice" ? "invoices" : "vouchers";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-2.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <CheckSquare className="h-4 w-4 text-[var(--brand-primary)]" />
        <span className="font-medium">{selectedIds.length}</span> {label} selected
      </div>

      <button
        type="button"
        onClick={() => handleOpen("add")}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          open === "add"
            ? "bg-[var(--brand-primary)] text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add tag
      </button>

      <button
        type="button"
        onClick={() => handleOpen("remove")}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          open === "remove"
            ? "bg-[var(--brand-primary)] text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
        )}
      >
        <Minus className="h-3.5 w-3.5" />
        Remove tag
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>

      {/* Tag selection dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[var(--shadow-md)] p-3">
          <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
            Select a tag to {open === "add" ? "add" : "remove"}:
          </div>
          {loading ? (
            <div className="text-sm text-[var(--text-muted)] py-4 text-center">
              Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] py-4 text-center">
              No tags available. Create tags in settings.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagId(tag.id === selectedTagId ? null : tag.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    tag.id === selectedTagId
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                      : "border-[var(--border-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!selectedTagId}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                selectedTagId
                  ? "bg-[var(--brand-primary)] text-white hover:opacity-90"
                  : "bg-[var(--border-soft)] text-[var(--text-muted)] cursor-not-allowed"
              )}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Checkbox cell for bulk selection in list tables */
export function BulkCheckbox({
  id,
  selected,
  onToggle,
}: {
  id: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
      className="p-1 rounded hover:bg-[var(--surface-subtle)] transition-colors"
    >
      {selected ? (
        <CheckSquare className="h-4 w-4 text-[var(--brand-primary)]" />
      ) : (
        <Square className="h-4 w-4 text-[var(--text-muted)]" />
      )}
    </button>
  );
}
