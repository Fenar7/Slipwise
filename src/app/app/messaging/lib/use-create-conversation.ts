"use client";

import { useState, useCallback } from "react";

export type CreateConversationType = "CHANNEL" | "GROUP" | "DM";

export interface CreateConversationResult {
  id: string;
  type: CreateConversationType;
  name: string | null;
  duplicate?: boolean;
}

export function useCreateConversation() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (
    type: CreateConversationType,
    payload: Record<string, unknown>,
  ): Promise<CreateConversationResult | null> => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/messaging/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message ?? "Failed to create conversation");
        return null;
      }
      return {
        id: data.data.conversation.id,
        type: data.data.conversation.type as CreateConversationType,
        name: data.data.conversation.name ?? null,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      return null;
    } finally {
      setCreating(false);
    }
  }, []);

  return { create, creating, error, clearError: () => setError(null) };
}
