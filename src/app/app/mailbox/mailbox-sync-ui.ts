"use client";

import type { MailboxConnection, MailboxAdminConnection } from "./types";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";

type SyncCapableConnection = Pick<
  MailboxConnection | MailboxAdminConnection,
  "status" | "lastSyncAt" | "lastSyncError" | "sync"
>;

export function buildFallbackSyncPresentation(
  connection: Pick<SyncCapableConnection, "status" | "lastSyncAt" | "lastSyncError">,
): MailboxSyncPresentation {
  if (
    connection.status === "reconnect_required" ||
    connection.status === "disconnected"
  ) {
    return {
      state: "idle",
      isSyncing: false,
      syncMode: null,
      triggerSource: null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: connection.lastSyncAt,
      lastRunStatus: null,
      lastErrorCategory: null,
      lastErrorSummary: connection.lastSyncError,
      lastRunThreadCount: null,
      lastRunMessageCount: null,
      stageLabel: "Sync unavailable",
      detailLabel:
        connection.lastSyncError ??
        "Reconnect this mailbox to resume syncing and importing new messages.",
      staleGmailCoverage: false,
    };
  }

  if (connection.lastSyncError) {
    return {
      state: "failed",
      isSyncing: false,
      syncMode: null,
      triggerSource: null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: connection.lastSyncAt,
      lastRunStatus: null,
      lastErrorCategory: null,
      lastErrorSummary: connection.lastSyncError,
      lastRunThreadCount: null,
      lastRunMessageCount: null,
      stageLabel: "Sync needs attention",
      detailLabel: connection.lastSyncError,
      staleGmailCoverage: false,
    };
  }

  if (!connection.lastSyncAt) {
    return {
      state: "completed_never_imported",
      isSyncing: false,
      syncMode: null,
      triggerSource: null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: null,
      lastRunStatus: null,
      lastErrorCategory: null,
      lastErrorSummary: null,
      lastRunThreadCount: null,
      lastRunMessageCount: null,
      stageLabel: "Connected, waiting for first sync",
      detailLabel:
        "This mailbox is connected. The first sync has not completed yet.",
      staleGmailCoverage: false,
    };
  }

  return {
    state: "completed",
    isSyncing: false,
    syncMode: null,
    triggerSource: null,
    currentRunId: null,
    currentRunStartedAt: null,
    lastCompletedAt: connection.lastSyncAt,
    lastRunStatus: null,
    lastErrorCategory: null,
    lastErrorSummary: null,
    lastRunThreadCount: null,
    lastRunMessageCount: null,
    stageLabel: "Mailbox up to date",
    detailLabel: "Recent messages are available in this mailbox.",
    staleGmailCoverage: false,
  };
}

export function resolveMailboxSyncPresentation(
  connection: SyncCapableConnection,
): MailboxSyncPresentation {
  return connection.sync ?? buildFallbackSyncPresentation(connection);
}

export function shouldAutoTriggerMailboxSync(sync: MailboxSyncPresentation): boolean {
  return sync.state === "completed_never_imported";
}

export function withPendingSyncPresentation(
  sync: MailboxSyncPresentation,
  isPending: boolean,
): MailboxSyncPresentation {
  // Client-side pending state is not authoritative enough to claim a real
  // running sync. Wait for the server-backed sync presentation to flip into
  // `running` so the UI does not show fake elapsed time or endless spinners.
  return sync;
}

export function formatSyncElapsed(startedAt: string | null): string | null {
  if (!startedAt) return null;

  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return null;
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s elapsed`;
  }

  return `${seconds}s elapsed`;
}

export function canManuallySyncMailbox(status: SyncCapableConnection["status"]): boolean {
  return status === "connected" || status === "degraded";
}
