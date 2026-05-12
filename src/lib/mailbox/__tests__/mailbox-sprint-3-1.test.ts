/**
 * Mailbox Phase 3 Sprint 3.1 — Initial sync pipeline tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxThread: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxMessage: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    mailboxConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxProviderCursor: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

import { mailboxCanSync } from "@/lib/mailbox/domain-types";
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
      fetchThreadDetail: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

vi.mock("@/lib/mailbox/connection-service", () => ({
  getMailboxConnection: vi.fn(),
}));

vi.mock("@/lib/mailbox/cursor-service", () => ({
  getMailboxCursor: vi.fn(),
  upsertMailboxCursor: vi.fn(),
}));

vi.mock("@/lib/mailbox/audit", () => ({
  logMailboxAudit: vi.fn(),
}));

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: vi.fn(),
}));

describe("Sprint 3.1 — Initial sync pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.mailboxConnection.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.mailboxSyncRun.findFirst).mockResolvedValue(null);
    vi.mocked(db.mailboxThread.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  describe("Domain helpers", () => {
    it("mailboxCanSync returns true for ACTIVE connections", () => {
      expect(mailboxCanSync("ACTIVE")).toBe(true);
    });

    it("mailboxCanSync returns false for non-ACTIVE connections", () => {
      expect(mailboxCanSync("RECONNECT_REQUIRED")).toBe(false);
      expect(mailboxCanSync("DEGRADED")).toBe(false);
      expect(mailboxCanSync("DISCONNECTED")).toBe(false);
    });
  });

  describe("Ingestion idempotency", () => {
    it("upserts a thread without duplication on rerun", async () => {
      const mockThread = {
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
      vi.mocked(db.mailboxThread.upsert).mockResolvedValue(mockThread);

      const envelope = {
        providerThreadId: "gmail-thread-1",
        subject: "Test",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        participants: [{ email: "a@example.com", displayName: "A" }],
        providerMetadata: {},
      };

      const t1 = await upsertMailboxThread({ orgId: "org-1", mailboxConnectionId: "conn-1", envelope });
      const t2 = await upsertMailboxThread({ orgId: "org-1", mailboxConnectionId: "conn-1", envelope });
      expect(t1.id).toBe(t2.id);
      expect(db.mailboxThread.upsert).toHaveBeenCalledTimes(2);
    });

    it("upserts a message without duplication on rerun", async () => {
      const mockMessage = {
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
      vi.mocked(db.mailboxMessage.upsert).mockResolvedValue(mockMessage);

      const envelope = {
        providerMessageId: "gmail-msg-1",
        rfcMessageId: null,
        direction: "inbound" as const,
        from: { email: "a@example.com", displayName: "A" },
        to: [],
        cc: [],
        bcc: [],
        subject: "Test",
        snippet: "Hello",
        sentAt: new Date().toISOString(),
        receivedAt: null,
        attachmentCount: 0,
        providerMetadata: {},
        htmlBody: "<p>Hello</p>",
        textBody: "Hello",
      };

      const m1 = await upsertMailboxMessage({ orgId: "org-1", threadId: "thread-1", envelope, mailboxEmail: "b@example.com" });
      const m2 = await upsertMailboxMessage({ orgId: "org-1", threadId: "thread-1", envelope, mailboxEmail: "b@example.com" });
      expect(m1.id).toBe(m2.id);
      expect(db.mailboxMessage.upsert).toHaveBeenCalledTimes(2);
    });

    it("upserts an attachment without duplication on rerun", async () => {
      const mockAttachment = {
        id: "attach-1",
        messageId: "msg-1",
        providerAttachmentId: "gmail-attach-1",
        filename: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
        isInline: false,
        storageRef: null,
        createdAt: new Date(),
      };
      vi.mocked(db.mailboxAttachment.upsert).mockResolvedValue(mockAttachment);

      const envelope = {
        providerAttachmentId: "gmail-attach-1",
        filename: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
        isInline: false,
      };

      const a1 = await upsertMailboxAttachment({ messageId: "msg-1", envelope });
      const a2 = await upsertMailboxAttachment({ messageId: "msg-1", envelope });
      expect(a1.id).toBe(a2.id);
      expect(db.mailboxAttachment.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe("Sync orchestration", () => {
    it("creates normalized thread, message, and sync run rows on success", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue({
        id: "conn-1",
        orgId: "org-1",
        provider: "GMAIL",
        status: "ACTIVE",
        tokenRef: "token-1",
        emailAddress: "ops@example.com",
      } as unknown as Awaited<ReturnType<typeof getMailboxConnection>>);

      vi.mocked(getMailboxCursor).mockResolvedValue(null);

      const mockAdapter = {
        syncDelta: vi.fn().mockResolvedValue({
          threads: [{
            providerThreadId: "gmail-thread-sync",
            subject: "Sync Test",
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            participants: [{ email: "a@example.com", displayName: "A" }],
            providerMetadata: {},
          }],
          nextCursor: { value: "cursor-1", expiresAt: null },
        }),
        fetchThreadDetail: vi.fn().mockResolvedValue({
          messages: [{
            providerMessageId: "gmail-msg-sync",
            rfcMessageId: "<sync@example.com>",
            direction: "inbound",
            from: { email: "a@example.com", displayName: "A" },
            to: [{ email: "b@example.com", displayName: "B" }],
            cc: [],
            bcc: [],
            subject: "Sync Test",
            snippet: "Sync body",
            sentAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            attachmentCount: 0,
            providerMetadata: {},
            htmlBody: "<p>Sync body</p>",
            textBody: "Sync body",
          }],
        }),
      };
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      vi.mocked(db.mailboxThread.upsert).mockResolvedValue({
        id: "thread-sync",
        orgId: "org-1",
        mailboxConnectionId: "conn-1",
        providerThreadId: "gmail-thread-sync",
        subject: "Sync Test",
        participantsSummary: [],
        lastMessageAt: new Date(),
        unreadCount: 0,
        status: "OPEN",
        assigneeId: null,
        isFlagged: false,
        primaryLinkSummary: null,
        previewSnippet: "",
        attachmentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(db.mailboxMessage.upsert).mockResolvedValue({
        id: "msg-sync",
        orgId: "org-1",
        threadId: "thread-sync",
        providerMessageId: "gmail-msg-sync",
        rfcMessageId: null,
        direction: "inbound",
        from: { email: "a@example.com" },
        to: [],
        cc: [],
        bcc: [],
        subject: "Sync Test",
        snippet: "Sync body",
        htmlBody: "<p>Sync body</p>",
        textBody: "Sync body",
        sentAt: new Date(),
        receivedAt: null,
        attachmentCount: 0,
        providerMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(db.mailboxSyncRun.create).mockResolvedValue({
        id: "run-1",
        orgId: "org-1",
        mailboxConnectionId: "conn-1",
        provider: "GMAIL",
        status: "RUNNING",
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
      });

      vi.mocked(db.mailboxSyncRun.update).mockResolvedValue({} as never);
      vi.mocked(db.mailboxConnection.update).mockResolvedValue({} as never);

      const result = await runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" });

      expect(result.success).toBe(true);
      expect(result.threadCount).toBe(1);
      expect(result.messageCount).toBe(1);
      expect(db.mailboxSyncRun.create).toHaveBeenCalled();
      expect(db.mailboxSyncRun.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }));
    });

    it("creates a FAILED sync run on provider error", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      const { getMailboxProviderAdapter } = await import("@/lib/mailbox/provider-registry");
      const { getMailboxCursor } = await import("@/lib/mailbox/cursor-service");

      vi.mocked(getMailboxConnection).mockResolvedValue({
        id: "conn-1",
        orgId: "org-1",
        provider: "GMAIL",
        status: "ACTIVE",
        tokenRef: "token-1",
        emailAddress: "ops@example.com",
      } as unknown as Awaited<ReturnType<typeof getMailboxConnection>>);

      vi.mocked(getMailboxCursor).mockResolvedValue(null);

      const mockAdapter = {
        syncDelta: vi.fn().mockResolvedValue({
          category: "auth_expired",
          safeMessage: "Token revoked",
          retryable: false,
        }),
      };
      vi.mocked(getMailboxProviderAdapter).mockReturnValue(mockAdapter as never);

      vi.mocked(db.mailboxSyncRun.create).mockResolvedValue({
        id: "run-fail",
        orgId: "org-1",
        mailboxConnectionId: "conn-1",
        provider: "GMAIL",
        status: "RUNNING",
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
      });

      vi.mocked(db.mailboxSyncRun.update).mockResolvedValue({} as never);
      vi.mocked(db.mailboxConnection.update).mockResolvedValue({} as never);

      const result = await runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" });

      expect(result.success).toBe(false);
      expect(result.error?.category).toBe("auth_expired");
      expect(db.mailboxSyncRun.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "run-fail" },
        data: expect.objectContaining({ status: "FAILED", errorCategory: "auth_expired" }),
      }));
    });

    it("rejects sync for unsyncable connections", async () => {
      const { getMailboxConnection } = await import("@/lib/mailbox/connection-service");
      vi.mocked(getMailboxConnection).mockResolvedValue({
        id: "conn-1",
        orgId: "org-1",
        provider: "GMAIL",
        status: "DISCONNECTED",
        tokenRef: "token-1",
        emailAddress: "ops@example.com",
      } as unknown as Awaited<ReturnType<typeof getMailboxConnection>>);

      await expect(runMailboxSync({ orgId: "org-1", connectionId: "conn-1", actorId: "user-1" }))
        .rejects.toThrow("not available for sync");
    });
  });
});
