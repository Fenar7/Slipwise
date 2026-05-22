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
  };
}

export function resolveMailboxSyncPresentation(
  connection: SyncCapableConnection,
): MailboxSyncPresentation {
  return connection.sync ?? buildFallbackSyncPresentation(connection);
}

export function withPendingSyncPresentation(
  sync: MailboxSyncPresentation,
  isPending: boolean,
): MailboxSyncPresentation {
  if (!isPending || sync.isSyncing) {
    return sync;
  }

  return {
    ...sync,
    state: "running",
    isSyncing: true,
    currentRunStartedAt: new Date().toISOString(),
    stageLabel:
      sync.state === "completed_never_imported"
        ? "Initial import in progress"
        : "Checking for new mail",
    detailLabel:
      sync.state === "completed_never_imported"
        ? "Importing recent threads. Messages will appear automatically."
        : "Checking Gmail for new messages and updates.",
  };
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
