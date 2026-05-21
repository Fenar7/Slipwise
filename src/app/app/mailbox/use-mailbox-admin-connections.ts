"use client";

import { useState, useEffect, useCallback } from "react";
import type { MailboxAdminConnection, MailboxConnectionStatus, MailboxProvider } from "./types";

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

function mapStatus(status: string): MailboxConnectionStatus {
  const s = status.toLowerCase();
  if (s === "active") return "connected";
  if (s === "reconnect_required") return "reconnect_required";
  if (s === "degraded") return "degraded";
  return "disconnected";
}

function mapApiToAdminConnection(item: unknown): MailboxAdminConnection {
  const i = item as Record<string, unknown>;
  return {
    id: String(i.id),
    orgId: String(i.orgId),
    provider: String(i.provider).toLowerCase() as MailboxProvider,
    slug: String(i.id),
    emailAddress: String(i.emailAddress),
    displayName: String(i.displayName),
    status: mapStatus(String(i.status)),
    lastSyncAt: i.lastSyncAt ? String(i.lastSyncAt) : null,
    lastSyncError: i.lastSyncError ? String(i.lastSyncError) : null,
    connectedBy: String(i.connectedBy),
    visibilityPolicy: String(i.visibilityPolicy ?? "org_shared"),
  };
}

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

  return {
    connections,
    isLoading,
    error,
    errorType,
    refetch: fetchConnections,
  };
}
