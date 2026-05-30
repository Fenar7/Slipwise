"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { ApiTaskSummary } from "./mappers";

export type TaskErrorType = "none" | "network" | "restricted" | "unknown";

export interface UseConversationTasksOptions {
  scope?: string;
  conversationId?: string;
}

export function useConversationTasks(
  conversationId: string | null,
  options?: UseConversationTasksOptions,
) {
  const [tasks, setTasks] = useState<ApiTaskSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<TaskErrorType>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string, opts?: UseConversationTasksOptions) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTasks(null);
    setLoading(true);
    setErrorType("none");
    setErrorMessage(null);
    setNextCursor(null);
    setHasMore(false);

    try {
      let url: string;
      if (id === "global") {
        const params = new URLSearchParams();
        if (opts?.scope) params.set("scope", opts.scope);
        if (opts?.conversationId) params.set("conversationId", opts.conversationId);
        const qs = params.toString();
        url = `/api/messaging/tasks${qs ? `?${qs}` : ""}`;
      } else {
        url = `/api/messaging/conversations/${id}/tasks`;
      }

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

      // Global endpoint returns { tasks, nextCursor, hasMore }
      // Scoped endpoint returns TaskSummary[] directly
      const data = payload.data;
      if (Array.isArray(data)) {
        setTasks(data as ApiTaskSummary[]);
      } else if (data && typeof data === "object" && "tasks" in data) {
        setTasks(data.tasks as ApiTaskSummary[]);
        setNextCursor(data.nextCursor as string | null);
        setHasMore(data.hasMore as boolean);
      } else {
        setTasks([]);
      }
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
      setNextCursor(null);
      setHasMore(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    load(conversationId, options);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [conversationId, load, options?.scope, options?.conversationId]);

  const refresh = useCallback(() => {
    if (conversationId) load(conversationId, options);
  }, [conversationId, load, options]);

  return { tasks, loading, errorType, errorMessage, refresh, nextCursor, hasMore };
}
