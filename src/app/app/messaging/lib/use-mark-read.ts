"use client";
import { useState, useCallback, useRef } from "react";

export interface MarkReadResult {
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  isMuted: boolean;
}

export function useMarkRead() {
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef<string | null>(null);

  const markRead = useCallback(async (conversationId: string): Promise<MarkReadResult | null> => {
    const guardKey = `${conversationId}::${Date.now()}`;
    guardRef.current = guardKey;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/read`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return null;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to mark as read");
        return null;
      }
      return payload.data?.readState as MarkReadResult ?? null;
    } catch (err) {
      if (guardRef.current !== guardKey) return null;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      return null;
    } finally {
      if (guardRef.current === guardKey) setMarking(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { markRead, marking, error, clearError };
}
