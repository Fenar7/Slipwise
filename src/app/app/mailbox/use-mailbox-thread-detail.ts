"use client";

/**
 * Sprint 4.2 — Hook for fetching a single mailbox thread detail.
 */

import { useCallback, useEffect, useState } from "react";
import type { MailboxThreadDetailReadShape } from "@/lib/mailbox/read-shapes";

export interface UseMailboxThreadDetailResult {
  detail: MailboxThreadDetailReadShape | null;
  isLoading: boolean;
  error: string | null;
  isNotFound: boolean;
  refetch: () => void;
}

export function useMailboxThreadDetail(
  threadId: string | null,
): UseMailboxThreadDetailResult {
  const [detail, setDetail] = useState<MailboxThreadDetailReadShape | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!threadId) {
      setDetail(null);
      setError(null);
      setIsNotFound(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const res = await fetch(`/api/mailbox/threads/${encodeURIComponent(threadId)}`);

      if (res.status === 404) {
        setDetail(null);
        setIsNotFound(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        setDetail(null);
        setError(body.error ?? `HTTP ${res.status}`);
        setIsLoading(false);
        return;
      }

      const data = (await res.json()) as { thread: MailboxThreadDetailReadShape };
      setDetail(data.thread ?? null);
      setIsNotFound(false);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Failed to fetch thread detail");
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return {
    detail,
    isLoading,
    error,
    isNotFound,
    refetch: fetchDetail,
  };
}
