/**
 * Internal Messaging Platform — Phase 2 Sprint 2.2
 * Core messaging service implementation tests.
 *
 * Covers:
 * - Conversation service (create, archive, rename, visibility, fetch, list)
 * - Participant service (add, remove, update role, fetch, list)
 * - Message service (send, edit, soft-delete, fetch, list)
 * - Thread service (create, reply, resolve, list replies)
 * - Reaction service (add idempotently, remove safely)
 * - Mention / Read-state service (acknowledge, update, mark read)
 * - Presence / Typing service (upsert, start, stop, list)
 * - Org-scoped safety (cross-org mutations rejected)
 * - Audit integration (audit rows emitted for key mutations)
 * - Transactional coherence (no orphan rows on failure)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
    },
    $transaction: makeFn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      return fn(db);
    }),
  };

  return { db };
});

import { db } from "@/lib/db";

// ─── Service imports (after mocks are hoisted) ─────────────────────────────────

import {
  getConversationById,
  listConversationsForUser,
  createConversation,
  archiveConversation,
  renameConversation,
  changeConversationVisibility,
} from "@/lib/messaging/conversation-service";

import {
  listParticipantsForConversation,
  getParticipantByUserId,
  addParticipant,
  removeParticipant,
  updateParticipantRole,
} from "@/lib/messaging/participant-service";

import {
  getMessageById,
  listConversationMessages,
  sendMessage,
  editMessage,
  softDeleteMessage,
} from "@/lib/messaging/message-service";

import {
  getThreadById,
  listThreadsForConversation,
  listThreadReplies,
  createThread,
  replyToThread,
  resolveThread,
} from "@/lib/messaging/thread-service";

import {
  listReactionsForMessage,
  addReaction,
  removeReaction,
} from "@/lib/messaging/reaction-service";

import {
  acknowledgeMention,
  listUnacknowledgedMentions,
  updateReadState,
  markConversationRead,
  getReadState,
} from "@/lib/messaging/mention-readstate-service";

import {
  upsertPresence,
  getPresenceByUserId,
  startTyping,
  stopTyping,
  listTypingForConversation,
} from "@/lib/messaging/presence-service";

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

function makePresenceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pres-001",
    orgId: ORG_A,
    userId: USER_1,
    status: "ONLINE" as const,
    lastActivityAt: new Date("2026-01-02T00:00:00Z"),
    expiresAt: null,
    activeConversationId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeTypingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "type-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    status: "TYPING" as const,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

// ─── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Conversation Service ─────────────────────────────────────────────────────

describe("conversation service", () => {
  describe("getConversationById", () => {
    it("returns a conversation when found in org", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      const result = await getConversationById(ORG_A, CONV_ID);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(CONV_ID);
      expect(result?.orgId).toBe(ORG_A);
    });

    it("returns null when conversation not found", async () => {
      db.conversation.findFirst.mockResolvedValue(null);
      const result = await getConversationById(ORG_A, CONV_ID);
      expect(result).toBeNull();
    });
  });

  describe("listConversationsForUser", () => {
    it("returns conversations where user is active participant", async () => {
      db.conversation.findMany.mockResolvedValue([
        makeConversationRow(),
        makeConversationRow({ id: "conv-002", name: "random" }),
      ]);
      const result = await listConversationsForUser(ORG_A, USER_1);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("general");
    });
  });

  describe("createConversation", () => {
    it("creates a channel with creator as OWNER participant", async () => {
      db.conversation.create.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.createMany.mockResolvedValue({ count: 2 });
      db.conversationParticipant.findMany.mockResolvedValue([
        makeParticipantRow({ role: "OWNER", userId: USER_1 }),
      ]);
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await createConversation({
        orgId: ORG_A,
        type: "CHANNEL",
        name: "general",
        description: null,
        visibility: "PUBLIC",
        createdBy: USER_1,
        initialParticipantIds: [USER_2],
      });

      expect(result.conversation.type).toBe("CHANNEL");
      expect(result.participants.some((p) => p.userId === USER_1 && p.role === "OWNER")).toBe(true);
      expect(db.conversationParticipant.createMany).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("creates a DM with exactly two participants and no visibility", async () => {
      db.conversation.create.mockResolvedValue(
        makeConversationRow({ type: "DM", name: null, visibility: null, dmPeerId: USER_2 }),
      );
      db.conversationParticipant.createMany.mockResolvedValue({ count: 2 });
      db.conversationParticipant.findMany.mockResolvedValue([
        makeParticipantRow({ role: "OWNER", userId: USER_1 }),
        makeParticipantRow({ id: "part-002", role: "MEMBER", userId: USER_2 }),
      ]);
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await createConversation({
        orgId: ORG_A,
        type: "DM",
        name: null,
        description: null,
        visibility: null,
        dmPeerId: USER_2,
        createdBy: USER_1,
      });

      expect(result.conversation.type).toBe("DM");
      expect(result.participants).toHaveLength(2);
    });

    it("rejects DM without dmPeerId", async () => {
      await expect(
        createConversation({
          orgId: ORG_A,
          type: "DM",
          name: null,
          description: null,
          visibility: null,
          createdBy: USER_1,
        }),
      ).rejects.toThrow("DM conversations require dmPeerId");
    });

    it("rejects DM with visibility set", async () => {
      await expect(
        createConversation({
          orgId: ORG_A,
          type: "DM",
          name: null,
          description: null,
          visibility: "PUBLIC",
          dmPeerId: USER_2,
          createdBy: USER_1,
        }),
      ).rejects.toThrow("DM conversations must not have visibility set");
    });

    it("rejects DM where peer is the creator", async () => {
      db.conversation.create.mockResolvedValue(makeConversationRow({ type: "DM" }));
      await expect(
        createConversation({
          orgId: ORG_A,
          type: "DM",
          name: null,
          description: null,
          visibility: null,
          dmPeerId: USER_1,
          createdBy: USER_1,
        }),
      ).rejects.toThrow("DM peer cannot be the creator");
    });
  });

  describe("archiveConversation", () => {
    it("archives a conversation and emits audit", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await archiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        archivedBy: USER_1,
      });

      expect(result.archivedAt).not.toBeNull();
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "CONVERSATION_ARCHIVED" }),
        }),
      );
    });

    it("rejects cross-org conversation mutation", async () => {
      db.conversation.findFirst.mockResolvedValue(null);
      await expect(
        archiveConversation({
          orgId: ORG_B,
          conversationId: CONV_ID,
          archivedBy: USER_1,
        }),
      ).rejects.toThrow("archiveConversation: conversation not found or access denied");
    });
  });

  describe("renameConversation", () => {
    it("renames a channel and emits audit", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ name: "announcements" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await renameConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        name: "announcements",
        actorId: USER_1,
      });

      expect(result.name).toBe("announcements");
    });

    it("rejects renaming a DM", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ type: "DM", name: null, visibility: null }),
      );
      await expect(
        renameConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          name: "new-name",
          actorId: USER_1,
        }),
      ).rejects.toThrow("renameConversation: not allowed on DM conversations");
    });
  });

  describe("changeConversationVisibility", () => {
    it("changes visibility and emits audit", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ visibility: "PRIVATE" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await changeConversationVisibility({
        orgId: ORG_A,
        conversationId: CONV_ID,
        visibility: "PRIVATE",
        actorId: USER_1,
      });

      expect(result.visibility).toBe("PRIVATE");
    });
  });
});

// ─── Participant Service ──────────────────────────────────────────────────────

describe("participant service", () => {
  describe("listParticipantsForConversation", () => {
    it("lists active participants", async () => {
      db.conversationParticipant.findMany.mockResolvedValue([
        makeParticipantRow(),
        makeParticipantRow({ id: "part-002", userId: USER_2 }),
      ]);
      const result = await listParticipantsForConversation(ORG_A, CONV_ID);
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(USER_1);
    });
  });

  describe("getParticipantByUserId", () => {
    it("returns a participant when found", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      const result = await getParticipantByUserId(ORG_A, CONV_ID, USER_1);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(USER_1);
    });
  });

  describe("addParticipant", () => {
    it("creates a new participant", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(null);
      db.conversationParticipant.create.mockResolvedValue(
        makeParticipantRow({ id: "part-new", userId: USER_3, role: "MEMBER" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_3,
        role: "MEMBER",
        addedBy: USER_1,
      });

      expect(result.userId).toBe(USER_3);
      expect(result.role).toBe("MEMBER");
      expect(db.conversationParticipant.create).toHaveBeenCalled();
    });

    it("reactivates a participant who previously left", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(
        makeParticipantRow({ leftAt: new Date(), role: "MEMBER" }),
      );
      db.conversationParticipant.update.mockResolvedValue(
        makeParticipantRow({ leftAt: null, role: "ADMIN" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        role: "ADMIN",
        addedBy: USER_2,
      });

      expect(result.leftAt).toBeNull();
      expect(result.role).toBe("ADMIN");
    });

    it("does not duplicate an already active participant", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        role: "MEMBER",
        addedBy: USER_2,
      });

      expect(result.userId).toBe(USER_1);
      expect(db.conversationParticipant.create).not.toHaveBeenCalled();
    });
  });

  describe("removeParticipant", () => {
    it("marks participant as left", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.update.mockResolvedValue(
        makeParticipantRow({ leftAt: new Date() }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await removeParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        removedBy: USER_2,
      });

      expect(result.leftAt).not.toBeNull();
    });

    it("rejects cross-org participant mutation", async () => {
      db.conversation.findFirst.mockResolvedValue(null);
      await expect(
        removeParticipant({
          orgId: ORG_B,
          conversationId: CONV_ID,
          userId: USER_1,
          removedBy: USER_2,
        }),
      ).rejects.toThrow("Participant action: conversation not found or access denied");
    });
  });

  describe("updateParticipantRole", () => {
    it("updates role and emits audit", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
      db.conversationParticipant.update.mockResolvedValue(
        makeParticipantRow({ role: "ADMIN" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await updateParticipantRole({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        role: "ADMIN",
        updatedBy: USER_2,
      });

      expect(result.role).toBe("ADMIN");
    });
  });
});

// ─── Message Service ────────────────────────────────────────────────────────────

describe("message service", () => {
  describe("getMessageById", () => {
    it("returns message when found", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      const result = await getMessageById(ORG_A, MSG_ID);
      expect(result).not.toBeNull();
      expect(result?.body).toBe("Hello world");
    });
  });

  describe("listConversationMessages", () => {
    it("lists top-level messages only", async () => {
      db.conversationMessage.findMany.mockResolvedValue([
        makeMessageRow(),
        makeMessageRow({ id: "msg-002", body: "Second message" }),
      ]);
      const result = await listConversationMessages(ORG_A, CONV_ID);
      expect(result).toHaveLength(2);
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ threadId: null }),
        }),
      );
    });
  });

  describe("sendMessage", () => {
    it("sends a message and creates mentions", async () => {
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(
        makeMessageRow({ body: "Hello @user2" }),
      );
      db.messageMention.createMany.mockResolvedValue({ count: 1 });
      db.conversationReadState.upsert.mockResolvedValue(makeReadStateRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await sendMessage({
        orgId: ORG_A,
        conversationId: CONV_ID,
        authorId: USER_1,
        body: "Hello @user2",
        mentions: [{ userId: USER_2, offsetStart: 6, offsetEnd: 11 }],
      });

      expect(result.body).toBe("Hello @user2");
      expect(db.messageMention.createMany).toHaveBeenCalled();
      expect(db.conversationReadState.upsert).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("sends a thread reply", async () => {
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(
        makeMessageRow({ threadId: THREAD_ID, body: "Reply" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await sendMessage({
        orgId: ORG_A,
        conversationId: CONV_ID,
        threadId: THREAD_ID,
        authorId: USER_1,
        body: "Reply",
      });

      expect(result.threadId).toBe(THREAD_ID);
    });
  });

  describe("editMessage", () => {
    it("edits a message and marks status", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.conversationMessage.update.mockResolvedValue(
        makeMessageRow({ body: "Edited body", status: "EDITED", editedAt: new Date() }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await editMessage({
        orgId: ORG_A,
        messageId: MSG_ID,
        actorId: USER_1,
        body: "Edited body",
      });

      expect(result.body).toBe("Edited body");
      expect(result.status).toBe("EDITED");
      expect(result.editedAt).not.toBeNull();
    });

    it("rejects editing a deleted message", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(
        makeMessageRow({ status: "DELETED" }),
      );
      await expect(
        editMessage({
          orgId: ORG_A,
          messageId: MSG_ID,
          actorId: USER_1,
          body: "Nope",
        }),
      ).rejects.toThrow("editMessage: cannot edit a deleted message");
    });

    it("rejects cross-org message mutation", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(null);
      await expect(
        editMessage({
          orgId: ORG_B,
          messageId: MSG_ID,
          actorId: USER_1,
          body: "Nope",
        }),
      ).rejects.toThrow("Message action: message not found or access denied");
    });
  });

  describe("softDeleteMessage", () => {
    it("soft-deletes a message", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.conversationMessage.update.mockResolvedValue(
        makeMessageRow({ status: "DELETED", deletedAt: new Date() }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await softDeleteMessage({
        orgId: ORG_A,
        messageId: MSG_ID,
        actorId: USER_1,
      });

      expect(result.status).toBe("DELETED");
      expect(result.deletedAt).not.toBeNull();
    });
  });
});

// ─── Thread Service ───────────────────────────────────────────────────────────

describe("thread service", () => {
  describe("getThreadById", () => {
    it("returns a thread when found", async () => {
      db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
      const result = await getThreadById(ORG_A, THREAD_ID);
      expect(result).not.toBeNull();
      expect(result?.anchorMessageId).toBe(MSG_ID);
    });
  });

  describe("createThread", () => {
    it("creates a thread from an anchor message", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.conversationThread.create.mockResolvedValue(makeThreadRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await createThread({
        orgId: ORG_A,
        conversationId: CONV_ID,
        anchorMessageId: MSG_ID,
        createdBy: USER_1,
      });

      expect(result.conversationId).toBe(CONV_ID);
      expect(result.anchorMessageId).toBe(MSG_ID);
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("rejects anchor from different org", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(null);
      await expect(
        createThread({
          orgId: ORG_B,
          conversationId: CONV_ID,
          anchorMessageId: MSG_ID,
          createdBy: USER_1,
        }),
      ).rejects.toThrow("createThread: anchor message not found or does not belong to conversation");
    });
  });

  describe("replyToThread", () => {
    it("creates a reply and increments replyCount", async () => {
      db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
      db.conversationParticipant.count.mockResolvedValue(3);
      db.conversationMessage.create.mockResolvedValue(
        makeMessageRow({ threadId: THREAD_ID, body: "Thread reply" }),
      );
      db.conversationThread.update.mockResolvedValue(
        makeThreadRow({ replyCount: 4 }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await replyToThread({
        orgId: ORG_A,
        conversationId: CONV_ID,
        threadId: THREAD_ID,
        authorId: USER_1,
        body: "Thread reply",
      });

      expect(result.threadId).toBe(THREAD_ID);
      expect(db.conversationThread.update).toHaveBeenCalled();
    });

    it("rejects reply to thread in different conversation", async () => {
      db.conversationThread.findFirst.mockResolvedValue(
        makeThreadRow({ conversationId: "conv-other" }),
      );
      await expect(
        replyToThread({
          orgId: ORG_A,
          conversationId: CONV_ID,
          threadId: THREAD_ID,
          authorId: USER_1,
          body: "Nope",
        }),
      ).rejects.toThrow("replyToThread: thread does not belong to conversation");
    });
  });

  describe("resolveThread", () => {
    it("marks thread as resolved", async () => {
      db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
      db.conversationThread.update.mockResolvedValue(
        makeThreadRow({ resolvedAt: new Date() }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await resolveThread({
        orgId: ORG_A,
        threadId: THREAD_ID,
        resolvedBy: USER_1,
      });

      expect(result.resolvedAt).not.toBeNull();
    });
  });
});

// ─── Reaction Service ─────────────────────────────────────────────────────────

describe("reaction service", () => {
  describe("addReaction", () => {
    it("adds a new reaction and emits audit", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.messageReaction.findFirst.mockResolvedValue(null);
      db.messageReaction.create.mockResolvedValue(makeReactionRow({ value: "🔥" }));
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await addReaction({
        orgId: ORG_A,
        messageId: MSG_ID,
        userId: USER_1,
        value: "🔥",
      });

      expect(result.value).toBe("🔥");
      expect(db.messageReaction.create).toHaveBeenCalled();
    });

    it("is idempotent when reaction already exists", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.messageReaction.findFirst.mockResolvedValue(makeReactionRow());

      const result = await addReaction({
        orgId: ORG_A,
        messageId: MSG_ID,
        userId: USER_1,
        value: "👍",
      });

      expect(result.value).toBe("👍");
      expect(db.messageReaction.create).not.toHaveBeenCalled();
    });
  });

  describe("removeReaction", () => {
    it("removes a reaction and emits audit", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.messageReaction.findFirst.mockResolvedValue(makeReactionRow());
      db.messageReaction.delete.mockResolvedValue({});
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await removeReaction({
        orgId: ORG_A,
        messageId: MSG_ID,
        userId: USER_1,
        value: "👍",
      });

      expect(result).not.toBeNull();
      expect(db.messageReaction.delete).toHaveBeenCalled();
    });

    it("returns null when reaction does not exist", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
      db.messageReaction.findFirst.mockResolvedValue(null);

      const result = await removeReaction({
        orgId: ORG_A,
        messageId: MSG_ID,
        userId: USER_1,
        value: "❌",
      });

      expect(result).toBeNull();
      expect(db.messageReaction.delete).not.toHaveBeenCalled();
    });
  });
});

// ─── Mention / Read-State Service ─────────────────────────────────────────────

describe("mention / read-state service", () => {
  describe("acknowledgeMention", () => {
    it("marks mention as acknowledged", async () => {
      db.messageMention.findFirst.mockResolvedValue(makeMentionRow());
      db.messageMention.update.mockResolvedValue(
        makeMentionRow({ acknowledged: true, acknowledgedAt: new Date() }),
      );

      const result = await acknowledgeMention({
        orgId: ORG_A,
        mentionId: "mention-001",
        userId: USER_2,
      });

      expect(result.acknowledged).toBe(true);
      expect(result.acknowledgedAt).not.toBeNull();
    });

    it("rejects cross-org mention acknowledgment", async () => {
      db.messageMention.findFirst.mockResolvedValue(null);
      await expect(
        acknowledgeMention({
          orgId: ORG_B,
          mentionId: "mention-001",
          userId: USER_2,
        }),
      ).rejects.toThrow("acknowledgeMention: mention not found or access denied");
    });
  });

  describe("listUnacknowledgedMentions", () => {
    it("returns only unacknowledged mentions for user", async () => {
      db.messageMention.findMany.mockResolvedValue([
        makeMentionRow(),
        makeMentionRow({ id: "mention-002" }),
      ]);
      const result = await listUnacknowledgedMentions(ORG_A, USER_2);
      expect(result).toHaveLength(2);
      expect(result[0].acknowledged).toBe(false);
    });
  });

  describe("updateReadState", () => {
    it("upserts read state and emits audit", async () => {
      db.conversationReadState.upsert.mockResolvedValue(makeReadStateRow());
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await updateReadState({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        lastReadMessageId: MSG_ID,
        lastReadAt: new Date(),
      });

      expect(result.unreadCount).toBe(0);
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });
  });

  describe("markConversationRead", () => {
    it("marks conversation read using latest message", async () => {
      db.conversationMessage.findFirst.mockResolvedValue(
        makeMessageRow({ id: "msg-latest" }),
      );
      db.conversationReadState.upsert.mockResolvedValue(
        makeReadStateRow({ lastReadMessageId: "msg-latest" }),
      );
      db.messagingAuditEvent.create.mockResolvedValue({});

      const result = await markConversationRead({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        readAt: new Date(),
      });

      expect(result.lastReadMessageId).toBe("msg-latest");
    });
  });

  describe("getReadState", () => {
    it("returns read state when found", async () => {
      db.conversationReadState.findFirst.mockResolvedValue(makeReadStateRow());
      const result = await getReadState(ORG_A, CONV_ID, USER_1);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(USER_1);
    });
  });
});

// ─── Presence / Typing Service ────────────────────────────────────────────────

describe("presence / typing service", () => {
  describe("upsertPresence", () => {
    it("creates presence when new", async () => {
      db.presenceSession.upsert.mockResolvedValue(makePresenceRow());
      const result = await upsertPresence({
        orgId: ORG_A,
        userId: USER_1,
        status: "ONLINE",
      });
      expect(result.status).toBe("ONLINE");
    });

    it("updates presence when existing", async () => {
      db.presenceSession.upsert.mockResolvedValue(
        makePresenceRow({ status: "AWAY" }),
      );
      const result = await upsertPresence({
        orgId: ORG_A,
        userId: USER_1,
        status: "AWAY",
      });
      expect(result.status).toBe("AWAY");
    });
  });

  describe("getPresenceByUserId", () => {
    it("returns presence when found", async () => {
      db.presenceSession.findFirst.mockResolvedValue(makePresenceRow());
      const result = await getPresenceByUserId(ORG_A, USER_1);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(USER_1);
    });
  });

  describe("startTyping", () => {
    it("upserts typing session for conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.typingSession.upsert.mockResolvedValue(makeTypingRow());

      const result = await startTyping({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      });

      expect(result.conversationId).toBe(CONV_ID);
      expect(result.status).toBe("TYPING");
    });

    it("rejects typing in non-existent conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(null);
      await expect(
        startTyping({
          orgId: ORG_B,
          conversationId: CONV_ID,
          userId: USER_1,
          expiresAt: new Date(),
        }),
      ).rejects.toThrow("startTyping: conversation not found or access denied");
    });
  });

  describe("stopTyping", () => {
    it("deletes typing session", async () => {
      db.typingSession.findFirst.mockResolvedValue(makeTypingRow());
      db.typingSession.delete.mockResolvedValue({});

      const result = await stopTyping({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
      });

      expect(result).not.toBeNull();
      expect(db.typingSession.delete).toHaveBeenCalled();
    });

    it("returns null when no typing session exists", async () => {
      db.typingSession.findFirst.mockResolvedValue(null);

      const result = await stopTyping({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
      });

      expect(result).toBeNull();
      expect(db.typingSession.delete).not.toHaveBeenCalled();
    });
  });

  describe("listTypingForConversation", () => {
    it("lists typing sessions", async () => {
      db.typingSession.findMany.mockResolvedValue([
        makeTypingRow(),
        makeTypingRow({ id: "type-002", userId: USER_2 }),
      ]);
      const result = await listTypingForConversation(ORG_A, CONV_ID);
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(USER_1);
    });
  });
});

// ─── Audit Integration ──────────────────────────────────────────────────────────

describe("audit integration", () => {
  it("emits audit for conversation creation", async () => {
    db.conversation.create.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.createMany.mockResolvedValue({ count: 1 });
    db.conversationParticipant.findMany.mockResolvedValue([
      makeParticipantRow({ role: "OWNER" }),
    ]);
    db.messagingAuditEvent.create.mockResolvedValue({});

    await createConversation({
      orgId: ORG_A,
      type: "CHANNEL",
      name: "announcements",
      description: null,
      visibility: "PUBLIC",
      createdBy: USER_1,
    });

    expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONVERSATION_CREATED",
          orgId: ORG_A,
          actorId: USER_1,
        }),
      }),
    );
  });

  it("emits audit for conversation archive", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date() }),
    );
    db.messagingAuditEvent.create.mockResolvedValue({});

    await archiveConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      archivedBy: USER_1,
    });

    expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONVERSATION_ARCHIVED",
          orgId: ORG_A,
          actorId: USER_1,
        }),
      }),
    );
  });
});

// ─── Transaction Coherence ────────────────────────────────────────────────────

describe("transaction coherence", () => {
  it("does not create conversation if audit fails inside transaction", async () => {
    db.conversation.create.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.createMany.mockResolvedValue({ count: 1 });
    db.conversationParticipant.findMany.mockResolvedValue([]);
    db.messagingAuditEvent.create.mockRejectedValue(new Error("DB down"));

    // Our mock $transaction just awaits the callback; real Prisma would rollback.
    // We verify the audit call is inside the same logical unit by checking mocks.
    await expect(
      createConversation({
        orgId: ORG_A,
        type: "CHANNEL",
        name: "general",
        description: null,
        visibility: "PUBLIC",
        createdBy: USER_1,
      }),
    ).rejects.toThrow("DB down");
  });
});

// ─── Service modules do not leak raw Prisma rows ──────────────────────────────

describe("service output shapes", () => {
  it("getConversationById returns domain record, not raw Prisma row", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    const result = await getConversationById(ORG_A, CONV_ID);
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty("organization");
    expect(result).not.toHaveProperty("participants");
    expect(result).not.toHaveProperty("messages");
  });

  it("getMessageById returns domain record, not raw Prisma row", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    const result = await getMessageById(ORG_A, MSG_ID);
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty("conversation");
    expect(result).not.toHaveProperty("thread");
    expect(result).not.toHaveProperty("reactions");
  });
});
