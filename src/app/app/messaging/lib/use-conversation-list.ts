"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiConversationSummary } from "./mappers";

export function useConversationList() {
  const [channels, setChannels] = useState<ApiConversationSummary[]>([]);
  const [dms, setDms] = useState<ApiConversationSummary[]>([]);
  const [groups, setGroups] = useState<ApiConversationSummary[]>([]);
  const [portals, setPortals] = useState<ApiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/messaging/conversations", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const payload = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load conversations");
        setChannels([]); setDms([]); setGroups([]); setPortals([]); return;
      }
      const list: ApiConversationSummary[] = payload.data?.conversations ?? [];
      setChannels(list.filter((c) => c.type === "CHANNEL"));
      setDms(list.filter((c) => c.type === "DM"));
      setGroups(list.filter((c) => c.type === "GROUP"));
      setPortals(list.filter((c) => c.type === "PORTAL"));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Network error");
      setChannels([]); setDms([]); setGroups([]); setPortals([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [load]);

  const empty = !loading && !error && channels.length === 0 && dms.length === 0 && groups.length === 0 && portals.length === 0;
  return { channels, dms, groups, portals, loading, error, empty, refresh: load };
}
