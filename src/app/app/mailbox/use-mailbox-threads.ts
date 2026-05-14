"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MailboxThreadReadShape } from "@/lib/mailbox/read-shapes";

const SEARCH_DEBOUNCE_MS = 300;

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

  // Debounce search query to avoid hammering the API on every keystroke
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(
    params.searchQuery,
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(params.searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [params.searchQuery]);

  const abortControllerRef = useRef<AbortController | null>(null);

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
      const trimmedQuery = debouncedSearchQuery?.trim();
      if (trimmedQuery) {
        url.searchParams.set("searchQuery", trimmedQuery);
      }
      if (params.limit) {
        url.searchParams.set("limit", String(params.limit));
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      return url.toString();
    },
    [
      params.connectionId,
      params.status,
      params.unreadOnly,
      params.isFlagged,
      params.assignee,
      params.limit,
      debouncedSearchQuery,
    ],
  );

  const fetchThreads = useCallback(
    async (append = false, cursor?: string) => {
      // Cancel any in-flight request to prevent out-of-order UI updates
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(cursor), {
          signal: controller.signal,
        });
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
        if (err instanceof DOMException && err.name === "AbortError") {
          // Silently ignore aborted requests
          return;
        }
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
