"use client";
import { useState, useCallback, useRef } from "react";

export interface SendMessageResult {
  id: string;
  conversationId: string;
  threadId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
}

export function useSendMessage() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef<string | null>(null);

  const send = useCallback(async (
    conversationId: string,
    body: string,
    threadId?: string | null,
  ): Promise<SendMessageResult | null> => {
    const guardKey = `${conversationId}::${Date.now()}`;
    guardRef.current = guardKey;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, threadId: threadId ?? null }),
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return null;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to send message");
        return null;
      }
      return payload.data as SendMessageResult;
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
