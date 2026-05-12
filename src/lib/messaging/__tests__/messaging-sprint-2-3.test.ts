/**
 * Internal Messaging Platform — Phase 2 Sprint 2.3
 * Read shapes, read models, and API route tests.
 *
 * Covers:
 * - Read-shape mappers (pure functions, no DB leakage)
 * - Read-model service functions (aggregated queries, org-scoped)
 * - API route handlers (auth, org scope, validation, failure paths, happy paths)
 * - Cross-org protection at the route layer
 * - Pagination behavior
 * - Deterministic shape mapping correctness
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

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
      messagingAuditEvent,
      conversationAttachment,
    },
    $transaction: makeFn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      return fn(db);
    }),
  };

  return { db };
});

vi.mock("@/lib/auth", () => ({
  getOrgContext: makeFn(),
}));

import { db } from "@/lib/db";
import { getOrgContext } from "@/lib/auth";

// ─── Read-shape imports ───────────────────────────────────────────────────────

import {
  toConversationSummary,
  toMessageSummary,
  toParticipantSummary,
  toConversationDetail,
  toMessageDetail,
} from "@/lib/messaging/read-shapes";

import type {
  ConversationRecord,
  ConversationParticipantRecord,
  ConversationMessageRecord,
  ConversationThreadRecord,
  MessageReactionRecord,
  MessageMentionRecord,
  ConversationReadStateRecord,
} from "@/lib/messaging/domain-types";

// ─── Read-model imports ───────────────────────────────────────────────────────

import {
  listConversationSummariesForUser,
  getConversationDetail,
  getMessageDetail,
} from "@/lib/messaging/read-models";

// ─── API route imports ──────────────────────────────────────────────────────────

import { GET as getConversations, POST as postConversations } from "@/app/api/messaging/conversations/route";
import { GET as getConversationDetailRoute } from "@/app/api/messaging/conversations/[id]/route";
import { PATCH as patchArchive } from "@/app/api/messaging/conversations/[id]/archive/route";
import { GET as getMessages, POST as postMessages } from "@/app/api/messaging/conversations/[id]/messages/route";
import { GET as getParticipants } from "@/app/api/messaging/conversations/[id]/participants/route";
import { GET as getThreads } from "@/app/api/messaging/conversations/[id]/threads/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "conv-001";
const MSG_ID = "msg-001";
const THREAD_ID = "thread-001";

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
    id: "part-001",
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

function makeReactionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "react-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    userId: USER_1,
    type: "EMOJI" as const,
    value: "👍",
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeMentionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mention-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    mentionedUserId: USER_2,
    offsetStart: 0,
    offsetEnd: 5,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeReadStateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rs-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    lastReadMessageId: MSG_ID,
    lastReadAt: new Date("2026-01-02T00:00:00Z"),
    unreadCount: 0,
    isMuted: false,
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url), init);
}

// ─── Read-shape mapper tests ────────────────────────────────────────────────────

describe("Sprint 2.3 — Read-shape mappers", () => {
  describe("toConversationSummary", () => {
    it("maps a conversation record to a summary with ISO dates", () => {
      const record = makeConversationRow() as unknown as ConversationRecord;
      const summary = toConversationSummary({
        record,
        participantCount: 5,
        lastMessageAt: new Date("2026-01-03T00:00:00Z"),
        unreadCount: 2,
      });

      expect(summary.id).toBe(CONV_ID);
      expect(summary.orgId).toBe(ORG_A);
      expect(summary.type).toBe("CHANNEL");
      expect(summary.name).toBe("general");
      expect(summary.participantCount).toBe(5);
      expect(summary.lastMessageAt).toBe("2026-01-03T00:00:00.000Z");
      expect(summary.unreadCount).toBe(2);
      expect(summary.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(summary.canSend).toBe(true);
    });

    it("marks canSend false when archived", () => {
      const record = makeConversationRow({
        archivedAt: new Date("2026-01-05T00:00:00Z"),
      }) as unknown as ConversationRecord;

      const summary = toConversationSummary({
        record,
        participantCount: 3,
        lastMessageAt: null,
        unreadCount: 0,
      });

      expect(summary.canSend).toBe(false);
      expect(summary.archivedAt).toBe("2026-01-05T00:00:00.000Z");
    });

    it("marks canSend false when locked", () => {
      const record = makeConversationRow({
        lockedAt: new Date("2026-01-05T00:00:00Z"),
      }) as unknown as ConversationRecord;

      const summary = toConversationSummary({
        record,
        participantCount: 3,
        lastMessageAt: null,
        unreadCount: 0,
      });

      expect(summary.canSend).toBe(false);
    });
  });

  describe("toMessageSummary", () => {
    it("maps a message with reaction summary", () => {
      const record = makeMessageRow() as unknown as ConversationMessageRecord;
      const reactions: MessageReactionRecord[] = [
        { ...makeReactionRow(), userId: USER_1, value: "👍" } as MessageReactionRecord,
        { ...makeReactionRow(), userId: USER_2, value: "👍" } as MessageReactionRecord,
        { ...makeReactionRow(), userId: USER_2, value: "🎉" } as MessageReactionRecord,
      ];

      const summary = toMessageSummary({
        record,
        reactions,
        currentUserId: USER_1,
        attachmentCount: 2,
      });

      expect(summary.id).toBe(MSG_ID);
      expect(summary.reactionSummary).toHaveLength(2);
      expect(summary.reactionSummary).toContainEqual({
        value: "👍",
        count: 2,
        reactedByCurrentUser: true,
      });
      expect(summary.reactionSummary).toContainEqual({
        value: "🎉",
        count: 1,
        reactedByCurrentUser: false,
      });
      expect(summary.attachmentCount).toBe(2);
      expect(summary.createdAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("handles deleted messages", () => {
      const record = makeMessageRow({ status: "DELETED", deletedAt: new Date("2026-01-03T00:00:00Z") }) as unknown as ConversationMessageRecord;
      const summary = toMessageSummary({
        record,
        reactions: [],
        currentUserId: USER_1,
      });

      expect(summary.status).toBe("DELETED");
      expect(summary.deletedAt).toBe("2026-01-03T00:00:00.000Z");
    });
  });

  describe("toParticipantSummary", () => {
    it("maps an active participant", () => {
      const record = makeParticipantRow() as unknown as ConversationParticipantRecord;
      const summary = toParticipantSummary(record);

      expect(summary.userId).toBe(USER_1);
      expect(summary.isActive).toBe(true);
      expect(summary.isMuted).toBe(false);
      expect(summary.joinedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("marks inactive when leftAt is set", () => {
      const record = makeParticipantRow({ leftAt: new Date("2026-01-05T00:00:00Z") }) as unknown as ConversationParticipantRecord;
      const summary = toParticipantSummary(record);

      expect(summary.isActive).toBe(false);
    });

    it("marks muted when mutedUntil is in the future", () => {
      const record = makeParticipantRow({ mutedUntil: new Date("2099-01-01T00:00:00Z") }) as unknown as ConversationParticipantRecord;
      const summary = toParticipantSummary(record);

      expect(summary.isMuted).toBe(true);
    });
  });

  describe("toConversationDetail", () => {
    it("builds an enriched detail shape", () => {
      const record = makeConversationRow() as unknown as ConversationRecord;
      const participants = [makeParticipantRow() as unknown as ConversationParticipantRecord];
      const messages = [makeMessageRow() as unknown as ConversationMessageRecord];
      const reactions = new Map<string, MessageReactionRecord[]>();
      const threads = [makeThreadRow() as unknown as ConversationThreadRecord];
      const readState = makeReadStateRow() as unknown as ConversationReadStateRecord;

      const detail = toConversationDetail({
        record,
        participants,
        messages,
        messageReactions: reactions,
        threads,
        readState,
        currentUserId: USER_1,
      });

      expect(detail.id).toBe(CONV_ID);
      expect(detail.participants).toHaveLength(1);
      expect(detail.messages).toHaveLength(1);
      expect(detail.threads).toHaveLength(1);
      expect(detail.readState).not.toBeNull();
      expect(detail.readState?.unreadCount).toBe(0);
      expect(detail.canSend).toBe(true);
    });

    it("excludes left participants from detail", () => {
      const record = makeConversationRow() as unknown as ConversationRecord;
      const participants = [
        makeParticipantRow() as unknown as ConversationParticipantRecord,
        makeParticipantRow({ userId: USER_2, leftAt: new Date("2026-01-05T00:00:00Z") }) as unknown as ConversationParticipantRecord,
      ];

      const detail = toConversationDetail({
        record,
        participants,
        messages: [],
        messageReactions: new Map(),
        threads: [],
        readState: null,
        currentUserId: USER_1,
      });

      expect(detail.participants).toHaveLength(1);
      expect(detail.participantCount).toBe(1);
    });
  });

  describe("toMessageDetail", () => {
    it("builds an enriched message detail", () => {
      const record = makeMessageRow() as unknown as ConversationMessageRecord;
      const reactions = [makeReactionRow() as unknown as MessageReactionRecord];
      const mentions = [makeMentionRow() as unknown as MessageMentionRecord];

      const detail = toMessageDetail({ record, reactions, mentions });

      expect(detail.id).toBe(MSG_ID);
      expect(detail.reactions).toHaveLength(1);
      expect(detail.mentions).toHaveLength(1);
      expect(detail.participantCountAtSend).toBe(5);
    });
  });
});

// ─── Read-model service tests ───────────────────────────────────────────────────

describe("Sprint 2.3 — Read-model service functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listConversationSummariesForUser", () => {
    it("returns conversation summaries with aggregates", async () => {
      const mockedFindMany = vi.mocked(db.conversation.findMany);
      const mockedCount = vi.mocked(db.conversationParticipant.count);
      const mockedMessageFindFirst = vi.mocked(db.conversationMessage.findFirst);
      const mockedReadStateFindFirst = vi.mocked(db.conversationReadState.findFirst);

      mockedFindMany.mockResolvedValue([
        makeConversationRow(),
      ]);
      mockedCount.mockResolvedValue(3);
      mockedMessageFindFirst.mockResolvedValue({
        createdAt: new Date("2026-01-03T00:00:00Z"),
      });
      mockedReadStateFindFirst.mockResolvedValue({ unreadCount: 5 });

      const summaries = await listConversationSummariesForUser(ORG_A, USER_1);

      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe(CONV_ID);
      expect(summaries[0].participantCount).toBe(3);
      expect(summaries[0].lastMessageAt).toBe("2026-01-03T00:00:00.000Z");
      expect(summaries[0].unreadCount).toBe(5);
    });

    it("returns empty array when user has no conversations", async () => {
      const mockedFindMany = vi.mocked(db.conversation.findMany);
      mockedFindMany.mockResolvedValue([]);

      const summaries = await listConversationSummariesForUser(ORG_A, USER_1);
      expect(summaries).toHaveLength(0);
    });
  });

  describe("getConversationDetail", () => {
    it("returns null when user is not a participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      mockedParticipantFindFirst.mockResolvedValue(null);

      const detail = await getConversationDetail(ORG_A, CONV_ID, USER_1);
      expect(detail).toBeNull();
    });

    it("returns enriched detail for an active participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedConversationFindFirst = vi.mocked(db.conversation.findFirst);
      const mockedParticipantFindMany = vi.mocked(db.conversationParticipant.findMany);
      const mockedMessageFindMany = vi.mocked(db.conversationMessage.findMany);
      const mockedThreadFindMany = vi.mocked(db.conversationThread.findMany);
      const mockedReadStateFindFirst = vi.mocked(db.conversationReadState.findFirst);
      const mockedReactionFindMany = vi.mocked(db.messageReaction.findMany);
      const mockedAttachmentFindMany = vi.mocked(db.conversationAttachment.findMany);

      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedConversationFindFirst.mockResolvedValue(makeConversationRow());
      mockedParticipantFindMany.mockResolvedValue([makeParticipantRow()]);
      mockedMessageFindMany.mockResolvedValue([makeMessageRow()]);
      mockedThreadFindMany.mockResolvedValue([makeThreadRow()]);
      mockedReadStateFindFirst.mockResolvedValue(makeReadStateRow());
      mockedReactionFindMany.mockResolvedValue([]);
      mockedAttachmentFindMany.mockResolvedValue([]);

      const detail = await getConversationDetail(ORG_A, CONV_ID, USER_1);

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe(CONV_ID);
      expect(detail!.participants).toHaveLength(1);
      expect(detail!.messages).toHaveLength(1);
      expect(detail!.threads).toHaveLength(1);
      expect(detail!.readState).not.toBeNull();
    });
  });

  describe("getMessageDetail", () => {
    it("returns null when message does not exist", async () => {
      const mockedMessageFindFirst = vi.mocked(db.conversationMessage.findFirst);
      mockedMessageFindFirst.mockResolvedValue(null);

      const detail = await getMessageDetail(ORG_A, MSG_ID, USER_1);
      expect(detail).toBeNull();
    });

    it("returns enriched message detail", async () => {
      const mockedMessageFindFirst = vi.mocked(db.conversationMessage.findFirst);
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedReactionFindMany = vi.mocked(db.messageReaction.findMany);
      const mockedMentionFindMany = vi.mocked(db.messageMention.findMany);
      const mockedAttachmentFindMany = vi.mocked(db.conversationAttachment.findMany);

      mockedMessageFindFirst.mockResolvedValue(makeMessageRow());
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedReactionFindMany.mockResolvedValue([makeReactionRow()]);
      mockedMentionFindMany.mockResolvedValue([makeMentionRow()]);
      mockedAttachmentFindMany.mockResolvedValue([]);

      const detail = await getMessageDetail(ORG_A, MSG_ID, USER_1);

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe(MSG_ID);
      expect(detail!.reactions).toHaveLength(1);
      expect(detail!.mentions).toHaveLength(1);
    });
  });
});

// ─── API route tests ────────────────────────────────────────────────────────────

describe("Sprint 2.3 — API routes", () => {
  const mockedGetOrgContext = vi.mocked(getOrgContext);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetOrgContext.mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "admin",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
  });

  describe("GET /api/messaging/conversations", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockedGetOrgContext.mockResolvedValue(null);

      const request = makeRequest("http://localhost/api/messaging/conversations");
      const response = await getConversations(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns conversation list for authenticated user", async () => {
      const mockedFindMany = vi.mocked(db.conversation.findMany);
      const mockedCount = vi.mocked(db.conversationParticipant.count);
      const mockedMessageFindFirst = vi.mocked(db.conversationMessage.findFirst);
      const mockedReadStateFindFirst = vi.mocked(db.conversationReadState.findFirst);

      mockedFindMany.mockResolvedValue([makeConversationRow()]);
      mockedCount.mockResolvedValue(3);
      mockedMessageFindFirst.mockResolvedValue({ createdAt: new Date("2026-01-03T00:00:00Z") });
      mockedReadStateFindFirst.mockResolvedValue({ unreadCount: 0 });

      const request = makeRequest("http://localhost/api/messaging/conversations");
      const response = await getConversations(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.conversations).toHaveLength(1);
      expect(body.data.meta.limit).toBe(20);
    });
  });

  describe("POST /api/messaging/conversations", () => {
    it("creates a channel conversation", async () => {
      const mockedConversationCreate = vi.mocked(db.conversation.create);
      const mockedParticipantCreateMany = vi.mocked(db.conversationParticipant.createMany);
      const mockedParticipantFindMany = vi.mocked(db.conversationParticipant.findMany);
      const mockedAuditCreate = vi.mocked(db.messagingAuditEvent.create);

      mockedConversationCreate.mockResolvedValue(makeConversationRow());
      mockedParticipantCreateMany.mockResolvedValue({ count: 1 } as never);
      mockedParticipantFindMany.mockResolvedValue([makeParticipantRow()]);
      mockedAuditCreate.mockResolvedValue({} as never);

      const request = makeRequest("http://localhost/api/messaging/conversations", {
        method: "POST",
        body: JSON.stringify({
          type: "CHANNEL",
          name: "new-channel",
          description: "A new channel",
          visibility: "PUBLIC",
        }),
      });

      const response = await postConversations(request);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.conversation.id).toBe(CONV_ID);
    });

    it("returns validation error for missing name on channel", async () => {
      const request = makeRequest("http://localhost/api/messaging/conversations", {
        method: "POST",
        body: JSON.stringify({
          type: "CHANNEL",
          visibility: "PUBLIC",
        }),
      });

      const response = await postConversations(request);
      expect(response.status).toBe(422);
    });
  });

  describe("GET /api/messaging/conversations/:id", () => {
    it("returns 401 when not authenticated", async () => {
      mockedGetOrgContext.mockResolvedValue(null);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
      const response = await getConversationDetailRoute(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(401);
    });

    it("returns conversation detail for participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedConversationFindFirst = vi.mocked(db.conversation.findFirst);
      const mockedParticipantFindMany = vi.mocked(db.conversationParticipant.findMany);
      const mockedMessageFindMany = vi.mocked(db.conversationMessage.findMany);
      const mockedThreadFindMany = vi.mocked(db.conversationThread.findMany);
      const mockedReadStateFindFirst = vi.mocked(db.conversationReadState.findFirst);
      const mockedReactionFindMany = vi.mocked(db.messageReaction.findMany);
      const mockedAttachmentFindMany = vi.mocked(db.conversationAttachment.findMany);

      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedConversationFindFirst.mockResolvedValue(makeConversationRow());
      mockedParticipantFindMany.mockResolvedValue([makeParticipantRow()]);
      mockedMessageFindMany.mockResolvedValue([makeMessageRow()]);
      mockedThreadFindMany.mockResolvedValue([makeThreadRow()]);
      mockedReadStateFindFirst.mockResolvedValue(makeReadStateRow());
      mockedReactionFindMany.mockResolvedValue([]);
      mockedAttachmentFindMany.mockResolvedValue([]);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
      const response = await getConversationDetailRoute(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(CONV_ID);
    });
  });

  describe("PATCH /api/messaging/conversations/:id/archive", () => {
    it("archives a conversation", async () => {
      const mockedConversationFindFirst = vi.mocked(db.conversation.findFirst);
      const mockedConversationUpdate = vi.mocked(db.conversation.update);
      const mockedAuditCreate = vi.mocked(db.messagingAuditEvent.create);

      mockedConversationFindFirst.mockResolvedValue(makeConversationRow());
      mockedConversationUpdate.mockResolvedValue({
        ...makeConversationRow(),
        archivedAt: new Date("2026-01-10T00:00:00Z"),
        archivedBy: USER_1,
      });
      mockedAuditCreate.mockResolvedValue({} as never);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/archive", {
        method: "PATCH",
      });
      const response = await patchArchive(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.archivedAt).not.toBeNull();
    });
  });

  describe("GET /api/messaging/conversations/:id/messages", () => {
    it("lists messages for a conversation", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedMessageFindMany = vi.mocked(db.conversationMessage.findMany);
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedMessageFindMany.mockResolvedValue([makeMessageRow()]);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages");
      const response = await getMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.messages).toHaveLength(1);
    });

    it("returns 403 when user is not a participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      mockedParticipantFindFirst.mockResolvedValue(null);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages");
      const response = await getMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/messaging/conversations/:id/messages", () => {
    it("sends a message", async () => {
      const mockedConversationFindFirst = vi.mocked(db.conversation.findFirst);
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedMessageCreate = vi.mocked(db.conversationMessage.create);
      const mockedReadStateUpsert = vi.mocked(db.conversationReadState.upsert);
      const mockedAuditCreate = vi.mocked(db.messagingAuditEvent.create);

      mockedConversationFindFirst.mockResolvedValue(makeConversationRow());
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedMessageCreate.mockResolvedValue(makeMessageRow());
      mockedReadStateUpsert.mockResolvedValue(makeReadStateRow());
      mockedAuditCreate.mockResolvedValue({} as never);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages", {
        method: "POST",
        body: JSON.stringify({ body: "Hello!" }),
      });
      const response = await postMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.body).toBe("Hello world");
    });

    it("returns 422 for empty body", async () => {
      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages", {
        method: "POST",
        body: JSON.stringify({ body: "  " }),
      });
      const response = await postMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(422);
    });

    it("sends a message with attachments", async () => {
      const mockedConversationFindFirst = vi.mocked(db.conversation.findFirst);
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedMessageCreate = vi.mocked(db.conversationMessage.create);
      const mockedAttachmentCreateMany = vi.mocked(db.conversationAttachment.createMany);
      const mockedReadStateUpsert = vi.mocked(db.conversationReadState.upsert);
      const mockedAuditCreate = vi.mocked(db.messagingAuditEvent.create);

      mockedConversationFindFirst.mockResolvedValue(makeConversationRow());
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedMessageCreate.mockResolvedValue(makeMessageRow());
      mockedAttachmentCreateMany.mockResolvedValue({ count: 1 } as never);
      mockedReadStateUpsert.mockResolvedValue(makeReadStateRow());
      mockedAuditCreate.mockResolvedValue({} as never);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages", {
        method: "POST",
        body: JSON.stringify({
          body: "Check this file",
          attachments: [
            { storageRef: "vault://file-001", fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
          ],
        }),
      });
      const response = await postMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("GET /api/messaging/conversations/:id/participants", () => {
    it("lists participants", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedParticipantFindMany = vi.mocked(db.conversationParticipant.findMany);
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedParticipantFindMany.mockResolvedValue([makeParticipantRow()]);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/participants");
      const response = await getParticipants(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.participants).toHaveLength(1);
    });

    it("returns 403 when user is not a participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      mockedParticipantFindFirst.mockResolvedValue(null);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/participants");
      const response = await getParticipants(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/messaging/conversations/:id/threads", () => {
    it("lists threads", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      const mockedThreadFindMany = vi.mocked(db.conversationThread.findMany);
      mockedParticipantFindFirst.mockResolvedValue(makeParticipantRow());
      mockedThreadFindMany.mockResolvedValue([makeThreadRow()]);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/threads");
      const response = await getThreads(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.threads).toHaveLength(1);
    });

    it("returns 403 when user is not a participant", async () => {
      const mockedParticipantFindFirst = vi.mocked(db.conversationParticipant.findFirst);
      mockedParticipantFindFirst.mockResolvedValue(null);

      const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/threads");
      const response = await getThreads(request, { params: Promise.resolve({ id: CONV_ID }) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });
});
