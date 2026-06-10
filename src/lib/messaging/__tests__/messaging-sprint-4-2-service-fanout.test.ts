/**
 * Internal Messaging Platform — Phase 4 Sprint 4.2
 * Service fanout wiring regression tests.
 *
 * Pins the correct event behavior for:
 * - createThread publishes conversation.thread.created only
 * - resolveThread publishes conversation.thread.resolved
 * - createConversation does not publish a bogus unlock event
 * - addParticipant does not publish a bogus role_changed event
 * - removeParticipant revokes live subscriptions for the removed user
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./local-setup";

vi.mock("server-only", () => ({}));

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
  const conversation = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  };
  const conversationParticipant = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
  };
  const messagingAuditEvent = {
    create: vi.fn(),
  };
  const conversationThread = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const conversationMessage = {
    findFirst: vi.fn(),
  };
  const member = {
    findMany: vi.fn(),
  };
  const db = {
    conversation,
    conversationParticipant,
    messagingAuditEvent,
    conversationThread,
    conversationMessage,
    member,
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  return { db };
});

vi.mock("@/lib/messaging/realtime/publisher", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/messaging/realtime/publisher")>();
  return {
    ...original,
    getRealtimePublisherOrNoop: vi.fn().mockReturnValue({
      publishConversationEvent: vi.fn(),
      publishPresenceUpdate: vi.fn(),
      publishTypingUpdate: vi.fn(),
      pruneConversationSubscriptions: vi.fn(),
    }),
  };
});

vi.mock("@/lib/messaging/realtime/event-log-service", () => ({
  appendConversationEvent: vi.fn().mockResolvedValue({ eventId: "evt-1", cursor: BigInt(1) }),
}));

import { db } from "@/lib/db";
import { getRealtimePublisherOrNoop } from "@/lib/messaging/realtime/publisher";

import { createConversation } from "@/lib/messaging/conversation-service";
import { createThread, resolveThread } from "@/lib/messaging/thread-service";
import { addParticipant, removeParticipant, updateParticipantRole } from "@/lib/messaging/participant-service";

const mockPublisher = getRealtimePublisherOrNoop() as {
  publishConversationEvent: ReturnType<typeof vi.fn>;
  publishPresenceUpdate: ReturnType<typeof vi.fn>;
  publishTypingUpdate: ReturnType<typeof vi.fn>;
  pruneConversationSubscriptions: ReturnType<typeof vi.fn>;
};

const ORG_A = "org-aaa";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "conv-001";
const THREAD_ID = "thread-001";
const MSG_ID = "msg-001";

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    orgId: ORG_A,
    type: "CHANNEL" as const,
    name: "general",
    description: null,
    visibility: "PUBLIC" as const,
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: USER_1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "part-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    role: "OWNER" as const,
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeThreadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: THREAD_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    anchorMessageId: MSG_ID,
    title: null,
    replyCount: 0,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service fanout wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.2 service fanout wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createConversation does not publish a bogus unlock event", async () => {
    db.conversation.create.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);

    await createConversation({
      orgId: ORG_A,
      type: "CHANNEL",
      name: "test",
      description: null,
      visibility: "PUBLIC",
      createdBy: USER_1,
    });

    expect(mockPublisher.publishConversationEvent).not.toHaveBeenCalled();
  });

  it("createThread publishes conversation.thread.created only", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findFirst.mockResolvedValue({
      id: MSG_ID,
      orgId: ORG_A,
      conversationId: CONV_ID,
    });
    db.conversationThread.create.mockResolvedValue(makeThreadRow());

    await createThread({
      orgId: ORG_A,
      conversationId: CONV_ID,
      anchorMessageId: MSG_ID,
      createdBy: USER_1,
    });

    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      ORG_A,
      CONV_ID,
      "conversation.thread.created",
      USER_1,
      { threadId: THREAD_ID, anchorMessageId: MSG_ID },
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });

  it("resolveThread publishes conversation.thread.resolved", async () => {
    db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationThread.update.mockResolvedValue(makeThreadRow({ resolvedAt: new Date() }));

    await resolveThread({
      orgId: ORG_A,
      threadId: THREAD_ID,
      resolvedBy: USER_1,
    });

    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      ORG_A,
      CONV_ID,
      "conversation.thread.resolved",
      USER_1,
      { threadId: THREAD_ID },
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });

  it("addParticipant publishes membership.updated once with change: added", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (args.where.userId === USER_1) {
          return makeParticipantRow({ userId: USER_1, role: "OWNER" });
        }
        return null;
      },
    );
    db.member.findMany.mockResolvedValue([{ userId: USER_2 }]);
    db.conversationParticipant.create.mockResolvedValue(makeParticipantRow({ userId: USER_2, role: "MEMBER" }));

    await addParticipant({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      role: "MEMBER",
      addedBy: USER_1,
    });

    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      ORG_A,
      CONV_ID,
      "conversation.membership.updated",
      USER_1,
      { change: "added", userId: USER_2, role: "MEMBER", conversationId: CONV_ID },
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });

  it("removeParticipant prunes live subscriptions for the removed user", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (args.where.userId === USER_1) {
          return makeParticipantRow({ userId: USER_1, role: "OWNER" });
        }
        if (args.where.userId === USER_2) {
          return makeParticipantRow({ userId: USER_2, role: "MEMBER" });
        }
        return null;
      },
    );
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationParticipant.update.mockResolvedValue(makeParticipantRow({ userId: USER_2, leftAt: new Date() }));

    await removeParticipant({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      removedBy: USER_1,
    });

    expect(mockPublisher.pruneConversationSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockPublisher.pruneConversationSubscriptions).toHaveBeenCalledWith(
      ORG_A,
      CONV_ID,
      USER_2,
    );
  });

  it("addParticipant rejects invalid or cross-org user IDs", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (args.where.userId === USER_1) {
          return makeParticipantRow({ userId: USER_1, role: "OWNER" });
        }
        return null;
      },
    );
    // Simulate org has only USER_1 as a member; USER_2 is NOT a member
    db.member.findMany.mockResolvedValue([{ userId: USER_1 }]);

    await expect(
      addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        role: "MEMBER",
        addedBy: USER_1,
      }),
    ).rejects.toThrow("addParticipant: invalid or unauthorized participants");

    // Ensure no participant was created
    expect(db.conversationParticipant.create).not.toHaveBeenCalled();
    expect(mockPublisher.publishConversationEvent).not.toHaveBeenCalled();
  });

  it("updateParticipantRole publishes membership.updated with change: role_changed", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (args.where.userId === USER_1) {
          return makeParticipantRow({ userId: USER_1, role: "OWNER" });
        }
        if (args.where.userId === USER_2) {
          return makeParticipantRow({ userId: USER_2, role: "MEMBER" });
        }
        return null;
      },
    );
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationParticipant.update.mockResolvedValue(makeParticipantRow({ userId: USER_2, role: "ADMIN" }));

    await updateParticipantRole({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      role: "ADMIN",
      updatedBy: USER_1,
    });

    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      ORG_A,
      CONV_ID,
      "conversation.membership.updated",
      USER_1,
      expect.objectContaining({
        change: "role_changed",
        userId: USER_2,
        role: "ADMIN",
        previousRole: "MEMBER",
        conversationId: CONV_ID,
      }),
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });
});
