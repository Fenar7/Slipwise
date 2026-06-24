"use client";

import { useCallback, useEffect, useState } from "react";
import type { MailboxProviderDraftDetailReadShape } from "@/lib/mailbox/read-shapes";

export interface UseMailboxProviderDraftDetailResult {
  detail: MailboxProviderDraftDetailReadShape | null;
  isLoading: boolean;
  error: string | null;
  isNotFound: boolean;
  refetch: () => void;
}

export function useMailboxProviderDraftDetail(
  draftId: string | null,
  enabled = true,
): UseMailboxProviderDraftDetailResult {
  const [detail, setDetail] = useState<MailboxProviderDraftDetailReadShape | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!enabled || !draftId) {
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
      const res = await fetch(`/api/mailbox/drafts/${encodeURIComponent(draftId)}`);
      if (res.status === 404) {
        setDetail(null);
        setIsNotFound(true);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        setDetail(null);
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      const data = (await res.json()) as { draft: MailboxProviderDraftDetailReadShape | null };
      setDetail(data.draft ?? null);
      setIsNotFound(false);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Failed to fetch draft detail");
    } finally {
      setIsLoading(false);
    }
  }, [draftId, enabled]);

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
