"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { MailboxThreadReadShape } from "@/lib/mailbox/read-shapes";
import type { MailboxFolder } from "./types";

const SEARCH_DEBOUNCE_MS = 300;

export interface MailboxThreadListResponse {
  threads: MailboxThreadReadShape[];
  nextCursor: string | null;
  totalCount: number;
}

export interface UseMailboxThreadsParams {
  connectionId?: string;
  folder?: MailboxFolder;
  status?: string;
  unreadOnly?: boolean;
  isFlagged?: boolean;
  assignee?: "me" | "none";
  searchQuery?: string;
  limit?: number;
  enabled?: boolean;
}

export interface UseMailboxThreadsResult {
  threads: MailboxThreadReadShape[];
  totalCount: number;
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => void;
}

function mergeUniqueThreads(
  previousThreads: MailboxThreadReadShape[],
  nextThreads: MailboxThreadReadShape[],
): MailboxThreadReadShape[] {
  const mergedThreads = [...previousThreads];
  const seenThreadIds = new Set(previousThreads.map((thread) => thread.id));

  for (const thread of nextThreads) {
    if (seenThreadIds.has(thread.id)) {
      continue;
    }
    seenThreadIds.add(thread.id);
    mergedThreads.push(thread);
  }

  return mergedThreads;
}

export function useMailboxThreads(
  params: UseMailboxThreadsParams,
): UseMailboxThreadsResult {
  const [threads, setThreads] = useState<MailboxThreadReadShape[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  const initialAbortControllerRef = useRef<AbortController | null>(null);
  const appendAbortControllerRef = useRef<AbortController | null>(null);
  const activeQueryVersionRef = useRef(0);
  const inFlightAppendCursorRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const isLoadingMoreRef = useRef(false);

  const buildUrl = useCallback(
    (cursor?: string) => {
      const url = new URL("/api/mailbox/threads", window.location.origin);
      if (params.connectionId) {
        url.searchParams.set("connectionId", params.connectionId);
      }
      if (params.folder) {
        url.searchParams.set("folder", params.folder);
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
      params.folder,
      params.status,
      params.unreadOnly,
      params.isFlagged,
      params.assignee,
      params.limit,
      debouncedSearchQuery,
    ],
  );

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        connectionId: params.connectionId ?? null,
        folder: params.folder ?? null,
        status: params.status ?? null,
        unreadOnly: params.unreadOnly ?? null,
        isFlagged: params.isFlagged ?? null,
        assignee: params.assignee ?? null,
        searchQuery: debouncedSearchQuery?.trim() ?? "",
        limit: params.limit ?? null,
        enabled: params.enabled ?? true,
      }),
    [
      params.connectionId,
      params.folder,
      params.status,
      params.unreadOnly,
      params.isFlagged,
      params.assignee,
      params.limit,
      params.enabled,
      debouncedSearchQuery,
    ],
  );

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  const fetchThreads = useCallback(
    async ({
      append = false,
      cursor,
      queryVersion,
    }: {
      append?: boolean;
      cursor?: string;
      queryVersion: number;
    }) => {
      const controller = new AbortController();

      if (append) {
        if (!cursor || isLoadingRef.current || isLoadingMoreRef.current) {
          return;
        }
        appendAbortControllerRef.current = controller;
        inFlightAppendCursorRef.current = cursor;
        setIsLoadingMore(true);
      } else {
        initialAbortControllerRef.current = controller;
        setIsLoading(true);
      }

      setError(null);
      try {
        const res = await fetch(buildUrl(cursor), {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch threads: ${res.status}`);
        }
        const data: MailboxThreadListResponse = await res.json();

        if (queryVersion !== activeQueryVersionRef.current) {
          return;
        }

        setThreads((prev) =>
          append ? mergeUniqueThreads(prev, data.threads) : data.threads,
        );
        setTotalCount(data.totalCount);
        setNextCursor(data.nextCursor);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Silently ignore aborted requests
          return;
        }

        if (queryVersion === activeQueryVersionRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (append) {
          if (appendAbortControllerRef.current === controller) {
            appendAbortControllerRef.current = null;
            inFlightAppendCursorRef.current = null;
          }
          if (queryVersion === activeQueryVersionRef.current) {
            setIsLoadingMore(false);
          }
        } else {
          if (initialAbortControllerRef.current === controller) {
            initialAbortControllerRef.current = null;
          }
          if (queryVersion === activeQueryVersionRef.current) {
            setIsLoading(false);
          }
        }
      }
    },
    [buildUrl],
  );

  useEffect(() => {
    return () => {
      initialAbortControllerRef.current?.abort();
      appendAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    initialAbortControllerRef.current?.abort();
    appendAbortControllerRef.current?.abort();
    inFlightAppendCursorRef.current = null;

    if (params.enabled === false) {
      activeQueryVersionRef.current += 1;
      setThreads([]);
      setTotalCount(0);
      setNextCursor(null);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }

    const queryVersion = activeQueryVersionRef.current + 1;
    activeQueryVersionRef.current = queryVersion;

    setThreads([]);
    setTotalCount(0);
    setNextCursor(null);
    setIsLoading(false);
    setIsLoadingMore(false);
    setError(null);

    void fetchThreads({ queryVersion });
  }, [fetchThreads, params.enabled, queryKey]);

  const refetch = useCallback(() => {
    if (params.enabled === false) {
      return;
    }

    initialAbortControllerRef.current?.abort();
    appendAbortControllerRef.current?.abort();
    inFlightAppendCursorRef.current = null;

    const queryVersion = activeQueryVersionRef.current + 1;
    activeQueryVersionRef.current = queryVersion;

    void fetchThreads({ queryVersion });
  }, [fetchThreads, params.enabled]);

  const loadMore = useCallback(() => {
    if (params.enabled === false) {
      return;
    }

    const cursor = nextCursorRef.current;
    if (
      !cursor ||
      isLoadingRef.current ||
      isLoadingMoreRef.current ||
      inFlightAppendCursorRef.current === cursor
    ) {
      return;
    }

    void fetchThreads({
      append: true,
      cursor,
      queryVersion: activeQueryVersionRef.current,
    });
  }, [fetchThreads, params.enabled]);

  return {
    threads,
    totalCount,
    nextCursor,
    isLoading,
    isLoadingMore,
    hasMore: nextCursor !== null,
    error,
    refetch,
    loadMore,
  };
}
