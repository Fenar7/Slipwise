"use client";

import { useState, useCallback } from "react";

export interface UseReactionsResult {
  isLoading: boolean;
  error: string | null;
  addReaction: (conversationId: string, messageId: string, value: string) => Promise<boolean>;
  removeReaction: (conversationId: string, messageId: string, value: string) => Promise<boolean>;
}

export function useReactions(onSuccess?: () => void): UseReactionsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (
      conversationId: string,
      messageId: string,
      value: string,
      action: "add" | "remove"
    ): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, value }),
          }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        onSuccess?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update reaction");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess]
  );

  const addReaction = useCallback(
    (conversationId: string, messageId: string, value: string) =>
      mutate(conversationId, messageId, value, "add"),
    [mutate]
  );

  const removeReaction = useCallback(
    (conversationId: string, messageId: string, value: string) =>
      mutate(conversationId, messageId, value, "remove"),
    [mutate]
  );

  return { isLoading, error, addReaction, removeReaction };
}
