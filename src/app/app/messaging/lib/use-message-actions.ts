"use client";

import { useState, useCallback } from "react";

export interface UseMessageActionsResult {
  isLoading: boolean;
  error: string | null;
  editMessage: (conversationId: string, messageId: string, body: string) => Promise<boolean>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<boolean>;
}

export function useMessageActions(onSuccess?: () => void): UseMessageActionsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editMessage = useCallback(
    async (conversationId: string, messageId: string, body: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        onSuccess?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to edit message");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess]
  );

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "DELETE",
          }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        onSuccess?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete message");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess]
  );

  return { isLoading, error, editMessage, deleteMessage };
}
