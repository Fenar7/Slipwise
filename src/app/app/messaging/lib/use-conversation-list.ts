"use client";
import { useState, useEffect, useCallback } from "react";
import type { ApiConversationSummary } from "./mappers";

export function useConversationList() {
  const [channels, setChannels] = useState<ApiConversationSummary[]>([]);
  const [dms, setDms] = useState<ApiConversationSummary[]>([]);
  const [groups, setGroups] = useState<ApiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/messaging/conversations", { credentials: "same-origin" });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load conversations");
        setChannels([]); setDms([]); setGroups([]); return;
      }
      const list: ApiConversationSummary[] = payload.data?.conversations ?? [];
      setChannels(list.filter((c) => c.type === "CHANNEL"));
      setDms(list.filter((c) => c.type === "DM"));
      setGroups(list.filter((c) => c.type === "GROUP"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setChannels([]); setDms([]); setGroups([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const empty = !loading && !error && channels.length === 0 && dms.length === 0 && groups.length === 0;
  return { channels, dms, groups, loading, error, empty };
}
