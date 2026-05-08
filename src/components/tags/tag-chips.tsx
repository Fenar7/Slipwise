"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { TagData } from "@/lib/tags/tag-service";

export interface TagChipsProps {
  tags: TagData[];
  onRemove?: (tagId: string) => void;
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

function getTagColorChip(color: string | null) {
  if (!color) return {};
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return {
    backgroundColor: `rgba(${r},${g},${b},0.1)`,
    borderColor: `rgba(${r},${g},${b},0.25)`,
    color,
  };
}

export function TagChips({ tags, onRemove, max, size = "md", className }: TagChipsProps) {
  const visible = max ? tags.slice(0, max) : tags;
  const remaining = max && tags.length > max ? tags.length - max : 0;

  if (tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
            size === "sm" && "px-1.5 py-px text-[0.65rem]",
            onRemove && "pr-1",
            tag.isArchived && "opacity-60 line-through"
          )}
          style={getTagColorChip(tag.color)}
          title={tag.isArchived ? `${tag.name} (archived)` : tag.name}
        >
          {tag.name}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag.id);
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
              aria-label={`Remove ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-[var(--text-muted)] font-medium">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
