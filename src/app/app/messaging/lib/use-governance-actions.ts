"use client";

import { useState, useCallback } from "react";

export function useGovernanceActions() {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback(async (conversationId: string, endpoint: string): Promise<boolean> => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/${endpoint}`, {
        method: "PATCH",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message ?? `Failed to ${endpoint}`);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      return false;
    } finally {
      setActing(false);
    }
  }, []);

  const archive = useCallback((conversationId: string) => patch(conversationId, "archive"), [patch]);
  const unarchive = useCallback((conversationId: string) => patch(conversationId, "unarchive"), [patch]);
  const lock = useCallback((conversationId: string) => patch(conversationId, "lock"), [patch]);
  const unlock = useCallback((conversationId: string) => patch(conversationId, "unlock"), [patch]);

  return { archive, unarchive, lock, unlock, acting, error, clearError: () => setError(null) };
}
