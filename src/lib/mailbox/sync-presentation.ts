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


const GMAIL_PRESENTATION_COVERAGE_VERSION = 4;

function hasStaleGmailCoverage(record: MailboxConnectionRecord): boolean {
  if (record.provider !== "GMAIL") return false;
  if (!record.watchMetadata || typeof record.watchMetadata !== "object" || Array.isArray(record.watchMetadata)) {
    return true;
  }
  const meta = record.watchMetadata as Record<string, unknown>;
  const version = meta.gmailCoverageVersion;
  if (typeof version !== "number" || version < GMAIL_PRESENTATION_COVERAGE_VERSION) {
    return true;
  }
  const coveredLabels = meta.gmailCoveredSystemLabels;
  if (!Array.isArray(coveredLabels)) return true;
  const coveredSet = new Set(
    coveredLabels.filter((value): value is string => typeof value === "string"),
  );
  return !(
    coveredSet.has("INBOX") &&
    coveredSet.has("SENT") &&
    coveredSet.has("SPAM") &&
    coveredSet.has("DRAFT")
  );
}
export function buildMailboxSyncPresentation(
  record: MailboxConnectionRecord,
  syncRuns: Partial<MailboxSyncRunLookup> = {},
  now = Date.now(),
): MailboxSyncPresentation {
  const latestRun = syncRuns.latestRun ?? null;
  const latestCompletedRun = syncRuns.latestCompletedRun ?? null;
  const activeLease = isActiveLease(record, now);

  // A run is only "actually running" if it is RUNNING and not stale.
  // This prevents crashed/timed-out syncs from showing "Syncing" forever.
  const isLatestRunActive =
    latestRun?.status === "RUNNING" &&
    latestRun.startedAt.getTime() > now - STALE_RUN_THRESHOLD_MS;
  const isSyncing = activeLease || isLatestRunActive;

  const latestCompletedAt =
    latestCompletedRun?.completedAt?.toISOString() ??
    record.lastSyncAt?.toISOString() ??
    null;

  const latestRunStats = parseSyncStats(latestCompletedRun?.stats ?? null);
  const isStaleRunningRun = latestRun?.status === "RUNNING" && !isLatestRunActive;
  const failedSummary =
    latestRun?.status === "FAILED"
      ? latestRun.errorSummary
      : isStaleRunningRun
        ? "A previous sync did not finish. Try syncing again."
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
      staleGmailCoverage: false,
    };
  }

  const hasFailedRun =
    latestRun?.status === "FAILED" ||
    // A stale RUNNING run (crashed / timed-out) is presented as failed so the
    // UI does not show "Syncing" forever and the user can retry.
    isStaleRunningRun ||
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

  const staleCoverage = hasStaleGmailCoverage(record);

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
    stageLabel: staleCoverage ? "Sync recommended" : "Mailbox up to date",
    detailLabel: staleCoverage
      ? "Sent, spam, and drafts coverage needs to be refreshed. Start a sync to import all folders."
      : hasStats
        ? `Last sync imported ${latestRunStats.threadCount} threads and ${latestRunStats.messageCount} messages.`
        : "Recent messages are available in this mailbox.",
    staleGmailCoverage: staleCoverage,
  };
}
