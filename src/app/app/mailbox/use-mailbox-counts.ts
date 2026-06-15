"use client";

import { useState, useEffect, useCallback } from "react";

export interface MailboxFolderCounts {
  inbox: number;
  sent: number;
  drafts: number;
  starred: number;
  spam: number;
  trash: number;
}

export interface MailboxCountsData {
  smartViews: {
    "all-inboxes": number;
    "unread": number;
    "assigned-to-me": number;
    "unassigned": number;
    "flagged": number;
    "waiting": number;
  };
  folders: Record<string, MailboxFolderCounts>;
}

interface UseMailboxCountsResult {
  counts: MailboxCountsData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const COUNTS_POLL_INTERVAL_MS = 5000;

export function useMailboxCounts(enabled = true): UseMailboxCountsResult {
  const [counts, setCounts] = useState<MailboxCountsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/mailbox/counts");
      if (!res.ok) {
        throw new Error(`Failed to fetch counts: ${res.status}`);
      }
      const data = await res.json();
      setCounts(data);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCounts();
  }, [fetchCounts, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchCounts({ silent: true });
    }, COUNTS_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [fetchCounts, enabled]);

  return {
    counts,
    isLoading,
    error,
    refetch: fetchCounts,
  };
}
