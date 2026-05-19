"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationMessage } from "../types";
import type { ApiConversationDetail } from "./mappers";
import { toFrontendThreadReplies } from "./mappers";

export interface UseThreadRepliesResult {
  replies: ConversationMessage[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useThreadReplies(
  conversationId: string | null,
  threadId: string | null,
  detail: ApiConversationDetail | null,
): UseThreadRepliesResult {
  const [replies, setReplies] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const staleGuardRef = useRef<string | null>(null);

  const fetchReplies = useCallback(async () => {
    // Cancel any in-flight request before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    if (!conversationId || !threadId) {
      setReplies([]);
      setLoading(false);
      return;
    }

    const guardKey = `${conversationId}:${threadId}`;
    staleGuardRef.current = guardKey;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/messaging/conversations/${conversationId}/threads/${threadId}/replies`,
        { credentials: "same-origin", signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (staleGuardRef.current !== guardKey) return;

      const payload = await res.json();
      if (staleGuardRef.current !== guardKey) return;

      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load replies");
        return;
      }
      const rawReplies = (payload.data?.replies ?? payload.data ?? []) as unknown[];
      setReplies(toFrontendThreadReplies(rawReplies as Parameters<typeof toFrontendThreadReplies>[0], detail ?? { id: "", orgId: "", type: "CHANNEL", name: null, description: null, visibility: null, archivedAt: null, lockedAt: null, createdBy: "", createdAt: "", updatedAt: "", participantCount: 0, canSend: false, participants: [], messages: [], threads: [], readState: null }));
    } catch (err) {
      if (controller.signal.aborted) return;
      if (staleGuardRef.current !== guardKey) return;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      if (staleGuardRef.current === guardKey) {
        setLoading(false);
      }
    }
  }, [conversationId, threadId, detail]);

  useEffect(() => {
    fetchReplies();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchReplies]);

  return { replies, loading, error, refresh: fetchReplies };
}
