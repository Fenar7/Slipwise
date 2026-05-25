"use client";

import { useCallback, useEffect, useState } from "react";
import type { MailboxDraftListEntryReadShape } from "@/lib/mailbox/read-shapes";

interface DraftListResponse {
  drafts: MailboxDraftListEntryReadShape[];
}

export interface UseMailboxDraftsResult {
  drafts: MailboxDraftListEntryReadShape[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMailboxDrafts(
  connectionId?: string,
  enabled = true,
): UseMailboxDraftsResult {
  const [drafts, setDrafts] = useState<MailboxDraftListEntryReadShape[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !connectionId) {
      setDrafts([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL("/api/mailbox/drafts", window.location.origin);
        url.searchParams.set("connectionId", connectionId);

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Failed to fetch drafts: ${res.status}`);
        }

        const data = (await res.json()) as DraftListResponse;
        setDrafts(data.drafts ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(error instanceof Error ? error.message : "Failed to fetch drafts");
      } finally {
        setIsLoading(false);
      }
    }

    void run();

    return () => controller.abort();
  }, [connectionId, enabled, nonce]);

  return { drafts, isLoading, error, refetch };
}
