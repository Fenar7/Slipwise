"use client";
import { useState, useCallback, useRef } from "react";

export interface DraftData {
  id: string;
  body: string;
  updatedAt: string;
}

export function useDrafts() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef<string | null>(null);

  const fetchDraft = useCallback(async (
    conversationId: string,
    threadId?: string | null,
  ): Promise<DraftData | null> => {
    const guardKey = `fetch::${conversationId}::${threadId ?? "top"}::${Date.now()}`;
    guardRef.current = guardKey;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/messaging/conversations/${conversationId}/draft`, window.location.origin);
      if (threadId) url.searchParams.set("threadId", threadId);
      const res = await fetch(url.toString(), {
        method: "GET",
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return null;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load draft");
        return null;
      }
      return payload.data.draft as DraftData | null;
    } catch (err) {
      if (guardRef.current !== guardKey) return null;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      return null;
    } finally {
      if (guardRef.current === guardKey) setLoading(false);
    }
  }, []);

  const saveDraft = useCallback(async (
    conversationId: string,
    body: string,
    threadId?: string | null,
  ): Promise<DraftData | null> => {
    const guardKey = `save::${conversationId}::${threadId ?? "top"}::${Date.now()}`;
    guardRef.current = guardKey;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/draft`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          threadId: threadId ?? null,
        }),
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return null;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to save draft");
        return null;
      }
      return payload.data as DraftData;
    } catch (err) {
      if (guardRef.current !== guardKey) return null;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      return null;
    } finally {
      if (guardRef.current === guardKey) setSaving(false);
    }
  }, []);

  const deleteDraft = useCallback(async (
    conversationId: string,
    threadId?: string | null,
  ): Promise<boolean> => {
    const guardKey = `delete::${conversationId}::${threadId ?? "top"}::${Date.now()}`;
    guardRef.current = guardKey;
    setSaving(true);
    setError(null);
    try {
      const url = new URL(`/api/messaging/conversations/${conversationId}/draft`, window.location.origin);
      if (threadId) url.searchParams.set("threadId", threadId);
      const res = await fetch(url.toString(), {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return false;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to delete draft");
        return false;
      }
      return true;
    } catch (err) {
      if (guardRef.current !== guardKey) return false;
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      return false;
    } finally {
      if (guardRef.current === guardKey) setSaving(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { fetchDraft, saveDraft, deleteDraft, saving, loading, error, clearError };
}
