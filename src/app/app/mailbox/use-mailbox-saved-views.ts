"use client";

import { useState, useCallback, useEffect } from "react";
import type { ActiveFilter, SupportedSavedViewSmartViewId } from "./types";

export interface SavedViewItem {
  id: string;
  label: string;
  filters: ActiveFilter[];
  searchQuery: string;
  smartViewId: SupportedSavedViewSmartViewId | null;
  createdAt: string;
}

export interface UseMailboxSavedViewsReturn {
  views: SavedViewItem[];
  isLoading: boolean;
  error: string | null;
  createView: (params: {
    label: string;
    filters: ActiveFilter[];
    searchQuery?: string;
    smartViewId?: SupportedSavedViewSmartViewId | null;
  }) => Promise<void>;
  deleteView: (id: string) => Promise<void>;
}

export function useMailboxSavedViews(): UseMailboxSavedViewsReturn {
  const [views, setViews] = useState<SavedViewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchViews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mailbox/saved-views");
      if (!res.ok) throw new Error("Failed to load saved views");
      const data = (await res.json()) as { views: SavedViewItem[] };
      setViews(data.views);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchViews();
  }, [fetchViews]);

  const createView = useCallback(
    async (params: {
      label: string;
      filters: ActiveFilter[];
      searchQuery?: string;
      smartViewId?: SupportedSavedViewSmartViewId | null;
    }) => {
      setError(null);
      try {
        const res = await fetch("/api/mailbox/saved-views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to save view");
        }
        await fetchViews();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [fetchViews],
  );

  const deleteView = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const res = await fetch(`/api/mailbox/saved-views/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete view");
        setViews((prev) => prev.filter((v) => v.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [],
  );

  return { views, isLoading, error, createView, deleteView };
}
