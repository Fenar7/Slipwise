export interface MailboxSyncPresentation {
  state: "idle" | "running" | "failed" | "completed_never_imported" | "completed";
  isSyncing: boolean;
  syncMode: "INITIAL" | "DELTA" | null;
  triggerSource: "MANUAL" | "SCHEDULED" | "RENEWAL" | "WEBHOOK" | null;
  currentRunId: string | null;
  currentRunStartedAt: string | null;
  lastCompletedAt: string | null;
  lastRunStatus: "RUNNING" | "COMPLETED" | "FAILED" | null;
  lastErrorCategory: string | null;
  lastErrorSummary: string | null;
  lastRunThreadCount: number | null;
  lastRunMessageCount: number | null;
  stageLabel: string;
  detailLabel: string;
  /** True when Gmail Sent/Spam/Drafts coverage recovery is still required. */
  staleGmailCoverage: boolean;
  /** Per-folder coverage summary. When present, supersedes staleGmailCoverage for folder-level truth. */
  folderCoverage?: {
    overallState: string;
    coverages: Array<{
      folder: string;
      state: string;
      totalThreads: number;
      errorSummary?: string | null;
    }>;
  };
  /**
   * Draft-specific error category. Set when thread/message sync succeeded
   * but draft sync failed. The overall sync is COMPLETED; only drafts are degraded.
   */
  draftErrorCategory: string | null;
  /**
   * Draft-specific error summary. Human-readable explanation of why
   * drafts could not be synced. Clears on next successful draft sync.
   */
  draftErrorSummary: string | null;
}
