"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { listTags } from "@/lib/tags/tag-service";
import type { TagData } from "@/lib/tags/tag-service";
import { Tag } from "lucide-react";

interface TagFilterChipsProps {
  extraParams?: Record<string, string | undefined>;
  className?: string;
}

export function TagFilterChips({ extraParams = {}, className }: TagFilterChipsProps) {
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const currentTagIds = searchParams.getAll("tagId");

  useEffect(() => {
    let cancelled = false;
    listTags({ includeArchived: false }).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setTags(result.data);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading || tags.length === 0) return null;

  function buildUrl(tagId: string): string {
    const params = new URLSearchParams();
    const isActive = currentTagIds.includes(tagId);

    // Toggle: if active, remove it; if inactive, add it (match any)
    const newTagIds = isActive
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];

    // Copy other search params
    searchParams.forEach((value, key) => {
      if (key !== "tagId" && key !== "page") {
        params.set(key, value);
      }
    });

    // Add new tagIds
    newTagIds.forEach((id) => params.append("tagId", id));

    // Reset page to 1
    params.delete("page");

    return `?${params.toString()}`;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Tag className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
      {tags.map((tag) => {
        const isActive = currentTagIds.includes(tag.id);
        return (
          <Link
            key={tag.id}
            href={buildUrl(tag.id)}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-[var(--brand-primary)] text-white"
                : "bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-soft)]"
            )}
            style={isActive ? {} : tag.color ? {
              borderColor: `${tag.color}40`,
              borderWidth: "1px",
              borderStyle: "solid",
            } : undefined}
          >
            {tag.name}
          </Link>
        );
      })}
    </div>
  );
}
