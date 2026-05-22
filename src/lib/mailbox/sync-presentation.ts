import type { MailboxConnectionRecord, MailboxSyncRunRecord } from "./domain-types";
import type { MailboxSyncPresentation } from "./sync-presentation-shape";

export interface MailboxSyncRunLookup {
  latestRun: MailboxSyncRunRecord | null;
  latestCompletedRun: MailboxSyncRunRecord | null;
}

function isActiveLease(record: MailboxConnectionRecord, now = Date.now()): boolean {
  return record.syncLeaseExpiresAt != null && record.syncLeaseExpiresAt.getTime() > now;
}

function parseSyncStats(stats: Record<string, unknown> | null): {
  threadCount: number | null;
  messageCount: number | null;
} {
  if (!stats) {
    return { threadCount: null, messageCount: null };
  }

  const threadCount =
    typeof stats.threadCount === "number" ? stats.threadCount : null;
  const messageCount =
    typeof stats.messageCount === "number" ? stats.messageCount : null;

  return { threadCount, messageCount };
}

export function buildMailboxSyncPresentation(
  record: MailboxConnectionRecord,
  syncRuns: Partial<MailboxSyncRunLookup> = {},
  now = Date.now(),
): MailboxSyncPresentation {
  const latestRun = syncRuns.latestRun ?? null;
  const latestCompletedRun = syncRuns.latestCompletedRun ?? null;
  const activeLease = isActiveLease(record, now);
  const isSyncing = activeLease || latestRun?.status === "RUNNING";

  const latestCompletedAt =
    latestCompletedRun?.completedAt?.toISOString() ??
    record.lastSyncAt?.toISOString() ??
    null;

  const latestRunStats = parseSyncStats(latestCompletedRun?.stats ?? null);
  const failedSummary =
    latestRun?.status === "FAILED"
      ? latestRun.errorSummary
      : record.lastSyncError;

  if (record.status === "RECONNECT_REQUIRED" || record.status === "DISCONNECTED") {
    return {
      state: "idle",
      isSyncing: false,
      syncMode: latestRun?.syncMode ?? null,
      triggerSource: latestRun?.triggerSource ?? null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: latestCompletedAt,
      lastRunStatus: latestRun?.status ?? null,
      lastErrorCategory: record.lastSyncErrorCategory ?? latestRun?.errorCategory ?? null,
      lastErrorSummary: failedSummary ?? null,
      lastRunThreadCount: latestRunStats.threadCount,
      lastRunMessageCount: latestRunStats.messageCount,
      stageLabel: "Sync unavailable",
      detailLabel:
        failedSummary ??
        "Reconnect this mailbox to resume syncing and importing new messages.",
    };
  }

  if (isSyncing) {
    const isInitial = latestRun?.syncMode !== "DELTA";
    return {
      state: "running",
      isSyncing: true,
      syncMode: latestRun?.syncMode ?? "INITIAL",
      triggerSource: latestRun?.triggerSource ?? null,
      currentRunId: latestRun?.id ?? null,
      currentRunStartedAt: latestRun?.startedAt?.toISOString() ?? null,
      lastCompletedAt: latestCompletedAt,
      lastRunStatus: latestRun?.status ?? "RUNNING",
      lastErrorCategory: null,
      lastErrorSummary: null,
      lastRunThreadCount: latestRunStats.threadCount,
      lastRunMessageCount: latestRunStats.messageCount,
      stageLabel: isInitial ? "Initial import in progress" : "Checking for new mail",
      detailLabel: isInitial
        ? "Importing recent threads. Messages will appear automatically."
        : "Checking Gmail for new messages and updates.",
    };
  }

  const hasFailedRun =
    latestRun?.status === "FAILED" ||
    (!!record.lastSyncError &&
      record.status !== "RECONNECT_REQUIRED" &&
      record.status !== "DISCONNECTED");

  if (hasFailedRun) {
    return {
      state: "failed",
      isSyncing: false,
      syncMode: latestRun?.syncMode ?? null,
      triggerSource: latestRun?.triggerSource ?? null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: latestCompletedAt,
      lastRunStatus: latestRun?.status ?? null,
      lastErrorCategory: latestRun?.errorCategory ?? record.lastSyncErrorCategory ?? null,
      lastErrorSummary: failedSummary ?? "Mailbox sync failed.",
      lastRunThreadCount: latestRunStats.threadCount,
      lastRunMessageCount: latestRunStats.messageCount,
      stageLabel: "Sync needs attention",
      detailLabel: failedSummary ?? "Mailbox sync failed.",
    };
  }

  if (!record.lastSyncAt) {
    return {
      state: "completed_never_imported",
      isSyncing: false,
      syncMode: latestRun?.syncMode ?? null,
      triggerSource: latestRun?.triggerSource ?? null,
      currentRunId: null,
      currentRunStartedAt: null,
      lastCompletedAt: null,
      lastRunStatus: latestRun?.status ?? null,
      lastErrorCategory: null,
      lastErrorSummary: null,
      lastRunThreadCount: latestRunStats.threadCount,
      lastRunMessageCount: latestRunStats.messageCount,
      stageLabel: "Connected, waiting for first sync",
      detailLabel:
        "This mailbox is connected. The first sync has not completed yet.",
    };
  }

  const hasStats =
    latestRunStats.threadCount !== null && latestRunStats.messageCount !== null;

  return {
    state: "completed",
    isSyncing: false,
    syncMode: latestRun?.syncMode ?? null,
    triggerSource: latestRun?.triggerSource ?? null,
    currentRunId: null,
    currentRunStartedAt: null,
    lastCompletedAt: latestCompletedAt,
    lastRunStatus: latestRun?.status ?? null,
    lastErrorCategory: null,
    lastErrorSummary: null,
    lastRunThreadCount: latestRunStats.threadCount,
    lastRunMessageCount: latestRunStats.messageCount,
    stageLabel: "Mailbox up to date",
    detailLabel: hasStats
      ? `Last sync imported ${latestRunStats.threadCount} threads and ${latestRunStats.messageCount} messages.`
      : "Recent messages are available in this mailbox.",
  };
}
