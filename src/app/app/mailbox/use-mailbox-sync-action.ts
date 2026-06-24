"use client";

import { useCallback, useState } from "react";

interface UseMailboxSyncActionOptions {
  onSuccess?: (connectionId: string) => void | Promise<void>;
}

interface UseMailboxSyncActionResult {
  triggerSync: (connectionId: string) => Promise<boolean>;
  isPending: (connectionId: string) => boolean;
  getError: (connectionId: string) => string | null;
  clearError: (connectionId: string) => void;
}

export function useMailboxSyncAction(
  options: UseMailboxSyncActionOptions = {},
): UseMailboxSyncActionResult {
  const [pendingByConnectionId, setPendingByConnectionId] = useState<Record<string, boolean>>({});
  const [errorByConnectionId, setErrorByConnectionId] = useState<Record<string, string | null>>({});

  const triggerSync = useCallback(async (connectionId: string) => {
    if (pendingByConnectionId[connectionId]) {
      return false;
    }

    setPendingByConnectionId((prev) => ({ ...prev, [connectionId]: true }));
    setErrorByConnectionId((prev) => ({ ...prev, [connectionId]: null }));

    try {
      const res = await fetch("/api/mailbox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxConnectionId: connectionId,
          triggerSource: "MANUAL",
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const safeError =
          typeof body.error === "string"
            ? body.error
            : typeof body.error?.summary === "string"
              ? body.error.summary
              : "Mailbox sync failed. Please try again.";
        throw new Error(safeError);
      }

      await options.onSuccess?.(connectionId);
      return true;
    } catch (error) {
      setErrorByConnectionId((prev) => ({
        ...prev,
        [connectionId]:
          error instanceof Error
            ? error.message
            : "Mailbox sync failed. Please try again.",
      }));
      return false;
    } finally {
      setPendingByConnectionId((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, [options, pendingByConnectionId]);

  const isPending = useCallback(
    (connectionId: string) => !!pendingByConnectionId[connectionId],
    [pendingByConnectionId],
  );

  const getError = useCallback(
    (connectionId: string) => errorByConnectionId[connectionId] ?? null,
    [errorByConnectionId],
  );

  const clearError = useCallback((connectionId: string) => {
    setErrorByConnectionId((prev) => ({ ...prev, [connectionId]: null }));
  }, []);

  return {
    triggerSync,
    isPending,
    getError,
    clearError,
  };
}
