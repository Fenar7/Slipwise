import type { MailboxConnectionRecord, MailboxSyncRunRecord } from "./domain-types";
import type { MailboxSyncPresentation } from "./sync-presentation-shape";

export interface MailboxSyncRunLookup {
  latestRun: MailboxSyncRunRecord | null;
  latestCompletedRun: MailboxSyncRunRecord | null;
}

function isActiveLease(record: MailboxConnectionRecord, now = Date.now()): boolean {
  return record.syncLeaseExpiresAt != null && record.syncLeaseExpiresAt.getTime() > now;
}

/** Runs older than this are considered stale and must not be treated as active. */
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * If a running run's lastHeartbeatAt is older than this threshold,
 * the run is considered stalled — it is still technically alive but
 * not making observable progress.
 */
const STALL_DETECTION_THRESHOLD_MS = 5 * 60 * 1000;

function parseSyncStats(stats: Record<string, unknown> | null): {
  threadCount: number | null;
  messageCount: number | null;
  currentFolder: string | null;
  syncPhase: string | null;
} {
  if (!stats) {
    return { threadCount: null, messageCount: null, currentFolder: null, syncPhase: null };
  }

  const threadCount =
    typeof stats.threadCount === "number" ? stats.threadCount : null;
  const messageCount =
    typeof stats.messageCount === "number" ? stats.messageCount : null;
  const currentFolder =
    typeof stats.currentFolder === "string" ? stats.currentFolder : null;
  const syncPhase =
    typeof stats.syncPhase === "string" ? stats.syncPhase : null;

  return { threadCount, messageCount, currentFolder, syncPhase };
}

/**
 * Determine if a running sync run is stalled — alive but not making
 * observable progress. Returns true when:
 * - The run is RUNNING
 * - A lastHeartbeatAt exists and is older than STALL_DETECTION_THRESHOLD_MS
 * - No stats have been persisted yet (threadCount is 0 or null)
 *
 * If stats exist but heartbeat is old, we still consider it stalled because
 * the run may have completed ingestion but is stuck in post-processing.
 */
function isRunStalled(run: MailboxSyncRunRecord, now: Date): boolean {
  if (run.status !== "RUNNING") return false;
  if (!run.lastHeartbeatAt) return false;
  const heartbeatAge = now.getTime() - run.lastHeartbeatAt.getTime();
  return heartbeatAge > STALL_DETECTION_THRESHOLD_MS;
}


/**
 * Build the sync presentation for a mailbox connection.
 *
 * staleGmailCoverage is always false here. The real coverage truth is
 * derived from per-folder mailboxFolderCoverage rows and applied by the
 * visibility service layer (listMailboxConnectionsForMember) before the
 * presentation reaches the UI or auto-sync logic.
 */
export function buildMailboxSyncPresentation(
  record: MailboxConnectionRecord,
  syncRuns: Partial<MailboxSyncRunLookup> = {},
  now = Date.now(),
): MailboxSyncPresentation {
  const latestRun = syncRuns.latestRun ?? null;
  const latestCompletedRun = syncRuns.latestCompletedRun ?? null;
  const activeLease = isActiveLease(record, now);

  // A run is only "actually running" if it is RUNNING, not stale, and not stalled.
  // Stale runs (older than 30 min) are treated as crashed/timed-out.
  // Stalled runs (alive but no heartbeat in 5+ min) are treated as needing attention.
  const isLatestRunActive =
    latestRun?.status === "RUNNING" &&
    latestRun.startedAt.getTime() > now - STALE_RUN_THRESHOLD_MS;
  const isStaleRunningRun = latestRun?.status === "RUNNING" && !isLatestRunActive;
  const isStalledRun = latestRun ? isRunStalled(latestRun, new Date(now)) : false;

  // A stalled run is alive but not making progress — present as failed/attention-needed,
  // not as a healthy active import.
  const isSyncing = (activeLease || isLatestRunActive) && !isStalledRun;

  const latestCompletedAt =
    latestCompletedRun?.completedAt?.toISOString() ??
    record.lastSyncAt?.toISOString() ??
    null;

  const latestRunStats = parseSyncStats(latestCompletedRun?.stats ?? null);
  // For a running run, use live heartbeat stats instead of last completed stats
  const runningRunStats = (isSyncing && latestRun) ? parseSyncStats(latestRun.stats ?? null) : null;
  const activeStats = isSyncing ? runningRunStats : latestRunStats;
  const failedSummary =
    latestRun?.status === "FAILED"
      ? latestRun.errorSummary
      : isStaleRunningRun
        ? "A previous sync did not finish. Try syncing again."
        : isStalledRun
          ? "Sync is running but has not made recent progress. It may recover automatically, or try syncing again."
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
      staleGmailCoverage: false,
    };
  }

  if (isSyncing) {
    const isInitial = latestRun?.syncMode !== "DELTA";
    const liveThreadCount = activeStats?.threadCount ?? 0;
    const liveMessageCount = activeStats?.messageCount ?? 0;
    const currentFolder = activeStats?.currentFolder ?? null;
    const syncPhase = activeStats?.syncPhase ?? null;

    // Build a truthful in-run detail label that reflects actual progress
    let runDetailLabel: string;
    if (syncPhase === "coverage_recovery") {
      runDetailLabel = currentFolder
        ? `Recovering ${currentFolder} folder (${liveThreadCount} threads imported so far).`
        : `Recovering incomplete folders (${liveThreadCount} threads imported so far).`;
    } else if (syncPhase === "draft_sync") {
      runDetailLabel = liveThreadCount > 0
        ? `Syncing drafts (${liveThreadCount} threads imported so far).`
        : "Syncing drafts from this mailbox.";
    } else if (liveThreadCount > 0) {
      runDetailLabel = isInitial
        ? `Importing threads (${liveThreadCount} threads, ${liveMessageCount} messages so far).`
        : `Checking for new mail (${liveThreadCount} threads, ${liveMessageCount} messages so far).`;
    } else {
      runDetailLabel = isInitial
        ? "Importing recent threads. Messages will appear automatically."
        : "Checking Gmail for new messages and updates.";
    }

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
      lastRunThreadCount: liveThreadCount || latestRunStats.threadCount,
      lastRunMessageCount: liveMessageCount || latestRunStats.messageCount,
      stageLabel: isInitial ? "Initial import in progress" : "Checking for new mail",
      detailLabel: runDetailLabel,
      staleGmailCoverage: false,
    };
  }

  const hasFailedRun =
    latestRun?.status === "FAILED" ||
    // A stale RUNNING run (crashed / timed-out) is presented as failed so the
    // UI does not show "Syncing" forever and the user can retry.
    isStaleRunningRun ||
    // A stalled RUNNING run (alive but no progress) is also presented as
    // needing attention so the user can retry or investigate.
    isStalledRun ||
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
      staleGmailCoverage: false,
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
      staleGmailCoverage: false,
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
    staleGmailCoverage: false,
  };
}
