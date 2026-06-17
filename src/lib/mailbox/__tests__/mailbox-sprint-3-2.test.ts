/**
 * Mailbox Phase 3 Sprint 3.2 — Incremental sync, provider cursors, and
 * mailbox-scoped concurrency tests.
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
      findMany: vi.fn(),
      update: vi.fn(),
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
  mailboxCanSync,
  cursorIsExpired,
  watchIsExpired,
  cursorIsValidForDelta,
  resolveSyncMode,
} from "@/lib/mailbox/domain-types";
import type { MailboxConnectionRecord } from "@/lib/mailbox/domain-types";

import {
  upsertMailboxThread,
  upsertMailboxMessage,
  upsertMailboxAttachment,
} from "@/lib/mailbox/ingestion-service";

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
      syncDrafts: vi.fn(),
      fetchThreadDetail: vi.fn(),
      disconnect: vi.fn(),
      renewWatch: vi.fn(),
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

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn(),
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
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxProviderCursor: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

describe("Sprint 3.2 — Incremental sync and provider cursors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the concurrency guard mock so one test's resolved value does not leak into the next.
    mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
    mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxThread.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxMessage.findMany.mockResolvedValue([]);
  });

  // ─── Domain helpers ──────────────────────────────────────────────────────

  describe("resolveSyncMode", () => {
    it("returns INITIAL when no cursor exists", () => {
      const conn = makeConnection();
      expect(resolveSyncMode(conn, null)).toBe("INITIAL");
    });

    it("returns INITIAL when cursor is expired", () => {
      const conn = makeConnection();
      const cursor = makeCursor({ expiresAt: new Date("2020-01-01") });
      expect(resolveSyncMode(conn, cursor)).toBe("INITIAL");
    });

    it("returns INITIAL when watch is expired", () => {
      const conn = makeConnection({ watchExpiresAt: new Date("2020-01-01") });
      const cursor = makeCursor();
      expect(resolveSyncMode(conn, cursor)).toBe("INITIAL");
    });

    it("returns DELTA when cursor is valid and watch is active", () => {
      const conn = makeConnection({ watchExpiresAt: new Date("2099-01-01") });
      const cursor = makeCursor();
      expect(resolveSyncMode(conn, cursor)).toBe("DELTA");
    });
  });

  describe("watchIsExpired", () => {
    it("returns false when watchExpiresAt is null", () => {
      expect(watchIsExpired(makeConnection({ watchExpiresAt: null }))).toBe(false);
    });
    it("returns true when watchExpiresAt is in the past", () => {
      expect(watchIsExpired(makeConnection({ watchExpiresAt: new Date("2020-01-01") }))).toBe(true);
    });
    it("returns false when watchExpiresAt is in the future", () => {
      expect(watchIsExpired(makeConnection({ watchExpiresAt: new Date("2099-01-01") }))).toBe(false);
    });
  });

  describe("cursorIsValidForDelta", () => {
    it("returns false when cursor is null", () => {
      expect(cursorIsValidForDelta(null)).toBe(false);
    });
    it("returns false when cursor is expired", () => {
      expect(cursorIsValidForDelta(makeCursor({ expiresAt: new Date("2020-01-01") }))).toBe(false);
    });
    it("returns true when cursor is present and not expired", () => {
      expect(cursorIsValidForDelta(makeCursor())).toBe(true);
    });
  });

  // ─── Concurrency guard ────────────────────────────────────────────────────

  describe("Mailbox-scoped concurrency", () => {
    it("blocks a second sync for the same mailbox while one is RUNNING", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      // Simulate an existing RUNNING sync run.
      mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 0 });
      mockDb.mailboxSyncRun.findFirst.mockResolvedValue({ id: "run-existing" });

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "MANUAL",
      });

      expect(result.success).toBe(false);
      expect(result.error?.category).toBe("concurrent_sync_running");
      expect(mockDb.mailboxSyncRun.create).not.toHaveBeenCalled();
    });

    it("allows sync for a different mailbox when another is RUNNING", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      // No existing RUNNING sync for THIS mailbox.
      mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});
      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-2",
        actorId: "user-1",
        triggerSource: "MANUAL",
      });

      expect(result.success).toBe(true);
      expect(mockDb.mailboxConnection.updateMany).toHaveBeenCalledTimes(2);
    });

    it("cleans up stale RUNNING runs before starting a new sync", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxSyncRun.updateMany.mockResolvedValue({ count: 1 });
      mockDb.mailboxConnection.update.mockResolvedValue({});
      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "MANUAL",
      });

      expect(result.success).toBe(true);
      expect(mockDb.mailboxSyncRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "RUNNING",
            startedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("still blocks when a genuinely fresh RUNNING sync exists", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      // Lease acquisition fails.
      mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 0 });
      // A fresh RUNNING run exists (started just now).
      mockDb.mailboxSyncRun.findFirst.mockResolvedValue({ id: "run-fresh" });
      mockDb.mailboxSyncRun.updateMany.mockResolvedValue({ count: 0 });

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "MANUAL",
      });

      expect(result.success).toBe(false);
      expect(result.error?.category).toBe("concurrent_sync_running");
    });
  });

  // ─── Delta sync path ──────────────────────────────────────────────────────

  describe("Delta sync path", () => {
    it("uses delta mode when a valid cursor exists and watch is active", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, upsertMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({ watchExpiresAt: new Date("2099-01-01") }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());
      const mockAdapter = makeMockAdapter();
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ id: "run-delta", syncMode: "DELTA" }));
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "SCHEDULED",
      });

      expect(result.success).toBe(true);
      expect(result.syncMode).toBe("DELTA");
      expect(result.triggerSource).toBe("SCHEDULED");
      expect(mockAdapter.syncDelta).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: expect.objectContaining({ value: "1000" }),
        }),
      );
      expect(upsertMailboxCursor).toHaveBeenCalled();
    });

    it("does not advance cursor if ingestion fails", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, upsertMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const failingAdapter = {
        syncDelta: vi.fn().mockRejectedValue(new Error("Network error")),
      };
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(failingAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
      });

      expect(result.success).toBe(false);
      expect(upsertMailboxCursor).not.toHaveBeenCalled();
    });

    it("runs a bounded Gmail coverage recovery before delta for old inbox-only connections", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, upsertMailboxCursor } = await import("@/lib/mailbox/cursor-service");
      const { getIncompleteRequiredFolders, getFolderCoverage } = await import("@/lib/mailbox/folder-coverage-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({
          watchExpiresAt: new Date("2099-01-01"),
          watchMetadata: { gmailHistoryId: "hist-1" },
        }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      // Simulate that SENT, SPAM, and DRAFT are still incomplete.
      vi.mocked(getIncompleteRequiredFolders).mockResolvedValue(["SENT", "SPAM", "DRAFT"]);
      vi.mocked(getFolderCoverage).mockImplementation(async (_orgId, _connId, folder) => ({
        folder,
        state: "BOOTSTRAPPING",
        totalThreads: 10,
        lastCompletedAt: null,
        lastAdvancedCursor: `cursor-${folder.toLowerCase()}`,
        errorSummary: null,
      }));

      const mockAdapter = makeMockAdapter();
      mockAdapter.syncDelta
        .mockResolvedValueOnce({
          threads: [{
            providerThreadId: "gmail-thread-recovery",
            subject: "Recovered Sent",
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            participants: [{ email: "sent@example.com", displayName: "Sent" }],
            providerMetadata: {},
          }],
          nextCursor: { value: "bootstrap-now", expiresAt: null },
          bootstrapSliceResults: [
            { sliceLabel: "SENT", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "sent-cursor" },
            { sliceLabel: "SPAM", paginationExhausted: false, threadCount: 1, lastAdvancedCursor: "spam-cursor" },
            { sliceLabel: "DRAFT", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "draft-cursor" },
          ],
        })
        .mockResolvedValueOnce({
          threads: [{
            providerThreadId: "gmail-thread-delta",
            subject: "Fresh Delta",
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            participants: [{ email: "delta@example.com", displayName: "Delta" }],
            providerMetadata: {},
          }],
          nextCursor: { value: "cursor-next", expiresAt: null },
        });
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ id: "run-delta", syncMode: "DELTA" }));
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
      expect(result.syncMode).toBe("DELTA");
      expect(result.threadCount).toBe(2);
      expect(mockAdapter.syncDelta).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          cursor: null,
          folderCursors: {
            SENT: "cursor-sent",
            SPAM: "cursor-spam",
            DRAFT: "cursor-draft",
          },
        }),
      );
      expect(mockAdapter.syncDelta).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          cursor: expect.objectContaining({ value: "1000" }),
        }),
      );
      expect(upsertMailboxCursor).toHaveBeenCalledWith(
        expect.objectContaining({ cursorValue: "cursor-next" }),
      );
      // Coverage completion truth is now in mailboxFolderCoverage rows, not metadata flags.
      expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            watchMetadata: expect.objectContaining({
              gmailCoverageVersion: expect.anything(),
            }),
          }),
        }),
      );
    });

    it("skips Gmail coverage recovery once required coverage metadata already exists", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");
      const { getIncompleteRequiredFolders } = await import("@/lib/mailbox/folder-coverage-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({
          watchExpiresAt: new Date("2099-01-01"),
          watchMetadata: {
            gmailCoverageVersion: 4,
            gmailCoveredSystemLabels: ["INBOX", "SENT", "SPAM", "DRAFT"],
          },
        }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());
      // All required folders are already COMPLETE in the database — metadata flags are ignored.
      vi.mocked(getIncompleteRequiredFolders).mockResolvedValue([]);
      const mockAdapter = makeMockAdapter();
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ id: "run-delta", syncMode: "DELTA" }));
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
      expect(mockAdapter.syncDelta).toHaveBeenCalledTimes(1);
      expect(mockAdapter.syncDelta).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: expect.objectContaining({ value: "1000" }),
        }),
      );
    });
  });

  // ─── Watch renewal ────────────────────────────────────────────────────────

  describe("Watch renewal", () => {
    it("renews watch before delta sync when watch is expired", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, deleteMailboxCursors } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({ watchExpiresAt: new Date("2020-01-01") }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const mockAdapter = makeMockAdapter();
      mockAdapter.renewWatch.mockResolvedValue({
        expiresAt: new Date("2099-01-01"),
        metadata: { gmailHistoryId: "hist-2" },
      });
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
        triggerSource: "RENEWAL",
      });

      expect(result.success).toBe(true);
      expect(mockAdapter.renewWatch).toHaveBeenCalled();
      expect(deleteMailboxCursors).not.toHaveBeenCalled();
    });

    it("falls back to INITIAL when watch renewal fails", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, deleteMailboxCursors } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({ watchExpiresAt: new Date("2020-01-01") }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const mockAdapter = makeMockAdapter();
      mockAdapter.renewWatch.mockResolvedValue({
        category: "watch_expired",
        safeMessage: "Push topic not configured",
        retryable: false,
      });
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
        triggerSource: "RENEWAL",
      });

      expect(result.success).toBe(true);
      expect(deleteMailboxCursors).toHaveBeenCalledWith("org-1", "conn-1");
      expect(result.syncMode).toBe("INITIAL");
    });

    it("fails the sync and requires reconnect when watch renewal loses auth", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, deleteMailboxCursors } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({ watchExpiresAt: new Date("2020-01-01") }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const mockAdapter = makeMockAdapter();
      mockAdapter.renewWatch.mockResolvedValue({
        category: "auth_expired",
        safeMessage: "Token revoked",
        retryable: false,
      });
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ syncMode: "DELTA" }));
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "RENEWAL",
      });

      expect(result.success).toBe(false);
      expect(result.error?.category).toBe("auth_expired");
      expect(deleteMailboxCursors).not.toHaveBeenCalled();
      expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }),
        }),
      );
    });
  });

  // ─── Trigger sources ──────────────────────────────────────────────────────

  describe("Trigger source support", () => {
    it("persists MANUAL trigger source by default", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
      });

      expect(mockDb.mailboxSyncRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ triggerSource: "MANUAL" }),
        }),
      );
    });

    it("persists SCHEDULED trigger source when passed", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(makeMockAdapter() as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ triggerSource: "SCHEDULED" }));
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "SCHEDULED",
      });

      expect(result.triggerSource).toBe("SCHEDULED");
    });
  });

  // ─── Public route trigger trust boundary ────────────────────────────────

  describe("Public sync route", () => {
    it("rejects non-manual trigger sources on the public route", async () => {
      const { requireIntegrationAdminRoute } = await import("@/app/api/integrations/_auth");
      const { POST } = await import("@/app/api/mailbox/sync/route");

      vi.mocked(requireIntegrationAdminRoute).mockResolvedValue({
        ok: true,
        ctx: { orgId: "org-1", userId: "user-1" },
      } as never);

      const request = new NextRequest("http://localhost/api/mailbox/sync", {
        method: "POST",
        body: JSON.stringify({
          mailboxConnectionId: "conn-1",
          triggerSource: "SCHEDULED",
        }),
      });

      const response = await POST(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toContain("MANUAL");
    });
  });

  // ─── Provider error mapping ───────────────────────────────────────────────

  describe("Provider error handling", () => {
    it("maps auth_expired to RECONNECT_REQUIRED connection status", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);

      const authErrorAdapter = {
        syncDelta: vi.fn().mockResolvedValue({
          category: "auth_expired",
          safeMessage: "Token revoked",
          retryable: false,
        }),
      };
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(authErrorAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.category).toBe("auth_expired");
      expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }),
        }),
      );
    });

    it("does not corrupt cursor on watch_expired error", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor, upsertMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const watchExpiredAdapter = {
        syncDelta: vi.fn().mockResolvedValue({
          category: "watch_expired",
          safeMessage: "History expired",
          retryable: false,
        }),
      };
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(watchExpiredAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      const result = await runMailboxSync({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
      });

      expect(result.success).toBe(false);
      expect(upsertMailboxCursor).not.toHaveBeenCalled();
    });
  });

  // ─── Replay safety / idempotency ──────────────────────────────────────────

  describe("Replay safety", () => {
    it("repeated delta sync runs remain safe and do not duplicate data", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord({
        watchMetadata: {
          gmailCoverageVersion: 4,
          gmailCoveredSystemLabels: ["INBOX", "SENT", "SPAM", "DRAFT"],
        },
      }));
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());
      const mockAdapter = makeMockAdapter();
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow());
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});

      mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

      // First run.
      const r1 = await runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" });
      // Second run (same cursor, same adapter).
      const r2 = await runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      // Upsert semantics in ingestion-service guarantee idempotency.
      expect(mockDb.mailboxThread.upsert).toHaveBeenCalledTimes(2);
      expect(mockAdapter.syncDrafts).toHaveBeenCalledTimes(2);
    });
  });

  describe("Gmail coverage metadata", () => {
    it("persists required Gmail folder coverage after a successful initial sync", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");
      const { markFolderCoverageComplete, updateFolderCoverageBootstrapping } = await import("@/lib/mailbox/folder-coverage-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(makeConnectionRecord());
      vi.mocked(getMailboxCursor).mockResolvedValue(null);
      const mockAdapter = makeMockAdapter();
      mockAdapter.syncDelta.mockResolvedValue({
        threads: [{
          providerThreadId: "gmail-thread-1",
          subject: "Test",
          lastMessageAt: new Date().toISOString(),
          unreadCount: 0,
          participants: [{ email: "a@example.com", displayName: "A" }],
          providerMetadata: {},
        }],
        nextCursor: { value: "cursor-next", expiresAt: null },
        bootstrapSliceResults: [
          { sliceLabel: "INBOX", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "inbox-cursor" },
          { sliceLabel: "SENT", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "sent-cursor" },
          { sliceLabel: "SPAM", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "spam-cursor" },
          { sliceLabel: "DRAFT", paginationExhausted: true, threadCount: 1, lastAdvancedCursor: "draft-cursor" },
        ],
      });
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ syncMode: "INITIAL" }));
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
      // Coverage completion truth comes from per-folder rows, not metadata flags.
      expect(markFolderCoverageComplete).toHaveBeenCalledWith(
        "org-1", "conn-1", "INBOX", 1, "inbox-cursor",
      );
      expect(markFolderCoverageComplete).toHaveBeenCalledWith(
        "org-1", "conn-1", "SENT", 1, "sent-cursor",
      );
      expect(markFolderCoverageComplete).toHaveBeenCalledWith(
        "org-1", "conn-1", "SPAM", 1, "spam-cursor",
      );
      expect(markFolderCoverageComplete).toHaveBeenCalledWith(
        "org-1", "conn-1", "DRAFT", 1, "draft-cursor",
      );
      expect(updateFolderCoverageBootstrapping).not.toHaveBeenCalled();
      expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            watchMetadata: expect.objectContaining({
              gmailCoverageVersion: expect.anything(),
            }),
          }),
        }),
      );
    });
  });

  // Sprint 3.3 regression: derived thread summary helpers must actually be wired.
  describe("Thread summary derivation wiring", () => {
    it("persists previewSnippet and attachmentCount after message ingestion", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue(
        makeConnectionRecord({ watchExpiresAt: new Date("2099-01-01") }),
      );
      vi.mocked(getMailboxCursor).mockResolvedValue(makeCursorRecord());

      const mockAdapter = makeMockAdapter({
        snippet: "latest normalized snippet",
        attachmentCount: 2,
      });
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      mockDb.mailboxSyncRun.findFirst.mockResolvedValue(null);
      mockDb.mailboxSyncRun.create.mockResolvedValue(makeSyncRunRow({ syncMode: "DELTA" }));
      mockDb.mailboxSyncRun.update.mockResolvedValue({});
      mockDb.mailboxConnection.update.mockResolvedValue({});
      mockDb.mailboxThread.updateMany.mockResolvedValue({ count: 1 });
      mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow({
        snippet: "latest normalized snippet",
        attachmentCount: 2,
      }));

      await runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" });

      expect(mockDb.mailboxThread.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previewSnippet: "latest normalized snippet",
            attachmentCount: 2,
          }),
        }),
      );
    });
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConnection(overrides: Partial<MailboxConnectionRecord> = {}): MailboxConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GMAIL",
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE",
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
    ...overrides,
  };
}

function makeCursor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cursor-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    provider: "GMAIL" as const,
    cursorType: "HISTORY_ID" as const,
    cursorValue: "cursor-1",
    expiresAt: new Date("2099-01-01"),
    lastAdvancedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeConnectionRecord(overrides: Partial<MailboxConnectionRecord> = {}): MailboxConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GMAIL",
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE",
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

function makeMockAdapter(overrides: { snippet?: string; attachmentCount?: number } = {}) {
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
      activeDraftMessageIds: [],
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
        snippet: overrides.snippet ?? "Hello",
        sentAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        attachmentCount: overrides.attachmentCount ?? 0,
        providerMetadata: {},
        htmlBody: "<p>Hello</p>",
        textBody: "Hello",
        attachments: [],
      }],
    }),
    disconnect: vi.fn(),
    renewWatch: vi.fn().mockResolvedValue({
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      metadata: { gmailHistoryId: "hist-bootstrap", gmailWatchExpiration: "4102444800000" },
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

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  };
}
