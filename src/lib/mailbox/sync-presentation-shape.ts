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
}
