"use client";

import { useState, useCallback } from "react";

export type ThreadAction =
  | "mark_read"
  | "mark_unread"
  | "archive"
  | "unarchive"
  | "flag"
  | "unflag"
  | "assign"
  | "unassign"
  | "set_status";

export type ThreadActionPayload =
  | { assigneeId: string }
  | { status: string }
  | undefined;

export interface UseThreadActionResult {
  isLoading: boolean;
  error: string | null;
  performAction: (
    threadId: string,
    action: ThreadAction,
    payload?: ThreadActionPayload,
  ) => Promise<boolean>;
}

export interface ThreadActionResponse {
  success: boolean;
  thread: Record<string, unknown> | null;
  action: ThreadAction;
}

export function useThreadAction(
  onSuccess?: (threadId: string, action: ThreadAction) => void,
): UseThreadActionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performAction = useCallback(
    async (
      threadId: string,
      action: ThreadAction,
      payload?: ThreadActionPayload,
    ): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/mailbox/threads/${encodeURIComponent(threadId)}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...(payload ?? {}) }),
          },
        );

        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as ThreadActionResponse;
        if (!data.success) {
          throw new Error("Action was not successful");
        }

        onSuccess?.(threadId, action);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to perform action";
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess],
  );

  return { isLoading, error, performAction };
}
