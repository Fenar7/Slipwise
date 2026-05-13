/**
 * Internal Messaging Platform — Phase 3 Sprint 3.1
 * Authorization model and conversation access rules.
 *
 * Covers:
 * - Centralized authorization policy (evaluateConversationAccess, roleCanGovern)
 * - Membership-safe reads (conversation detail, messages, participants, threads)
 * - Role semantics (OWNER/ADMIN vs MEMBER for governance actions)
 * - Conversation lifecycle (active, archived, locked)
 * - DM-specific constraints
 * - Cross-org boundary enforcement
 * - Removed-participant access denial
 * - Route-level error behavior (no unsafe leakage)
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

// ─── Authorization layer imports ──────────────────────────────────────────────

import {
  roleCanGovern,
  evaluateConversationAccess,
  requireConversationAccess,
  canReadConversation,
} from "@/lib/messaging/authorization";

import type { ConversationRecord, ConversationParticipantRecord } from "@/lib/messaging/domain-types";

// ─── Service imports ───────────────────────────────────────────────────────────

import {
  archiveConversation,
  renameConversation,
  changeConversationVisibility,
} from "@/lib/messaging/conversation-service";

import {
  addParticipant,
  removeParticipant,
  updateParticipantRole,
} from "@/lib/messaging/participant-service";

import {
  sendMessage,
  editMessage,
  softDeleteMessage,
} from "@/lib/messaging/message-service";

import {
  addReaction,
  removeReaction,
} from "@/lib/messaging/reaction-service";

import {
  listThreadReplies,
} from "@/lib/messaging/thread-service";

// ─── Read model imports ───────────────────────────────────────────────────────

import {
  getConversationDetail,
  getMessageDetail,
} from "@/lib/messaging/read-models";

// ─── API route imports ─────────────────────────────────────────────────────────

import { GET as getConversationDetailRoute } from "@/app/api/messaging/conversations/[id]/route";
import { GET as getMessages } from "@/app/api/messaging/conversations/[id]/messages/route";
import { GET as getParticipants } from "@/app/api/messaging/conversations/[id]/participants/route";
import { GET as getThreads } from "@/app/api/messaging/conversations/[id]/threads/route";
import { PATCH as patchArchive } from "@/app/api/messaging/conversations/[id]/archive/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const USER_3 = "00000000-0000-0000-0000-000000000003";
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

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url), init);
}

function makeConversationRecord(overrides: Partial<Record<string, unknown>> = {}): ConversationRecord {
  return makeConversationRow(overrides) as unknown as ConversationRecord;
}

function makeParticipantRecord(overrides: Partial<Record<string, unknown>> = {}): ConversationParticipantRecord {
  return makeParticipantRow(overrides) as unknown as ConversationParticipantRecord;
}

// ─── Reset mocks ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: USER_1,
    orgId: ORG_A,
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
});

// ─── Authorization policy unit tests ──────────────────────────────────────────

describe("Sprint 3.1 — Authorization policy", () => {
  describe("roleCanGovern", () => {
    it("returns true for OWNER", () => {
      expect(roleCanGovern("OWNER")).toBe(true);
    });
    it("returns true for ADMIN", () => {
      expect(roleCanGovern("ADMIN")).toBe(true);
    });
    it("returns false for MEMBER", () => {
      expect(roleCanGovern("MEMBER")).toBe(false);
    });
  });

  describe("evaluateConversationAccess", () => {
    it("denies access when participant is null", () => {
      const conversation = makeConversationRecord();
      const result = evaluateConversationAccess(conversation, null, "READ");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("active participant access required");
    });

    it("denies access when participant has left", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ leftAt: new Date() });
      const result = evaluateConversationAccess(conversation, participant, "READ");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("active participant access required");
    });

    it("denies access on org boundary mismatch", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ orgId: ORG_B });
      const result = evaluateConversationAccess(conversation, participant, "READ");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("org boundary violation");
    });

    it("allows READ for active participant", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "READ");
      expect(result.allowed).toBe(true);
    });

    it("allows SEND_MESSAGE for active participant in active conversation", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "SEND_MESSAGE");
      expect(result.allowed).toBe(true);
    });

    it("blocks SEND_MESSAGE when conversation is archived", () => {
      const conversation = makeConversationRecord({ archivedAt: new Date() });
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "SEND_MESSAGE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("archived");
    });

    it("blocks SEND_MESSAGE when conversation is locked", () => {
      const conversation = makeConversationRecord({ lockedAt: new Date() });
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "SEND_MESSAGE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("locked");
    });

    it("allows READ when conversation is archived", () => {
      const conversation = makeConversationRecord({ archivedAt: new Date() });
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "READ");
      expect(result.allowed).toBe(true);
    });

    it("allows READ when conversation is locked", () => {
      const conversation = makeConversationRecord({ lockedAt: new Date() });
      const participant = makeParticipantRecord();
      const result = evaluateConversationAccess(conversation, participant, "READ");
      expect(result.allowed).toBe(true);
    });

    it("blocks governance action for MEMBER", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ role: "MEMBER" });
      const result = evaluateConversationAccess(conversation, participant, "ARCHIVE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("OWNER or ADMIN");
    });

    it("allows ARCHIVE for OWNER", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ role: "OWNER" });
      const result = evaluateConversationAccess(conversation, participant, "ARCHIVE");
      expect(result.allowed).toBe(true);
    });

    it("allows ARCHIVE for ADMIN", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ role: "ADMIN" });
      const result = evaluateConversationAccess(conversation, participant, "ARCHIVE");
      expect(result.allowed).toBe(true);
    });

    it("blocks governance on archived conversation even for OWNER", () => {
      const conversation = makeConversationRecord({ archivedAt: new Date() });
      const participant = makeParticipantRecord({ role: "OWNER" });
      const result = evaluateConversationAccess(conversation, participant, "RENAME");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("archived");
    });

    it("blocks RENAME on DM conversations", () => {
      const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
      const participant = makeParticipantRecord({ role: "OWNER" });
      const result = evaluateConversationAccess(conversation, participant, "RENAME");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("DM");
    });

    it("blocks ADD_PARTICIPANT on DM conversations", () => {
      const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
      const participant = makeParticipantRecord({ role: "OWNER" });
      const result = evaluateConversationAccess(conversation, participant, "ADD_PARTICIPANT");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("DM");
    });
  });

  describe("requireConversationAccess", () => {
    it("throws when access is denied", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ role: "MEMBER" });
      expect(() => {
        requireConversationAccess(conversation, participant, "ARCHIVE", "test");
      }).toThrow("test: governance action requires OWNER or ADMIN role");
    });

    it("does not throw when access is allowed", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ role: "OWNER" });
      expect(() => {
        requireConversationAccess(conversation, participant, "ARCHIVE", "test");
      }).not.toThrow();
    });
  });

  describe("canReadConversation", () => {
    it("returns true for active participant", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord();
      expect(canReadConversation(conversation, participant)).toBe(true);
    });

    it("returns false for removed participant", () => {
      const conversation = makeConversationRecord();
      const participant = makeParticipantRecord({ leftAt: new Date() });
      expect(canReadConversation(conversation, participant)).toBe(false);
    });

    it("returns false for null participant", () => {
      const conversation = makeConversationRecord();
      expect(canReadConversation(conversation, null)).toBe(false);
    });
  });
});

// ─── Governance action role tests ─────────────────────────────────────────────

describe("Sprint 3.1 — Governance action role enforcement", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  describe("archiveConversation", () => {
    it("allows OWNER to archive", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
      const result = await archiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        archivedBy: USER_1,
      });
      expect(result).not.toBeNull();
    });

    it("allows ADMIN to archive", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "ADMIN" }));
      const result = await archiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        archivedBy: USER_1,
      });
      expect(result).not.toBeNull();
    });

    it("rejects MEMBER from archiving", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        archiveConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          archivedBy: USER_1,
        }),
      ).rejects.toThrow("archiveConversation: governance action requires OWNER or ADMIN role");
    });
  });

  describe("renameConversation", () => {
    it("allows OWNER to rename", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
      db.conversation.update.mockResolvedValue(makeConversationRow({ name: "new-name" }));
      const result = await renameConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        name: "new-name",
        actorId: USER_1,
      });
      expect(result.name).toBe("new-name");
    });

    it("rejects MEMBER from renaming", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        renameConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          name: "new-name",
          actorId: USER_1,
        }),
      ).rejects.toThrow("renameConversation: governance action requires OWNER or ADMIN role");
    });
  });

  describe("changeConversationVisibility", () => {
    it("allows ADMIN to change visibility", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "ADMIN" }));
      db.conversation.update.mockResolvedValue(makeConversationRow({ visibility: "PRIVATE" }));
      const result = await changeConversationVisibility({
        orgId: ORG_A,
        conversationId: CONV_ID,
        visibility: "PRIVATE",
        actorId: USER_1,
      });
      expect(result.visibility).toBe("PRIVATE");
    });

    it("rejects MEMBER from changing visibility", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        changeConversationVisibility({
          orgId: ORG_A,
          conversationId: CONV_ID,
          visibility: "PRIVATE",
          actorId: USER_1,
        }),
      ).rejects.toThrow("changeConversationVisibility: governance action requires OWNER or ADMIN role");
    });
  });

  describe("addParticipant", () => {
    it("rejects MEMBER from adding participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        addParticipant({
          orgId: ORG_A,
          conversationId: CONV_ID,
          userId: USER_3,
          role: "MEMBER",
          addedBy: USER_1,
        }),
      ).rejects.toThrow("addParticipant: governance action requires OWNER or ADMIN role");
    });
  });

  describe("removeParticipant", () => {
    it("rejects MEMBER from removing participants", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        removeParticipant({
          orgId: ORG_A,
          conversationId: CONV_ID,
          userId: USER_2,
          removedBy: USER_1,
        }),
      ).rejects.toThrow("removeParticipant: governance action requires OWNER or ADMIN role");
    });
  });

  describe("updateParticipantRole", () => {
    it("rejects MEMBER from changing roles", async () => {
      db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
      await expect(
        updateParticipantRole({
          orgId: ORG_A,
          conversationId: CONV_ID,
          userId: USER_2,
          role: "ADMIN",
          updatedBy: USER_1,
        }),
      ).rejects.toThrow("updateParticipantRole: governance action requires OWNER or ADMIN role");
    });
  });
});

// ─── Archived / locked conversation mutation blocking ─────────────────────────

describe("Sprint 3.1 — Lifecycle state mutation blocking", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationMessage.update.mockResolvedValue(makeMessageRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  describe("sendMessage", () => {
    it("blocks sending to archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
      await expect(
        sendMessage({
          orgId: ORG_A,
          conversationId: CONV_ID,
          authorId: USER_1,
          body: "Hello",
        }),
      ).rejects.toThrow("sendMessage: conversation is archived");
    });

    it("blocks sending to locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date() }));
      await expect(
        sendMessage({
          orgId: ORG_A,
          conversationId: CONV_ID,
          authorId: USER_1,
          body: "Hello",
        }),
      ).rejects.toThrow("sendMessage: conversation is locked");
    });
  });

  describe("editMessage", () => {
    it("blocks editing in archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
      await expect(
        editMessage({
          orgId: ORG_A,
          messageId: MSG_ID,
          actorId: USER_1,
          body: "Edited",
        }),
      ).rejects.toThrow("editMessage: conversation is archived");
    });

    it("blocks editing in locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date() }));
      await expect(
        editMessage({
          orgId: ORG_A,
          messageId: MSG_ID,
          actorId: USER_1,
          body: "Edited",
        }),
      ).rejects.toThrow("editMessage: conversation is locked");
    });
  });

  describe("softDeleteMessage", () => {
    it("blocks deletion in archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
      await expect(
        softDeleteMessage({
          orgId: ORG_A,
          messageId: MSG_ID,
          actorId: USER_1,
        }),
      ).rejects.toThrow("softDeleteMessage: conversation is archived");
    });
  });

  describe("addReaction", () => {
    it("blocks reactions in archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
      await expect(
        addReaction({
          orgId: ORG_A,
          messageId: MSG_ID,
          userId: USER_1,
          value: "👍",
        }),
      ).rejects.toThrow("addReaction: conversation is archived");
    });
  });

  describe("removeReaction", () => {
    it("blocks removing reactions in archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
      await expect(
        removeReaction({
          orgId: ORG_A,
          messageId: MSG_ID,
          userId: USER_1,
          value: "👍",
        }),
      ).rejects.toThrow("removeReaction: conversation is archived");
    });
  });
});

// ─── Membership-safe read tests ───────────────────────────────────────────────

describe("Sprint 3.1 — Membership-safe reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getConversationDetail returns null for non-participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    const result = await getConversationDetail(ORG_A, CONV_ID, USER_3);
    expect(result).toBeNull();
  });

  it("getConversationDetail returns null for removed participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    const result = await getConversationDetail(ORG_A, CONV_ID, USER_2);
    expect(result).toBeNull();
  });

  it("getMessageDetail returns null when user is not a participant", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    const result = await getMessageDetail(ORG_A, MSG_ID, USER_3);
    expect(result).toBeNull();
  });

  it("getMessageDetail returns null for removed participant", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    const result = await getMessageDetail(ORG_A, MSG_ID, USER_2);
    expect(result).toBeNull();
  });

  it("getConversationDetail still works for archived conversations", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date() }));
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
    db.conversationReadState.findFirst.mockResolvedValue(null);
    db.messageReaction.findMany.mockResolvedValue([]);
    db.conversationAttachment.findMany.mockResolvedValue([]);

    const result = await getConversationDetail(ORG_A, CONV_ID, USER_1);
    expect(result).not.toBeNull();
    expect(result!.archivedAt).not.toBeNull();
  });

  it("getConversationDetail still works for locked conversations", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date() }));
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
    db.conversationReadState.findFirst.mockResolvedValue(null);
    db.messageReaction.findMany.mockResolvedValue([]);
    db.conversationAttachment.findMany.mockResolvedValue([]);

    const result = await getConversationDetail(ORG_A, CONV_ID, USER_1);
    expect(result).not.toBeNull();
    expect(result!.lockedAt).not.toBeNull();
  });
});

// ─── Cross-org boundary tests ─────────────────────────────────────────────────

describe("Sprint 3.1 — Cross-org boundary enforcement", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(null);
  });

  it("archiveConversation rejects cross-org mutation", async () => {
    await expect(
      archiveConversation({
        orgId: ORG_B,
        conversationId: CONV_ID,
        archivedBy: USER_1,
      }),
    ).rejects.toThrow("archiveConversation: conversation not found or access denied");
  });

  it("renameConversation rejects cross-org mutation", async () => {
    await expect(
      renameConversation({
        orgId: ORG_B,
        conversationId: CONV_ID,
        name: "new-name",
        actorId: USER_1,
      }),
    ).rejects.toThrow("renameConversation: conversation not found or access denied");
  });
});

// ─── DM constraint tests ──────────────────────────────────────────────────────

describe("Sprint 3.1 — DM-specific constraints", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ type: "DM", name: null, visibility: null }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("blocks rename on DM", async () => {
    await expect(
      renameConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        name: "new-name",
        actorId: USER_1,
      }),
    ).rejects.toThrow("renameConversation: not allowed on DM conversations");
  });

  it("blocks visibility change on DM", async () => {
    await expect(
      changeConversationVisibility({
        orgId: ORG_A,
        conversationId: CONV_ID,
        visibility: "PRIVATE",
        actorId: USER_1,
      }),
    ).rejects.toThrow("changeConversationVisibility: not allowed on DM conversations");
  });

  it("blocks addParticipant on DM", async () => {
    await expect(
      addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_3,
        role: "MEMBER",
        addedBy: USER_1,
      }),
    ).rejects.toThrow("addParticipant: not allowed on DM conversations");
  });

  it("blocks removeParticipant on DM", async () => {
    await expect(
      removeParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        removedBy: USER_1,
      }),
    ).rejects.toThrow("removeParticipant: not allowed on DM conversations");
  });
});

// ─── Message ownership enforcement ──────────────────────────────────────────────

describe("Sprint 3.1 — Message ownership enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findFirst.mockResolvedValue(
      makeMessageRow({ authorId: USER_2 }),
    );
    db.conversationMessage.update.mockResolvedValue(makeMessageRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("editMessage rejects non-author edit", async () => {
    await expect(
      editMessage({
        orgId: ORG_A,
        messageId: MSG_ID,
        actorId: USER_1,
        body: "Edited by non-author",
      }),
    ).rejects.toThrow("editMessage: can only edit your own messages");
  });

  it("softDeleteMessage rejects non-author deletion", async () => {
    await expect(
      softDeleteMessage({
        orgId: ORG_A,
        messageId: MSG_ID,
        actorId: USER_1,
      }),
    ).rejects.toThrow("softDeleteMessage: can only delete your own messages");
  });

  it("editMessage allows author edit", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(
      makeMessageRow({ authorId: USER_1 }),
    );
    const result = await editMessage({
      orgId: ORG_A,
      messageId: MSG_ID,
      actorId: USER_1,
      body: "Edited by author",
    });
    expect(result).toBeDefined();
  });

  it("softDeleteMessage allows author deletion", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(
      makeMessageRow({ authorId: USER_1 }),
    );
    const result = await softDeleteMessage({
      orgId: ORG_A,
      messageId: MSG_ID,
      actorId: USER_1,
    });
    expect(result).toBeDefined();
  });

  it("editMessage rejects editing a deleted message", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(
      makeMessageRow({ authorId: USER_1, status: "DELETED" }),
    );
    await expect(
      editMessage({
        orgId: ORG_A,
        messageId: MSG_ID,
        actorId: USER_1,
        body: "Edited",
      }),
    ).rejects.toThrow("editMessage: cannot edit a deleted message");
  });
});

// ─── Thread reply cross-conversation leak prevention ──────────────────────────

describe("Sprint 3.1 — Thread reply cross-conversation leak prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listThreadReplies rejects when thread does not belong to claimed conversation", async () => {
    db.conversationThread.findFirst.mockResolvedValue(null);

    await expect(
      listThreadReplies(ORG_A, CONV_ID, "foreign-thread", USER_1),
    ).rejects.toThrow("listThreadReplies: thread not found or does not belong to conversation");
  });

  it("listThreadReplies rejects when participant is not in the thread's actual conversation", async () => {
    const foreignConvId = "conv-foreign";
    db.conversationThread.findFirst.mockResolvedValue(
      makeThreadRow({ conversationId: foreignConvId }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listThreadReplies(ORG_A, CONV_ID, THREAD_ID, USER_1),
    ).rejects.toThrow("listThreadReplies: active participant access required");
  });

  it("listThreadReplies succeeds when thread belongs to conversation and user is participant", async () => {
    db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);

    const result = await listThreadReplies(ORG_A, CONV_ID, THREAD_ID, USER_1);
    expect(result).toHaveLength(1);
    expect(result[0].conversationId).toBe(CONV_ID);
  });
});

// ─── Sole-owner governance invariants ───────────────────────────────────────────

describe("Sprint 3.1 — Sole-owner governance invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "OWNER" }),
    );
    db.conversationParticipant.count.mockResolvedValue(1);
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("removeParticipant rejects removing the sole OWNER", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, role: "OWNER" }),
    );

    await expect(
      removeParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        removedBy: USER_1,
      }),
    ).rejects.toThrow("removeParticipant: cannot remove the sole owner");
  });

  it("updateParticipantRole rejects demoting the sole OWNER", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, role: "OWNER" }),
    );

    await expect(
      updateParticipantRole({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        role: "MEMBER",
        updatedBy: USER_1,
      }),
    ).rejects.toThrow("updateParticipantRole: cannot demote the sole owner");
  });

  it("removeParticipant allows removing an OWNER when multiple exist", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, role: "OWNER" }),
    );
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationParticipant.update.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, leftAt: new Date() }),
    );

    const result = await removeParticipant({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      removedBy: USER_1,
    });
    expect(result.leftAt).not.toBeNull();
  });

  it("updateParticipantRole allows demoting an OWNER when multiple exist", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, role: "OWNER" }),
    );
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationParticipant.update.mockResolvedValue(
      makeParticipantRow({ userId: USER_2, role: "MEMBER" }),
    );

    const result = await updateParticipantRole({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      role: "MEMBER",
      updatedBy: USER_1,
    });
    expect(result.role).toBe("MEMBER");
  });
});

// ─── Locked conversation governance blocking ────────────────────────────────────

describe("Sprint 3.1 — Locked conversation governance blocking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date() }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "OWNER" }),
    );
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("archiveConversation rejects on locked conversation", async () => {
    await expect(
      archiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        archivedBy: USER_1,
      }),
    ).rejects.toThrow("archiveConversation: conversation is locked");
  });

  it("renameConversation rejects on locked conversation", async () => {
    await expect(
      renameConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        name: "new-name",
        actorId: USER_1,
      }),
    ).rejects.toThrow("renameConversation: conversation is locked");
  });

  it("addParticipant rejects on locked conversation", async () => {
    await expect(
      addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_3,
        role: "MEMBER",
        addedBy: USER_1,
      }),
    ).rejects.toThrow("addParticipant: conversation is locked");
  });

  it("removeParticipant rejects on locked conversation", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER" })) // for assertConversationAction
      .mockResolvedValueOnce(makeParticipantRow({ userId: USER_2, role: "MEMBER" })); // for target
    db.conversationParticipant.count.mockResolvedValue(2);

    await expect(
      removeParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        removedBy: USER_1,
      }),
    ).rejects.toThrow("removeParticipant: conversation is locked");
  });
});

// ─── Route-level access tests ─────────────────────────────────────────────────

describe("Sprint 3.1 — Route-level access hardening", () => {
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

  it("GET /api/messaging/conversations/:id returns 403 for non-participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("GET /api/messaging/conversations/:id/messages returns 403 for non-participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages");
    const response = await getMessages(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("GET /api/messaging/conversations/:id/participants returns 403 for non-participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/participants");
    const response = await getParticipants(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("GET /api/messaging/conversations/:id/threads returns 403 for non-participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/threads");
    const response = await getThreads(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("PATCH /api/messaging/conversations/:id/archive returns 403 for MEMBER", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/archive", {
      method: "PATCH",
    });
    const response = await patchArchive(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("route errors do not leak conversation existence details", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Access denied.");
  });
});
