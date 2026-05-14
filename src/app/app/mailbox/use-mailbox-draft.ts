"use client";

import { useState, useCallback, useRef } from "react";

export type DraftModeUppercase = "NEW" | "REPLY" | "REPLY_ALL" | "FORWARD";

export interface CreateDraftPayload {
  mailboxConnectionId: string;
  mode: DraftModeUppercase;
  threadId?: string | null;
  replyToMessageId?: string | null;
  fromIdentity?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface DraftResponse {
  id: string;
  orgId: string;
  mailboxConnectionId: string;
  threadId: string | null;
  mode: string;
  fromIdentity: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
  textBody: string | null;
  attachmentRefs: string[];
  status: string;
  lastAutosavedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraftResult {
  draft: DraftResponse;
  created: boolean;
}

export interface AutosavePayload {
  lastKnownUpdatedAt?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface AutosaveResult {
  draft: DraftResponse;
  stale: boolean;
}

export interface UseMailboxDraftResult {
  isLoading: boolean;
  isAutosaving: boolean;
  error: string | null;
  draftId: string | null;
  lastAutosavedAt: string | null;
  lastKnownUpdatedAt: string | null;
  createDraft: (payload: CreateDraftPayload) => Promise<DraftResponse | null>;
  autosave: (payload: AutosavePayload) => Promise<AutosaveResult | null>;
  discardDraft: () => Promise<boolean>;
  clearError: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 1200;

export function useMailboxDraft(): UseMailboxDraftResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveRef = useRef<AutosavePayload | null>(null);
  const currentDraftIdRef = useRef<string | null>(null);

  currentDraftIdRef.current = draftId;

  const clearError = useCallback(() => setError(null), []);

  const createDraft = useCallback(async (
    payload: CreateDraftPayload,
  ): Promise<DraftResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mailbox/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as CreateDraftResult;
      setDraftId(data.draft.id);
      setLastKnownUpdatedAt(data.draft.updatedAt);
      setLastAutosavedAt(data.draft.lastAutosavedAt);
      return data.draft;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create draft";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const performAutosave = useCallback(async (
    draftIdToSave: string,
    payload: AutosavePayload,
  ): Promise<AutosaveResult | null> => {
    setIsAutosaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/mailbox/drafts/${encodeURIComponent(draftIdToSave)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as AutosaveResult;
      setLastKnownUpdatedAt(data.draft.updatedAt);
      setLastAutosavedAt(data.draft.lastAutosavedAt);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to autosave draft";
      setError(message);
      return null;
    } finally {
      setIsAutosaving(false);
    }
  }, []);

  const autosave = useCallback(async (
    payload: AutosavePayload,
  ): Promise<AutosaveResult | null> => {
    const currentId = currentDraftIdRef.current;
    if (!currentId) {
      setError("No draft to autosave");
      return null;
    }

    // Debounce: cancel any pending autosave and schedule a new one
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    pendingAutosaveRef.current = payload;

    return new Promise((resolve) => {
      debounceRef.current = setTimeout(async () => {
        const pending = pendingAutosaveRef.current;
        if (!pending) {
          resolve(null);
          return;
        }

        // Include lastKnownUpdatedAt from state for stale-write guard
        const guardPayload: AutosavePayload = {
          ...pending,
          lastKnownUpdatedAt: lastKnownUpdatedAt ?? pending.lastKnownUpdatedAt,
        };

        const result = await performAutosave(currentId, guardPayload);
        resolve(result);
      }, AUTOSAVE_DEBOUNCE_MS);
    });
  }, [lastKnownUpdatedAt, performAutosave]);

  const discardDraft = useCallback(async (): Promise<boolean> => {
    const currentId = currentDraftIdRef.current;
    if (!currentId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/mailbox/drafts/${encodeURIComponent(currentId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setDraftId(null);
      setLastKnownUpdatedAt(null);
      setLastAutosavedAt(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to discard draft";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    isAutosaving,
    error,
    draftId,
    lastAutosavedAt,
    lastKnownUpdatedAt,
    createDraft,
    autosave,
    discardDraft,
    clearError,
  };
}
