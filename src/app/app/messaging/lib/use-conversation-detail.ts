"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { ApiConversationDetail } from "./mappers";

export type DetailErrorType = "none" | "network" | "restricted" | "unknown";

export function useConversationDetail(conversationId: string | null) {
  const [detail, setDetail] = useState<ApiConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<DetailErrorType>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setErrorType("none"); setErrorMessage(null); setDetail(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${id}`, {
        credentials: "same-origin", signal: ctrl.signal,
      });
      const payload = await res.json();
      if (ctrl.signal.aborted) return;
      if (!res.ok || !payload.success) {
        const code = payload.error?.code ?? "";
        if (res.status === 404 || code === "NOT_FOUND") setErrorType("restricted");
        else setErrorType("unknown");
        setErrorMessage(payload.error?.message ?? "Failed to load conversation");
        return;
      }
      setDetail(payload.data as ApiConversationDetail);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setErrorType("network");
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setDetail(null); setLoading(false); setErrorType("none"); setErrorMessage(null); return;
    }
    load(conversationId);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [conversationId, load]);

  return { detail, loading, errorType, errorMessage };
}
