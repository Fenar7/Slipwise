"use client";
import { useState, useCallback, useRef } from "react";

export interface SendThreadReplyResult {
  id: string;
  conversationId: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export function useSendThreadReply() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef<string | null>(null);

  const send = useCallback(async (
    conversationId: string,
    threadId: string,
    body: string,
  ): Promise<SendThreadReplyResult | null> => {
    const guardKey = `${conversationId}:${threadId}::${Date.now()}`;
    guardRef.current = guardKey;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/threads/${threadId}/replies`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return null;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to send reply");
        return null;
      }
      return payload.data as SendThreadReplyResult;
    } catch (err) {
      if (guardRef.current !== guardKey) return null;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      return null;
    } finally {
      if (guardRef.current === guardKey) setSending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { send, sending, error, clearError };
}
