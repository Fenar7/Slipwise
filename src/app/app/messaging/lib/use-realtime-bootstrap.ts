"use client";
import { useState, useEffect, useCallback } from "react";

interface RealtimeSession {
  sessionToken: string;
  expiresAt: number;
  wsUrl: string;
  sessionId: string;
  serverTime: number;
  capabilities: string[];
}

export function useRealtimeBootstrap() {
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [ready, setReady] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    setLoading(true); setReady(false); setDegraded(false);
    try {
      const res = await fetch("/api/messaging/realtime/bootstrap", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) { setDegraded(true); setSession(null); return; }
      setSession(payload.data as RealtimeSession); setReady(true);
    } catch { setDegraded(true); setSession(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);
  return { session, ready, degraded, loading };
}
