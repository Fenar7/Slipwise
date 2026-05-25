"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { ApiTaskSummary } from "./mappers";

export type TaskErrorType = "none" | "network" | "restricted" | "unknown";

export function useConversationTasks(conversationId: string | null) {
  const [tasks, setTasks] = useState<ApiTaskSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<TaskErrorType>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTasks(null);
    setLoading(true);
    setErrorType("none");
    setErrorMessage(null);

    try {
      const url = id === "global" ? "/api/messaging/tasks" : `/api/messaging/conversations/${id}/tasks`;
      const res = await fetch(url, {
        credentials: "same-origin",
        signal: ctrl.signal,
      });
      const payload = await res.json();
      if (ctrl.signal.aborted) return;

      if (!res.ok || !payload.success) {
        const code = payload.error?.code ?? "";
        if (res.status === 404 || code === "NOT_FOUND" || res.status === 403 || code === "FORBIDDEN") {
          setErrorType("restricted");
        } else {
          setErrorType("unknown");
        }
        setErrorMessage(payload.error?.message ?? "Failed to load tasks");
        return;
      }

      setTasks(payload.data as ApiTaskSummary[]);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setErrorType("network");
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setTasks(null);
      setLoading(false);
      setErrorType("none");
      setErrorMessage(null);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    load(conversationId);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [conversationId, load]);

  const refresh = useCallback(() => {
    if (conversationId) load(conversationId);
  }, [conversationId, load]);

  return { tasks, loading, errorType, errorMessage, refresh };
}
