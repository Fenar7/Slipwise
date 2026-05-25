import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MailboxSyncStateChip } from "../mailbox-sync-status";
import { shouldAutoTriggerMailboxSync } from "../mailbox-sync-ui";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";

function buildSyncPresentation(
  overrides: Partial<MailboxSyncPresentation> = {},
): MailboxSyncPresentation {
  return {
    state: "completed",
    isSyncing: false,
    syncMode: "DELTA",
    triggerSource: "MANUAL",
    currentRunId: null,
    currentRunStartedAt: null,
    lastCompletedAt: "2026-05-25T10:15:00Z",
    lastRunStatus: "COMPLETED",
    lastErrorCategory: null,
    lastErrorSummary: null,
    lastRunThreadCount: 8,
    lastRunMessageCount: 13,
    stageLabel: "Mailbox up to date",
    detailLabel: "Recent messages are available in this mailbox.",
    staleGmailCoverage: false,
    ...overrides,
  };
}

describe("mailbox sync UI truthfulness", () => {
  it("renders stale Gmail coverage as sync recommended instead of up to date", () => {
    render(
      <MailboxSyncStateChip
        sync={buildSyncPresentation({
          stageLabel: "Sync recommended",
          detailLabel: "Sent and spam folder coverage needs to be refreshed.",
          staleGmailCoverage: true,
        })}
      />,
    );

    expect(screen.getByText("Sync recommended")).toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("auto-triggers for a never-imported mailbox and stale Gmail coverage", () => {
    expect(
      shouldAutoTriggerMailboxSync(
        buildSyncPresentation({
          state: "completed_never_imported",
          syncMode: null,
          triggerSource: null,
          lastCompletedAt: null,
          lastRunStatus: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Connected, waiting for first sync",
          detailLabel: "This mailbox is connected. The first sync has not completed yet.",
        }),
      ),
    ).toBe(true);

    expect(
      shouldAutoTriggerMailboxSync(
        buildSyncPresentation({
          stageLabel: "Sync recommended",
          detailLabel: "Sent, spam, and drafts coverage needs to be refreshed.",
          staleGmailCoverage: true,
        }),
      ),
    ).toBe(true);
  });
});
