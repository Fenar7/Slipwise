"use client";

import { useState, useEffect, useCallback } from "react";
import type { MailboxThreadReadShape } from "@/lib/mailbox/read-shapes";

export interface MailboxThreadListResponse {
  threads: MailboxThreadReadShape[];
  nextCursor: string | null;
  totalCount: number;
}

export interface UseMailboxThreadsParams {
  connectionId?: string;
  status?: string;
  unreadOnly?: boolean;
  isFlagged?: boolean;
  assignee?: "me" | "none";
  searchQuery?: string;
  limit?: number;
}

export interface UseMailboxThreadsResult {
  threads: MailboxThreadReadShape[];
  totalCount: number;
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => void;
}

export function useMailboxThreads(
  params: UseMailboxThreadsParams,
): UseMailboxThreadsResult {
  const [threads, setThreads] = useState<MailboxThreadReadShape[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildUrl = useCallback(
    (cursor?: string) => {
      const url = new URL("/api/mailbox/threads", window.location.origin);
      if (params.connectionId) {
        url.searchParams.set("connectionId", params.connectionId);
      }
      if (params.status) {
        url.searchParams.set("status", params.status);
      }
      if (params.unreadOnly) {
        url.searchParams.set("unreadOnly", "true");
      }
      if (params.isFlagged) {
        url.searchParams.set("isFlagged", "true");
      }
      if (params.assignee) {
        url.searchParams.set("assignee", params.assignee);
      }
      if (params.limit) {
        url.searchParams.set("limit", String(params.limit));
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      return url.toString();
    },
    [params],
  );

  const fetchThreads = useCallback(
    async (append = false, cursor?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(cursor));
        if (!res.ok) {
          throw new Error(`Failed to fetch threads: ${res.status}`);
        }
        const data: MailboxThreadListResponse = await res.json();
        setThreads((prev) =>
          append ? [...prev, ...data.threads] : data.threads,
        );
        setTotalCount(data.totalCount);
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [buildUrl],
  );

  useEffect(() => {
    fetchThreads(false);
  }, [fetchThreads]);

  const refetch = useCallback(() => {
    fetchThreads(false);
  }, [fetchThreads]);

  const loadMore = useCallback(() => {
    if (nextCursor) {
      fetchThreads(true, nextCursor);
    }
  }, [fetchThreads, nextCursor]);

  return {
    threads,
    totalCount,
    nextCursor,
    isLoading,
    error,
    refetch,
    loadMore,
  };
}
