/**
 * Mailbox Phase 3 Sprint 3.4 — Degraded state, retry, and recovery model tests.
 *
 * Covers:
 * - sync failure classification (classifyProviderError)
 * - recovery rules (retry, replay, reconnect)
 * - sync state transitions (success clears degraded, failure degrades correctly)
 * - recovery actions contract (retry, replay, verify_auth)
 * - health summary shape with recovery signals
 * - route layer (auth, org scoping, malformed input)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn((cb: any) => cb({ $queryRawUnsafe: vi.fn().mockResolvedValue([{ locked: true }]) })),
    mailboxThread: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxMessage: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
    },
    mailboxAttachment: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxSyncRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    mailboxConnection: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxProviderCursor: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

import {
  classifyProviderError,
  resolveRecoveryAction,
  isRetryAllowed,
  isReplayRequired,
  isReconnectRequired,
  shouldDegradeConnection,
  resolveStatusAfterFailure,
  resolveStatusAfterSuccess,
  resolveRecoverySyncMode,
  getFailureClassSummary,
  getRecoveryActionSummary,
} from "@/lib/mailbox/sync-failure-model";

import {
  getMailboxRecoveryStatus,
  performMailboxRecoveryAction,
} from "@/lib/mailbox/recovery-service";

import { deriveMailboxHealth } from "@/lib/mailbox/health";

import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";

vi.mock("@/lib/mailbox/gmail-provider", async () => {
  const actual = await vi.importActual("@/lib/mailbox/gmail-provider");
  return {
    ...actual,
    gmailProviderAdapter: {
      descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true },
      connect: vi.fn(),
      refreshAuthorization: vi.fn(),
      verifyConnection: vi.fn(),
      syncDelta: vi.fn(),
      syncDrafts: vi.fn().mockResolvedValue({ drafts: [], activeDraftIds: [], failedDraftIds: [] }),
      fetchThreadDetail: vi.fn(),
      disconnect: vi.fn(),
      renewWatch: vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), metadata: {} }),
    },
  };
});

vi.mock("@/lib/mailbox/connection-service", () => ({
  getMailboxConnection: vi.fn(),
}));

vi.mock("@/lib/mailbox/cursor-service", () => ({
  getMailboxCursor: vi.fn(),
  upsertMailboxCursor: vi.fn(),
  deleteMailboxCursors: vi.fn(),
}));

vi.mock("@/lib/mailbox/audit", () => ({
  logMailboxAudit: vi.fn(),
}));

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: vi.fn(),
}));

vi.mock("@/lib/mailbox/folder-coverage-service", () => ({
  markFolderCoverageComplete: vi.fn(),
  updateFolderCoverageBootstrapping: vi.fn(),
  initFolderCoverageForBootstrap: vi.fn(),
  getIncompleteRequiredFolders: vi.fn().mockResolvedValue([]),
  getFolderCoverage: vi.fn().mockResolvedValue(null),
  resetFolderCoverageCursor: vi.fn(),
}));

vi.mock("@/lib/mailbox/gmail-oauth-service", () => ({
  refreshGmailAuthorization: vi.fn(),
  verifyGmailConnection: vi.fn(),
}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 59 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

const mockDb = db as unknown as {
  mailboxSyncRun: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    update: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxThread: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxMessage: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxProviderCursor: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

// ─── Failure classification ───────────────────────────────────────────────────

describe("Sprint 3.4 — Failure classification", () => {
  it("maps auth_expired to reconnect-required contract", () => {
    expect(classifyProviderError("auth_expired")).toBe("auth_expired");
    expect(isReconnectRequired("auth_expired")).toBe(true);
    expect(isRetryAllowed("auth_expired")).toBe(false);
    expect(isReplayRequired("auth_expired")).toBe(false);
  });

  it("maps auth_insufficient to reconnect-required contract", () => {
    expect(classifyProviderError("auth_insufficient")).toBe("auth_insufficient");
    expect(isReconnectRequired("auth_insufficient")).toBe(true);
    expect(isRetryAllowed("auth_insufficient")).toBe(false);
  });

  it("maps watch_expired to replay-required contract", () => {
    expect(classifyProviderError("watch_expired")).toBe("cursor_invalid");
    expect(isReplayRequired("cursor_invalid")).toBe(true);
    expect(isRetryAllowed("cursor_invalid")).toBe(false);
    expect(isReconnectRequired("cursor_invalid")).toBe(false);
  });

  it("maps provider_unavailable to transient + retry-allowed contract", () => {
    expect(classifyProviderError("provider_unavailable")).toBe("transient");
    expect(isRetryAllowed("transient")).toBe(true);
    expect(shouldDegradeConnection("transient")).toBe(true);
    expect(isReconnectRequired("transient")).toBe(false);
  });

  it("maps rate_limited to rate_limited + retry-allowed contract", () => {
    expect(classifyProviderError("rate_limited")).toBe("rate_limited");
    expect(isRetryAllowed("rate_limited")).toBe(true);
    expect(shouldDegradeConnection("rate_limited")).toBe(true);
  });

  it("maps quota_exceeded to rate_limited class", () => {
    expect(classifyProviderError("quota_exceeded")).toBe("rate_limited");
  });

  it("maps not_found to transient class (safe default)", () => {
    expect(classifyProviderError("not_found")).toBe("transient");
  });

  it("maps unknown to safe degraded contract", () => {
    expect(classifyProviderError("unknown")).toBe("unknown");
    expect(isRetryAllowed("unknown")).toBe(false);
    expect(shouldDegradeConnection("unknown")).toBe(true);
    expect(isReconnectRequired("unknown")).toBe(false);
  });
});

// ─── Recovery rules ───────────────────────────────────────────────────────────

describe("Sprint 3.4 — Recovery rules", () => {
  it("resolveRecoveryAction returns reconnect for auth failures", () => {
    expect(resolveRecoveryAction("auth_expired")).toBe("reconnect");
    expect(resolveRecoveryAction("auth_insufficient")).toBe("reconnect");
  });

  it("resolveRecoveryAction returns replay for cursor invalid", () => {
    expect(resolveRecoveryAction("cursor_invalid")).toBe("replay");
  });

  it("resolveRecoveryAction returns retry for transient and rate_limited", () => {
    expect(resolveRecoveryAction("transient")).toBe("retry");
    expect(resolveRecoveryAction("rate_limited")).toBe("retry");
  });

  it("resolveRecoveryAction returns none for unknown", () => {
    expect(resolveRecoveryAction("unknown")).toBe("none");
  });

  it("resolveRecoverySyncMode forces INITIAL for replay", () => {
    expect(resolveRecoverySyncMode("replay", "DELTA")).toBe("INITIAL");
    expect(resolveRecoverySyncMode("replay", "INITIAL")).toBe("INITIAL");
  });

  it("resolveRecoverySyncMode preserves mode for retry", () => {
    expect(resolveRecoverySyncMode("retry", "DELTA")).toBe("DELTA");
    expect(resolveRecoverySyncMode("retry", "INITIAL")).toBe("INITIAL");
  });

  it("getFailureClassSummary returns safe human-readable text", () => {
    expect(getFailureClassSummary("auth_expired")).toContain("expired");
    expect(getFailureClassSummary("cursor_invalid")).toContain("resync");
    expect(getFailureClassSummary("unknown")).toContain("unexpected");
  });

  it("getRecoveryActionSummary returns safe guidance text", () => {
    expect(getRecoveryActionSummary("retry")).toContain("Retrying");
    expect(getRecoveryActionSummary("replay")).toContain("resync");
    expect(getRecoveryActionSummary("reconnect")).toContain("reconnect");
  });
});

// ─── Sync state transitions ───────────────────────────────────────────────────

describe("Sprint 3.4 — Sync state transitions", () => {
  it("successful sync clears DEGRADED → ACTIVE", () => {
    expect(resolveStatusAfterSuccess("DEGRADED")).toBe("ACTIVE");
  });

  it("successful sync keeps ACTIVE as ACTIVE", () => {
    expect(resolveStatusAfterSuccess("ACTIVE")).toBe("ACTIVE");
  });

  it("successful sync does not clear RECONNECT_REQUIRED", () => {
    expect(resolveStatusAfterSuccess("RECONNECT_REQUIRED")).toBe("RECONNECT_REQUIRED");
  });

  it("successful sync does not clear DISCONNECTED", () => {
    expect(resolveStatusAfterSuccess("DISCONNECTED")).toBe("DISCONNECTED");
  });

  it("auth failure transitions ACTIVE → RECONNECT_REQUIRED", () => {
    expect(resolveStatusAfterFailure("ACTIVE", "auth_expired")).toBe("RECONNECT_REQUIRED");
    expect(resolveStatusAfterFailure("ACTIVE", "auth_insufficient")).toBe("RECONNECT_REQUIRED");
  });

  it("transient failure transitions ACTIVE → DEGRADED", () => {
    expect(resolveStatusAfterFailure("ACTIVE", "transient")).toBe("DEGRADED");
    expect(resolveStatusAfterFailure("ACTIVE", "rate_limited")).toBe("DEGRADED");
    expect(resolveStatusAfterFailure("ACTIVE", "unknown")).toBe("DEGRADED");
  });

  it("degrading failure keeps DEGRADED as DEGRADED", () => {
    expect(resolveStatusAfterFailure("DEGRADED", "transient")).toBe("DEGRADED");
    expect(resolveStatusAfterFailure("DEGRADED", "unknown")).toBe("DEGRADED");
  });

  it("cursor_invalid preserves current status", () => {
    expect(resolveStatusAfterFailure("ACTIVE", "cursor_invalid")).toBe("ACTIVE");
    expect(resolveStatusAfterFailure("DEGRADED", "cursor_invalid")).toBe("DEGRADED");
  });

  it("DISCONNECTED is sticky across all failures", () => {
    expect(resolveStatusAfterFailure("DISCONNECTED", "auth_expired")).toBe("DISCONNECTED");
    expect(resolveStatusAfterFailure("DISCONNECTED", "transient")).toBe("DISCONNECTED");
    expect(resolveStatusAfterFailure("DISCONNECTED", "cursor_invalid")).toBe("DISCONNECTED");
  });

  it("RECONNECT_REQUIRED is sticky across all failures", () => {
    expect(resolveStatusAfterFailure("RECONNECT_REQUIRED", "transient")).toBe("RECONNECT_REQUIRED");
    expect(resolveStatusAfterFailure("RECONNECT_REQUIRED", "cursor_invalid")).toBe("RECONNECT_REQUIRED");
  });
});

// ─── Sync orchestration with failure classification ───────────────────────────

describe("Sprint 3.4 — Sync orchestration failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
    mockDb.mailboxThread.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxProviderCursor.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("transient provider failure maps to degraded + retry-allowed and persists error category", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
    const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
    vi.mocked(getMailboxCursor).mockResolvedValue(null);

    const errorAdapter = {
      syncDelta: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Gmail API temporarily unavailable",
        retryable: true,
      }),
    };
    vi.mocked(getMailboxProviderAdapter).mockReturnValue(errorAdapter as never);

    mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
    mockDb.mailboxSyncRun.update.mockResolvedValue({});
    mockDb.mailboxConnection.update.mockResolvedValue({});

    const result = await runMailboxSync({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.category).toBe("provider_unavailable");
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEGRADED",
          lastSyncError: "Gmail API temporarily unavailable",
          lastSyncErrorCategory: "provider_unavailable",
        }),
      }),
    );
  });

  it("auth_insufficient maps to RECONNECT_REQUIRED", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
    const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
    vi.mocked(getMailboxCursor).mockResolvedValue(null);

    const errorAdapter = {
      syncDelta: vi.fn().mockResolvedValue({
        category: "auth_insufficient",
        safeMessage: "Missing required scopes",
        retryable: false,
      }),
    };
    vi.mocked(getMailboxProviderAdapter).mockReturnValue(errorAdapter as never);

    mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
    mockDb.mailboxSyncRun.update.mockResolvedValue({});
    mockDb.mailboxConnection.update.mockResolvedValue({});

    const result = await runMailboxSync({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }),
      }),
    );
  });

  it("watch_expired clears cursor and preserves status", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
    const { getMailboxCursor, deleteMailboxCursors } = await import("@/lib/mailbox/cursor-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
    vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

    const errorAdapter = {
      syncDelta: vi.fn().mockResolvedValue({
        category: "watch_expired",
        safeMessage: "History expired",
        retryable: false,
      }),
    };
    vi.mocked(getMailboxProviderAdapter).mockReturnValue(errorAdapter as never);

    mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ syncMode: "DELTA" }));
    mockDb.mailboxSyncRun.update.mockResolvedValue({});
    mockDb.mailboxConnection.update.mockResolvedValue({});

    const result = await runMailboxSync({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(deleteMailboxCursors).toHaveBeenCalledWith("org-1", "conn-1");
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("successful sync clears lastSyncError and lastSyncErrorCategory", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
    const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "DEGRADED", lastSyncError: "Old error", lastSyncErrorCategory: "provider_unavailable" }),
    );
    vi.mocked(getMailboxCursor).mockResolvedValue(null);

    const mockAdapter = makeMockAdapter();
    vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

    mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
    mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
    mockDb.mailboxSyncRun.update.mockResolvedValue({});
    mockDb.mailboxConnection.update.mockResolvedValue({});
    mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
    mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

    const result = await runMailboxSync({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
    });

    expect(result.success).toBe(true);
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          lastSyncError: null,
          lastSyncErrorCategory: null,
        }),
      }),
    );
  });

  it("concurrent sync returns stable result without corrupting state", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 0 });
    mockDb.mailboxSyncRun.findFirst.mockResolvedValue({ id: "run-existing" });

    const result = await runMailboxSync({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.category).toBe("concurrent_sync_running");
    expect(mockDb.mailboxConnection.update).not.toHaveBeenCalled();
    expect(mockDb.mailboxSyncRun.create).not.toHaveBeenCalled();
  });
});

// ─── Recovery actions contract ────────────────────────────────────────────────

describe("Sprint 3.4 — Recovery actions contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMailboxRecoveryStatus returns null for missing connection", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(null);

    const status = await getMailboxRecoveryStatus("org-1", "conn-missing");
    expect(status).toBeNull();
  });

  it("getMailboxRecoveryStatus reflects reconnect-required state", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "RECONNECT_REQUIRED", lastSyncErrorCategory: "auth_expired" }),
    );

    const status = await getMailboxRecoveryStatus("org-1", "conn-1");
    expect(status).not.toBeNull();
    expect(status!.recoveryAction).toBe("reconnect");
    expect(status!.reconnectRequired).toBe(true);
    expect(status!.canRetry).toBe(false);
    expect(status!.replayRequired).toBe(false);
  });

  it("getMailboxRecoveryStatus reflects degraded + retry-allowed state", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "DEGRADED", lastSyncErrorCategory: "provider_unavailable" }),
    );

    const status = await getMailboxRecoveryStatus("org-1", "conn-1");
    expect(status!.recoveryAction).toBe("retry");
    expect(status!.canRetry).toBe(true);
    expect(status!.reconnectRequired).toBe(false);
    expect(status!.replayRequired).toBe(false);
  });

  it("getMailboxRecoveryStatus reflects replay-required state", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "ACTIVE", lastSyncErrorCategory: "watch_expired" }),
    );

    const status = await getMailboxRecoveryStatus("org-1", "conn-1");
    expect(status!.recoveryAction).toBe("replay");
    expect(status!.replayRequired).toBe(true);
    expect(status!.canRetry).toBe(false);
  });

  it("getMailboxRecoveryStatus detects active sync from lease", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({
        syncLeaseExpiresAt: new Date(Date.now() + 60 * 1000),
        syncLeaseToken: "lease-1",
      }),
    );

    const status = await getMailboxRecoveryStatus("org-1", "conn-1");
    expect(status!.isSyncing).toBe(true);
  });

  it("performMailboxRecoveryAction rejects retry when reconnect is required", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "RECONNECT_REQUIRED", lastSyncErrorCategory: "auth_expired" }),
    );

    const result = await performMailboxRecoveryAction({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
      action: "retry",
    });

    expect(result.ok).toBe(false);
    expect(result.action).toBe("retry");
    expect(result.message).toContain("reconnect");
  });

  it("performMailboxRecoveryAction rejects retry when replay is required", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "ACTIVE", lastSyncErrorCategory: "watch_expired" }),
    );

    const result = await performMailboxRecoveryAction({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
      action: "retry",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("replay");
  });

  it("performMailboxRecoveryAction rejects replay when reconnect is required", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "RECONNECT_REQUIRED", lastSyncErrorCategory: "auth_expired" }),
    );

    const result = await performMailboxRecoveryAction({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
      action: "replay",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("reconnect");
  });

  it("performMailboxRecoveryAction accepts replay and clears cursor", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
    const { getMailboxCursor, deleteMailboxCursors } = await import("@/lib/mailbox/cursor-service");

    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "DEGRADED", lastSyncErrorCategory: "provider_unavailable" }),
    );
    vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());
    vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

    mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
    mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ syncMode: "INITIAL" }));
    mockDb.mailboxSyncRun.update.mockResolvedValue({});
    mockDb.mailboxConnection.update.mockResolvedValue({});
    mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
    mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

    const result = await performMailboxRecoveryAction({
      orgId: "org-1",
      connectionId: "conn-1",
      actorId: "user-1",
      action: "replay",
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("replay");
    expect(deleteMailboxCursors).toHaveBeenCalledWith("org-1", "conn-1");
    expect(result.syncResult?.syncMode).toBe("INITIAL");
  });

  it("performMailboxRecoveryAction is org-scoped (throws on wrong org)", async () => {
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    vi.mocked(getMailboxConnection).mockResolvedValue(null);

    await expect(
      performMailboxRecoveryAction({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        action: "retry",
      }),
    ).rejects.toThrow("not found for org");
  });
});

// ─── Health summary ───────────────────────────────────────────────────────────

describe("Sprint 3.4 — Health summary", () => {
  it("healthy connection has no recovery signals", () => {
    const h = deriveMailboxHealth(makeConnectionRecord());
    expect(h.status).toBe("healthy");
    expect(h.recoveryAction).toBe("none");
    expect(h.canRetry).toBe(false);
    expect(h.replayRequired).toBe(false);
    expect(h.reconnectRequired).toBe(false);
    expect(h.lastErrorCategory).toBeNull();
  });

  it("degraded connection exposes retry-allowed and failure class", () => {
    const h = deriveMailboxHealth(
      makeConnectionRecord({
        status: "DEGRADED",
        lastSyncErrorCategory: "provider_unavailable",
      }),
    );
    expect(h.status).toBe("degraded");
    expect(h.recoveryAction).toBe("retry");
    expect(h.canRetry).toBe(true);
    expect(h.lastErrorCategory).toBe("transient");
  });

  it("reconnect_required connection exposes reconnect signal", () => {
    const h = deriveMailboxHealth(
      makeConnectionRecord({ status: "RECONNECT_REQUIRED", lastSyncErrorCategory: "auth_expired" }),
    );
    expect(h.status).toBe("reconnect_required");
    expect(h.recoveryAction).toBe("reconnect");
    expect(h.reconnectRequired).toBe(true);
    expect(h.canRetry).toBe(false);
  });

  it("expiring_soon connection exposes retry action", () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const h = deriveMailboxHealth(makeConnectionRecord({ tokenExpiry: soon }));
    expect(h.status).toBe("expiring_soon");
    expect(h.recoveryAction).toBe("retry");
    expect(h.canRetry).toBe(true);
  });

  it("health summary reflects isSyncing from lease", () => {
    const h = deriveMailboxHealth(
      makeConnectionRecord({
        syncLeaseExpiresAt: new Date(Date.now() + 60 * 1000),
      }),
    );
    expect(h.isSyncing).toBe(true);
  });

  it("health summary does not leak provider internals", () => {
    const h = deriveMailboxHealth(
      makeConnectionRecord({
        status: "DEGRADED",
        lastSyncErrorCategory: "provider_unavailable",
      }),
    );
    expect(h.summary).not.toContain("Gmail");
    expect(h.summary).not.toContain("token");
    expect(h.summary).not.toContain("API");
  });
});

// ─── Route layer ──────────────────────────────────────────────────────────────

describe("Sprint 3.4 — Recovery route layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET recover status returns 401 when not authenticated", async () => {
    const { requireIntegrationAdminRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationAdminRoute).mockResolvedValue({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    } as never);

    const { GET } = await import("@/app/api/mailbox/connections/[connectionId]/recover/route");
    const req = new NextRequest("http://localhost/api/mailbox/connections/conn-1/recover");
    const res = await GET(req, { params: Promise.resolve({ connectionId: "conn-1" }) });
    expect(res.status).toBe(401);
  });

  it("GET recover status returns 404 for missing connection", async () => {
    const { requireIntegrationAdminRoute } = await import("@/app/api/integrations/_auth");
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");

    vi.mocked(requireIntegrationAdminRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: "org-1", userId: "user-1" },
    } as never);
    vi.mocked(getMailboxConnection).mockResolvedValue(null);

    const { GET } = await import("@/app/api/mailbox/connections/[connectionId]/recover/route");
    const req = new NextRequest("http://localhost/api/mailbox/connections/conn-1/recover");
    const res = await GET(req, { params: Promise.resolve({ connectionId: "conn-1" }) });
    expect(res.status).toBe(404);
  });

  it("POST recover rejects invalid action", async () => {
    const { requireIntegrationAdminRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationAdminRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: "org-1", userId: "user-1" },
    } as never);

    const { POST } = await import("@/app/api/mailbox/connections/[connectionId]/recover/route");
    const req = new NextRequest("http://localhost/api/mailbox/connections/conn-1/recover", {
      method: "POST",
      body: JSON.stringify({ action: "invalid_action" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ connectionId: "conn-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid recovery action");
  });

  it("POST recover accepts valid action and returns result", async () => {
    const { requireIntegrationAdminRoute } = await import("@/app/api/integrations/_auth");
    const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
    const { refreshGmailAuthorization } = await import("@/lib/mailbox/gmail-oauth-service");

    vi.mocked(requireIntegrationAdminRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: "org-1", userId: "user-1" },
    } as never);
    vi.mocked(getMailboxConnection).mockResolvedValue(
      makeConnectionRecord({ status: "RECONNECT_REQUIRED", lastSyncErrorCategory: "auth_expired" }),
    );
    vi.mocked(refreshGmailAuthorization).mockResolvedValue({
      ok: false,
      error: "auth_expired",
      reconnectRequired: true,
    });

    const { POST } = await import("@/app/api/mailbox/connections/[connectionId]/recover/route");
    const req = new NextRequest("http://localhost/api/mailbox/connections/conn-1/recover", {
      method: "POST",
      body: JSON.stringify({ action: "verify_auth" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ connectionId: "conn-1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.action).toBe("verify_auth");
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConnectionRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GMAIL" as const,
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE" as const,
    visibilityPolicy: "org_shared",
    tokenRef: "token-1",
    tokenExpiry: null,
    watchMetadata: null,
    watchExpiresAt: null,
    watchRenewedAt: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorCategory: null,
    disabledAt: null,
    connectedBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    syncLeaseToken: null,
    syncLeaseExpiresAt: null,
    ...overrides,
  };
}

function makeCursorRecord() {
  return {
    id: "cursor-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    provider: "GMAIL" as const,
    cursorType: "HISTORY_ID" as const,
    cursorValue: "1000",
    expiresAt: null,
    lastAdvancedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSyncRunRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    provider: "GMAIL" as const,
    status: "RUNNING" as const,
    triggerSource: "MANUAL" as const,
    syncMode: "INITIAL" as const,
    startedAt: new Date(),
    completedAt: null,
    errorCategory: null,
    errorSummary: null,
    stats: null,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockAdapter() {
  return {
    descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true },
    connect: vi.fn(),
    refreshAuthorization: vi.fn(),
    verifyConnection: vi.fn(),
    syncDelta: vi.fn().mockResolvedValue({
      threads: [{
        providerThreadId: "gmail-thread-1",
        subject: "Test",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        participants: [{ email: "a@example.com", displayName: "A" }],
        providerMetadata: {},
      }],
      nextCursor: { value: "cursor-next", expiresAt: null },
    }),
    syncDrafts: vi.fn().mockResolvedValue({
      drafts: [],
      activeDraftIds: [],
      failedDraftIds: [],
    }),
    fetchThreadDetail: vi.fn().mockResolvedValue({
      messages: [{
        providerMessageId: "gmail-msg-1",
        rfcMessageId: "<msg@example.com>",
        direction: "inbound" as const,
        from: { email: "a@example.com", displayName: "A" },
        to: [{ email: "b@example.com", displayName: "B" }],
        cc: [],
        bcc: [],
        subject: "Test",
        snippet: "Hello",
        sentAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        attachmentCount: 0,
        providerMetadata: {},
        htmlBody: "<p>Hello</p>",
        textBody: "Hello",
        attachments: [],
      }],
    }),
    disconnect: vi.fn(),
    renewWatch: vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { gmailHistoryId: "12345", gmailWatchExpiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    }),
  };
}

function makeThreadRow() {
  return {
    id: "thread-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    providerThreadId: "gmail-thread-1",
    subject: "Test",
    participantsSummary: [],
    lastMessageAt: new Date(),
    unreadCount: 0,
    status: "OPEN" as const,
    assigneeId: null,
    isFlagged: false,
    primaryLinkSummary: null,
    previewSnippet: "",
    attachmentCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMessageRow() {
  return {
    id: "msg-1",
    orgId: "org-1",
    threadId: "thread-1",
    providerMessageId: "gmail-msg-1",
    rfcMessageId: null,
    direction: "inbound" as const,
    from: { email: "a@example.com" },
    to: [],
    cc: [],
    bcc: [],
    subject: "Test",
    snippet: "Hello",
    htmlBody: "<p>Hello</p>",
    textBody: "Hello",
    sentAt: new Date(),
    receivedAt: null,
    attachmentCount: 0,
    providerMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
