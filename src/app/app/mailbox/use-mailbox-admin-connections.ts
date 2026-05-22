"use client";

import { useState, useEffect, useCallback } from "react";
import type { MailboxAdminConnection, MailboxConnectionStatus, MailboxProvider } from "./types";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";
import { buildFallbackSyncPresentation } from "./mailbox-sync-ui";

export type MailboxAdminConnectionsErrorType =
  | "unauthorized"
  | "forbidden"
  | "server"
  | null;

interface UseMailboxAdminConnectionsResult {
  connections: MailboxAdminConnection[];
  isLoading: boolean;
  error: string | null;
  errorType: MailboxAdminConnectionsErrorType;
  refetch: () => void;
}

interface ApiMailboxSyncPresentation extends MailboxSyncPresentation {}

function mapStatus(status: string): MailboxConnectionStatus {
  const s = status.toLowerCase();
  if (s === "active") return "connected";
  if (s === "reconnect_required") return "reconnect_required";
  if (s === "degraded") return "degraded";
  return "disconnected";
}

function mapApiToAdminConnection(item: unknown): MailboxAdminConnection {
  const i = item as Record<string, unknown>;
  const status = mapStatus(String(i.status));
  const lastSyncAt = i.lastSyncAt ? String(i.lastSyncAt) : null;
  const lastSyncError = i.lastSyncError ? String(i.lastSyncError) : null;
  return {
    id: String(i.id),
    orgId: String(i.orgId),
    provider: String(i.provider).toLowerCase() as MailboxProvider,
    slug: String(i.id),
    emailAddress: String(i.emailAddress),
    displayName: String(i.displayName),
    status,
    lastSyncAt,
    lastSyncError,
    sync:
      (i.sync as ApiMailboxSyncPresentation | undefined) ??
      buildFallbackSyncPresentation({
        status,
        lastSyncAt,
        lastSyncError,
      }),
    connectedBy: String(i.connectedBy),
    visibilityPolicy: String(i.visibilityPolicy ?? "org_shared"),
    updatedAt: i.updatedAt ? String(i.updatedAt) : undefined,
  };
}

const SYNC_POLL_INTERVAL_MS = 5000;

export function useMailboxAdminConnections(): UseMailboxAdminConnectionsResult {
  const [connections, setConnections] = useState<MailboxAdminConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<MailboxAdminConnectionsErrorType>(null);

  const fetchConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorType(null);
    try {
      const res = await fetch("/api/mailbox/connections");
      if (!res.ok) {
        if (res.status === 401) {
          setErrorType("unauthorized");
          setError("Unauthorized");
          return;
        }
        if (res.status === 403) {
          setErrorType("forbidden");
          setError("Forbidden");
          return;
        }
        throw new Error(`Failed to fetch connections: ${res.status}`);
      }
      const data = (await res.json()) as { connections?: unknown[] };
      const list = data.connections ?? [];
      setConnections(list.map(mapApiToAdminConnection));
    } catch (err) {
      setErrorType("server");
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const hasActiveSync = connections.some((connection) => connection.sync?.isSyncing);

  useEffect(() => {
    if (!hasActiveSync) return;

    const timer = window.setInterval(() => {
      void fetchConnections();
    }, SYNC_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [fetchConnections, hasActiveSync]);

  return {
    connections,
    isLoading,
    error,
    errorType,
    refetch: fetchConnections,
  };
}
