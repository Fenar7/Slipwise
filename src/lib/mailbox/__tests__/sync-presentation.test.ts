import { describe, expect, it } from "vitest";
import { buildMailboxSyncPresentation } from "@/lib/mailbox/sync-presentation";

const NOW = new Date("2026-05-22T12:00:00.000Z").getTime();

function makeConnection(
  overrides: Partial<Parameters<typeof buildMailboxSyncPresentation>[0]> = {},
) {
  return {
    status: "ACTIVE" as const,
    lastSyncAt: new Date("2026-05-21T12:00:00.000Z"),
    lastSyncError: null,
    lastSyncErrorCategory: null,
    syncLeaseToken: null,
    syncLeaseExpiresAt: null,
    ...overrides,
  };
}

describe("buildMailboxSyncPresentation", () => {
  it("returns running initial import when a lease is active", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({
        lastSyncAt: null,
        syncLeaseToken: "lease_1",
        syncLeaseExpiresAt: new Date(NOW + 60_000),
      }),
      {},
      NOW,
    );

    expect(sync.state).toBe("running");
    expect(sync.isSyncing).toBe(true);
    expect(sync.stageLabel).toBe("Initial import in progress");
  });

  it("returns completed_never_imported when mailbox is connected but has never synced", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({ lastSyncAt: null }),
      {},
      NOW,
    );

    expect(sync.state).toBe("completed_never_imported");
    expect(sync.stageLabel).toBe("Connected, waiting for first sync");
    expect(sync.isSyncing).toBe(false);
  });

  it("completed_never_imported detailLabel is product-safe copy (no raw error/internal strings)", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({ lastSyncAt: null }),
      {},
      NOW,
    );

    expect(sync.state).toBe("completed_never_imported");
    // Must not contain raw tokens or internal garbage
    expect(sync.detailLabel).not.toMatch(/undefined|null|error|exception/i);
    // Must be non-empty human copy
    expect(sync.detailLabel.length).toBeGreaterThan(10);
  });

  it("returns completed with latest completed run stats", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection(),
      {
        latestRun: {
          id: "run_2",
          status: "COMPLETED",
          syncMode: "DELTA",
          triggerSource: "MANUAL",
          startedAt: new Date("2026-05-22T11:55:00.000Z"),
          completedAt: new Date("2026-05-22T11:57:00.000Z"),
          stats: { threadCount: 12, messageCount: 58 },
          errorCategory: null,
          errorMessage: null,
        },
        latestCompletedRun: {
          id: "run_2",
          status: "COMPLETED",
          syncMode: "DELTA",
          triggerSource: "MANUAL",
          startedAt: new Date("2026-05-22T11:55:00.000Z"),
          completedAt: new Date("2026-05-22T11:57:00.000Z"),
          stats: { threadCount: 12, messageCount: 58 },
          errorCategory: null,
          errorMessage: null,
        },
      },
      NOW,
    );

    expect(sync.state).toBe("completed");
    expect(sync.lastRunThreadCount).toBe(12);
    expect(sync.lastRunMessageCount).toBe(58);
    expect(sync.detailLabel).toContain("12 threads");
  });

  it("returns failed when latest run failed", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({
        lastSyncError: "Gmail rate limit exceeded",
        lastSyncErrorCategory: "rate_limited",
      }),
      {
        latestRun: {
          id: "run_3",
          status: "FAILED",
          syncMode: "DELTA",
          triggerSource: "MANUAL",
          startedAt: new Date("2026-05-22T11:55:00.000Z"),
          completedAt: new Date("2026-05-22T11:56:00.000Z"),
          stats: null,
          errorCategory: "rate_limited",
          errorMessage: "Gmail rate limit exceeded",
        },
      },
      NOW,
    );

    expect(sync.state).toBe("failed");
    expect(sync.stageLabel).toBe("Sync needs attention");
    expect(sync.lastErrorCategory).toBe("rate_limited");
  });

  it("returns failed from connection-level lastSyncError even without a run record", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({
        lastSyncError: "OAuth token revoked",
        lastSyncErrorCategory: "auth_error",
      }),
      {},
      NOW,
    );

    expect(sync.state).toBe("failed");
    expect(sync.lastErrorSummary).toBe("OAuth token revoked");
  });

  it("returns idle for RECONNECT_REQUIRED status", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({ status: "RECONNECT_REQUIRED" as const }),
      {},
      NOW,
    );

    expect(sync.state).toBe("idle");
    expect(sync.isSyncing).toBe(false);
    expect(sync.stageLabel).toBe("Sync unavailable");
  });

  it("returns idle for DISCONNECTED status", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({ status: "DISCONNECTED" as const }),
      {},
      NOW,
    );

    expect(sync.state).toBe("idle");
    expect(sync.isSyncing).toBe(false);
  });

  it("running state uses DELTA label for delta sync mode", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({
        lastSyncAt: new Date("2026-05-21T00:00:00Z"),
        syncLeaseToken: "lease_delta",
        syncLeaseExpiresAt: new Date(NOW + 60_000),
      }),
      {
        latestRun: {
          id: "run_delta",
          status: "RUNNING",
          syncMode: "DELTA",
          triggerSource: "SCHEDULED",
          startedAt: new Date(NOW - 5_000),
          completedAt: null,
          stats: null,
          errorCategory: null,
          errorMessage: null,
        },
      },
      NOW,
    );

    expect(sync.state).toBe("running");
    expect(sync.stageLabel).toBe("Checking for new mail");
  });

  it("does not show running forever when the latest RUNNING run is stale (>30 min)", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({ lastSyncAt: null }),
      {
        latestRun: {
          id: "run_stale",
          status: "RUNNING",
          syncMode: "INITIAL",
          triggerSource: "MANUAL",
          startedAt: new Date(NOW - 35 * 60 * 1000),
          completedAt: null,
          stats: null,
          errorCategory: null,
          errorMessage: null,
        },
      },
      NOW,
    );

    expect(sync.isSyncing).toBe(false);
    expect(sync.state).toBe("failed");
    expect(sync.stageLabel).toBe("Sync needs attention");
    expect(sync.detailLabel).toContain("did not finish");
  });

  it("stale RUNNING run with lastSyncAt is treated as failed, not completed", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection(),
      {
        latestRun: {
          id: "run_stale",
          status: "RUNNING",
          syncMode: "DELTA",
          triggerSource: "SCHEDULED",
          startedAt: new Date(NOW - 40 * 60 * 1000),
          completedAt: null,
          stats: null,
          errorCategory: null,
          errorMessage: null,
        },
      },
      NOW,
    );

    expect(sync.isSyncing).toBe(false);
    expect(sync.state).toBe("failed");
  });

  it("fresh RUNNING run without an active lease is still treated as running", () => {
    const sync = buildMailboxSyncPresentation(
      makeConnection({
        lastSyncAt: null,
        syncLeaseToken: null,
        syncLeaseExpiresAt: null,
      }),
      {
        latestRun: {
          id: "run_fresh",
          status: "RUNNING",
          syncMode: "INITIAL",
          triggerSource: "MANUAL",
          startedAt: new Date(NOW - 2 * 60 * 1000),
          completedAt: null,
          stats: null,
          errorCategory: null,
          errorMessage: null,
        },
      },
      NOW,
    );

    expect(sync.isSyncing).toBe(true);
    expect(sync.state).toBe("running");
    expect(sync.stageLabel).toBe("Initial import in progress");
  });
});
