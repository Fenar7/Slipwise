"use client";

import { useState, useEffect, useCallback } from "react";
import type { MailboxConnection } from "./types";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";
import { buildFallbackSyncPresentation } from "./mailbox-sync-ui";

interface ApiConnectionItem {
  id: string;
  orgId: string;
  provider: string;
  emailAddress: string;
  displayName: string;
  status: "ACTIVE" | "RECONNECT_REQUIRED" | "DEGRADED" | "DISCONNECTED";
  lastSyncAt: string | null;
  lastSyncError: string | null;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
  sync?: MailboxSyncPresentation;
}

interface UseMailboxConnectionsResult {
  connections: MailboxConnection[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function mapApiToConnection(item: ApiConnectionItem): MailboxConnection {
  const status = item.status
    .toLowerCase()
    .replace("active", "connected")
    .replace("reconnect_required", "reconnect_required")
    .replace("degraded", "degraded")
    .replace("disconnected", "disconnected") as MailboxConnection["status"];
  return {
    id: item.id,
    orgId: item.orgId,
    provider: item.provider.toLowerCase() as "gmail" | "zoho",
    // Use ID as slug for URL routing since there's no dedicated slug field
    slug: item.id,
    emailAddress: item.emailAddress,
    displayName: item.displayName,
    status,
    lastSyncAt: item.lastSyncAt,
    lastSyncError: item.lastSyncError,
    lastSyncErrorCategory: null,
    sync:
      item.sync ??
      buildFallbackSyncPresentation({
        status,
        lastSyncAt: item.lastSyncAt,
        lastSyncError: item.lastSyncError,
      }),
    unreadCount: 0,
    inboxCount: 0,
  };
}

const SYNC_POLL_INTERVAL_MS = 5000;

export function useMailboxConnections(): UseMailboxConnectionsResult {
  const [connections, setConnections] = useState<MailboxConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mailbox/connections/visible");
      if (!res.ok) {
        throw new Error(`Failed to fetch connections: ${res.status}`);
      }
      const data = await res.json();
      // The API returns { accessible: [...], restricted: [...] }
      const accessible: ApiConnectionItem[] = data.accessible ?? [];
      setConnections(accessible.map(mapApiToConnection));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const hasActiveSync = connections.some((connection) => connection.sync?.isSyncing);
  // Also poll when waiting for first sync — ensures we pick up sync completion
  // within the poll window rather than waiting for a user-triggered refetch.
  const hasNeverImported = connections.some(
    (connection) => connection.sync?.state === "completed_never_imported",
  );
  const shouldPoll = hasActiveSync || hasNeverImported;

  useEffect(() => {
    if (!shouldPoll) return;

    const timer = window.setInterval(() => {
      void fetchConnections();
    }, SYNC_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [fetchConnections, shouldPoll]);

  return {
    connections,
    isLoading,
    error,
    refetch: fetchConnections,
  };
}
