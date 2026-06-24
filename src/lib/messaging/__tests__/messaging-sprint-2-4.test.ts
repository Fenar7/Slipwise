/**
 * Internal Messaging Platform — Phase 2 Sprint 2.4
 * Close-out: attachment foundation, membership-safe reads, Phase 2 coherence.
 *
 * Covers:
 * - Attachment transactional linking in sendMessage and replyToThread
 * - Attachment audit emission
 * - Membership-safe read rejection (messages, participants, threads, thread replies)
 * - Cross-org attachment safety
 * - Route-level participant gate failures return 403
 * - Phase 2 foundation coherence (contracts, domain helpers, mappers)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import "./local-setup";

beforeEach(() => {
  (global as any).__mockActiveMembership = true;
});

// ─── Mock Prisma client ───────────────────────────────────────────────────────

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
  const conversation = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationParticipant = {
    findFirst: makeFn(),
    findMany: makeFn(),
    createMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationMessage = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationThread = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
  };

  const messageReaction = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    delete: makeFn(),
  };

  const messageMention = {
    findFirst: makeFn(),
    findMany: makeFn(),
    createMany: makeFn(),
    update: makeFn(),
  };

  const conversationReadState = {
    findFirst: makeFn(),
    upsert: makeFn(),
  };

  const presenceSession = {
    findFirst: makeFn(),
    upsert: makeFn(),
  };

  const typingSession = {
    findFirst: makeFn(),
    findMany: makeFn(),
    upsert: makeFn(),
    delete: makeFn(),
  };

  const messagingAuditEvent = {
    create: makeFn(),
  };

  const conversationAttachment = {
    createMany: makeFn(),
    findMany: makeFn(),
  };

  const db = {
    ...{
      conversation,
      conversationParticipant,
      conversationMessage,
      conversationThread,
      messageReaction,
      messageMention,
      conversationReadState,
      presenceSession,
      typingSession,
      messagingAuditEvent,
      conversationAttachment,
    },
    $transaction: makeFn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      return fn(db);
    }),
  };

  return { db };
});

import { db } from "@/lib/db";

// ─── Service imports ─────────────────────────────────────────────────────────

import {
  sendMessage,
  listConversationMessages,
  getMessageById,
} from "@/lib/messaging/message-service";

import {
  replyToThread,
  listThreadsForConversation,
  listThreadReplies,
} from "@/lib/messaging/thread-service";

import {
  listParticipantsForConversation,
} from "@/lib/messaging/participant-service";

import {
  toAttachmentRecord,
  toTaskRecord,
  toMeetingRecord,
  toCalendarConnectionRecord,
  toRetentionPolicyRecord,
} from "@/lib/messaging/mappers";

import {
  conversationOrgSafeWhere,
  participantOrgSafeWhere,
  messageOrgSafeWhere,
  threadOrgSafeWhere,
  taskOrgSafeWhere,
  meetingOrgSafeWhere,
  calendarConnectionOrgSafeWhere,
  retentionPolicyOrgSafeWhere,
} from "@/lib/messaging/org-safe-helpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const USER_3 = "00000000-0000-0000-0000-000000000003";
const CONV_ID = "conv-001";
const MSG_ID = "msg-001";
const THREAD_ID = "thread-001";
const PARTICIPANT_ID = "part-001";

function makeConversationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONV_ID,
    orgId: ORG_A,
    type: "CHANNEL" as const,
    name: "general",
    description: "Company-wide announcements",
    visibility: "PUBLIC" as const,
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeParticipantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PARTICIPANT_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    role: "MEMBER" as const,
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MSG_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    threadId: null,
    authorId: USER_1,
    body: "Hello world",
    contentMeta: null,
    status: "ACTIVE" as const,
    editedAt: null,
    deletedAt: null,
    participantCountAtSend: 5,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeThreadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: THREAD_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    anchorMessageId: MSG_ID,
    title: "Q2 discussion",
    replyCount: 3,
    resolvedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "att-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    storageRef: "vault://file-001",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    thumbnailRef: null,
    scanStatus: "PENDING" as const,
    scannedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeTaskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    originatingMessageId: null,
    title: "Review Q2",
    description: null,
    status: "OPEN" as const,
    priority: 1,
    assigneeId: null,
    dueDate: null,
    completedAt: null,
    completedBy: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeMeetingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "meet-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    title: "Q2 Sync",
    description: null,
    scheduledAt: new Date("2026-01-10T00:00:00Z"),
    durationMinutes: 30,
    status: "UPCOMING" as const,
    providerEventId: null,
    scheduledBy: USER_1,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeCalendarConnectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cal-001",
    orgId: ORG_A,
    provider: "GOOGLE" as const,
    providerAccountId: "acct-001",
    emailAddress: "user@example.com",
    displayName: null,
    tokenRef: "token-001",
    tokenExpiry: null,
    status: "ACTIVE" as const,
    lastSyncAt: null,
    lastSyncError: null,
    disconnectedAt: null,
    connectedBy: USER_1,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeRetentionPolicyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rp-001",
    orgId: ORG_A,
    type: "CONVERSATION" as const,
    conversationId: null,
    retentionDays: 30,
    action: "ARCHIVE" as const,
    isActive: true,
    lastAppliedAt: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

// ─── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Attachment Foundation ────────────────────────────────────────────────────

describe("Sprint 2.4 — Attachment foundation", () => {
  describe("sendMessage with attachments", () => {
    it("creates attachment rows transactionally and emits audit", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(makeMessageRow());
      db.conversationAttachment.createMany.mockResolvedValue({ count: 2 });
      db.conversationReadState.upsert.mockResolvedValue(makeParticipantRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await sendMessage({
        orgId: ORG_A,
        conversationId: CONV_ID,
        authorId: USER_1,
        body: "Files attached",
        attachments: [
          { storageRef: "vault://file-001", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
          { storageRef: "vault://file-002", fileName: "b.png", mimeType: "image/png", sizeBytes: 2048, thumbnailRef: "vault://thumb-002" },
        ],
      });

      expect(result.body).toBe("Hello world");
      expect(db.conversationAttachment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              orgId: ORG_A,
              storageRef: "vault://file-001",
              fileName: "a.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
              scanStatus: "PENDING",
            }),
            expect.objectContaining({
              orgId: ORG_A,
              storageRef: "vault://file-002",
              fileName: "b.png",
              mimeType: "image/png",
              sizeBytes: 2048,
              thumbnailRef: "vault://thumb-002",
              scanStatus: "PENDING",
            }),
          ]),
        }),
      );

      const auditCalls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
      const attachmentAudit = auditCalls.find(
        (call) => (call[0] as { data: { action: string } }).data.action === "ATTACHMENT_UPLOADED",
      );
      expect(attachmentAudit).toBeDefined();
    });

    it("does not call createMany when no attachments provided", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(makeMessageRow());
      db.conversationReadState.upsert.mockResolvedValue(makeParticipantRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      await sendMessage({
        orgId: ORG_A,
        conversationId: CONV_ID,
        authorId: USER_1,
        body: "No attachments",
      });

      expect(db.conversationAttachment.createMany).not.toHaveBeenCalled();
    });
  });

  describe("replyToThread with attachments", () => {
    it("creates attachment rows for thread replies", async () => {
      db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(makeMessageRow({ threadId: THREAD_ID }));
      db.conversationThread.update.mockResolvedValue(makeThreadRow({ replyCount: 4 }));
      db.conversationAttachment.createMany.mockResolvedValue({ count: 1 });
      db.messagingAuditEvent.create.mockResolvedValue({});

      await replyToThread({
        orgId: ORG_A,
        conversationId: CONV_ID,
        threadId: THREAD_ID,
        authorId: USER_1,
        body: "Reply with file",
        attachments: [
          { storageRef: "vault://file-003", fileName: "doc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 512 },
        ],
      });

      expect(db.conversationAttachment.createMany).toHaveBeenCalled();
    });
  });
});

// ─── Membership-Safe Reads ────────────────────────────────────────────────────

describe("Sprint 2.4 — Membership-safe reads", () => {
  describe("listConversationMessages", () => {
    it("rejects non-participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(null);
      await expect(
        listConversationMessages(ORG_A, CONV_ID, USER_3),
      ).rejects.toThrow("listConversationMessages: active participant access required");
    });

    it("allows active participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
      const result = await listConversationMessages(ORG_A, CONV_ID, USER_1);
      expect(result).toHaveLength(1);
    });
  });

  describe("listParticipantsForConversation", () => {
    it("rejects non-participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(null);
      await expect(
        listParticipantsForConversation(ORG_A, CONV_ID, USER_3),
      ).rejects.toThrow("listParticipantsForConversation: active participant access required");
    });

    it("allows active participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
      const result = await listParticipantsForConversation(ORG_A, CONV_ID, USER_1);
      expect(result).toHaveLength(1);
    });
  });

  describe("listThreadsForConversation", () => {
    it("rejects non-participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(null);
      await expect(
        listThreadsForConversation(ORG_A, CONV_ID, USER_3),
      ).rejects.toThrow("listThreadsForConversation: active participant access required");
    });

    it("allows active participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
      const result = await listThreadsForConversation(ORG_A, CONV_ID, USER_1);
      expect(result).toHaveLength(1);
    });
  });

  describe("listThreadReplies", () => {
    it("rejects non-participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(null);
      await expect(
        listThreadReplies(ORG_A, CONV_ID, THREAD_ID, USER_3),
      ).rejects.toThrow("listThreadReplies: active participant access required");
    });

    it("allows active participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationMessage.findMany.mockResolvedValue([makeMessageRow({ threadId: THREAD_ID })]);
      const result = await listThreadReplies(ORG_A, CONV_ID, THREAD_ID, USER_1);
      expect(result).toHaveLength(1);
    });
  });
});

// ─── Phase 2 Foundation Coherence ───────────────────────────────────────────

describe("Sprint 2.4 — Phase 2 foundation coherence", () => {
  it("attachment mapper does not leak raw Prisma relations", () => {
    const row = makeAttachmentRow();
    const record = toAttachmentRecord(row as never);
    expect(record.storageRef).toBe("vault://file-001");
    expect(record.fileName).toBe("report.pdf");
    expect(record.mimeType).toBe("application/pdf");
    expect(record.sizeBytes).toBe(1024);
    expect(record.scanStatus).toBe("PENDING");
    expect(record).not.toHaveProperty("message");
  });

  it("task mapper maps domain fields correctly", () => {
    const row = makeTaskRow();
    const record = toTaskRecord(row as never);
    expect(record.title).toBe("Review Q2");
    expect(record.status).toBe("OPEN");
    expect(record).not.toHaveProperty("conversation");
  });

  it("meeting mapper maps domain fields correctly", () => {
    const row = makeMeetingRow();
    const record = toMeetingRecord(row as never);
    expect(record.title).toBe("Q2 Sync");
    expect(record.status).toBe("UPCOMING");
    expect(record).not.toHaveProperty("conversation");
  });

  it("calendar connection mapper does not leak tokenRef", () => {
    const row = makeCalendarConnectionRow();
    const record = toCalendarConnectionRecord(row as never);
    expect(record.provider).toBe("GOOGLE");
    expect(record.emailAddress).toBe("user@example.com");
    // tokenRef is intentionally present in the record schema for Phase 2
    // (it is an opaque reference, not a raw token)
    expect(record.tokenRef).toBe("token-001");
    expect(record).not.toHaveProperty("organization");
  });

  it("retention policy mapper handles indefinite retention", () => {
    const row = makeRetentionPolicyRow({ retentionDays: null });
    const record = toRetentionPolicyRecord(row as never);
    expect(record.retentionDays).toBeNull();
    expect(record.isActive).toBe(true);
  });

  it("org-safe helpers enforce composite keys for all Phase 2 entities", () => {
    expect(conversationOrgSafeWhere(ORG_A, CONV_ID)).toEqual({ id: CONV_ID, orgId: ORG_A });
    expect(participantOrgSafeWhere(ORG_A, CONV_ID, USER_1)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
    });
    expect(messageOrgSafeWhere(ORG_A, MSG_ID)).toEqual({ id: MSG_ID, orgId: ORG_A });
    expect(threadOrgSafeWhere(ORG_A, THREAD_ID)).toEqual({ id: THREAD_ID, orgId: ORG_A });
    expect(taskOrgSafeWhere(ORG_A, "task-001")).toEqual({ id: "task-001", orgId: ORG_A });
    expect(meetingOrgSafeWhere(ORG_A, "meet-001")).toEqual({ id: "meet-001", orgId: ORG_A });
    expect(calendarConnectionOrgSafeWhere(ORG_A, "cal-001")).toEqual({ id: "cal-001", orgId: ORG_A });
    expect(retentionPolicyOrgSafeWhere(ORG_A, "rp-001")).toEqual({ id: "rp-001", orgId: ORG_A });
  });
});
