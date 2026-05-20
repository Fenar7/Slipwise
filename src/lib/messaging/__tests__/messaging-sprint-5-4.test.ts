import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    messageReaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    conversationMessage: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    conversationParticipant: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationReadState: {
      upsert: vi.fn(),
    },
    messageMention: {
      createMany: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    conversationEventLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(db)),
  };
  return { db };
});

vi.mock("@/lib/messaging/service-helpers", () => ({
  assertConversationAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/messaging/audit", () => ({
  logMessagingAuditTx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/messaging/realtime/event-log-service", () => ({
  appendConversationEvent: vi.fn().mockResolvedValue({ eventId: "evt-1", cursor: BigInt(7) }),
}));

vi.mock("@/lib/messaging/realtime/publisher", () => ({
  getRealtimePublisherOrNoop: vi.fn().mockReturnValue({
    publishConversationEvent: vi.fn(),
    publishPresenceUpdate: vi.fn(),
    publishTypingUpdate: vi.fn(),
    pruneConversationSubscriptions: vi.fn(),
  }),
}));

import { db } from "@/lib/db";
import { sendMessage } from "@/lib/messaging/message-service";
import { addReaction, removeReaction } from "@/lib/messaging/reaction-service";
import { appendConversationEvent } from "@/lib/messaging/realtime/event-log-service";
import { getRealtimePublisherOrNoop } from "@/lib/messaging/realtime/publisher";

const mockPublisher = getRealtimePublisherOrNoop() as {
  publishConversationEvent: ReturnType<typeof vi.fn>;
};

describe("Sprint 5.4 service correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage rejects out-of-bounds mention ranges", async () => {
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);

    await expect(
      sendMessage({
        orgId: "org-1",
        conversationId: "conv-1",
        authorId: "user-1",
        body: "@Alex hi",
        mentions: [{ userId: "user-2", offsetStart: 0, offsetEnd: 99 }],
      }),
    ).rejects.toThrow("mention offset range");
  });

  it("addReaction appends and publishes a durable reaction-added event", async () => {
    db.conversationMessage.findFirst.mockResolvedValue({
      id: "msg-1",
      orgId: "org-1",
      conversationId: "conv-1",
    });
    db.messageReaction.findFirst.mockResolvedValue(null);
    db.messageReaction.create.mockResolvedValue({
      id: "rxn-1",
      orgId: "org-1",
      messageId: "msg-1",
      userId: "user-1",
      type: "EMOJI",
      value: "👍",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await addReaction({
      orgId: "org-1",
      messageId: "msg-1",
      userId: "user-1",
      value: "👍",
    });

    expect(appendConversationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        conversationId: "conv-1",
        eventType: "conversation.message.reaction.added",
      }),
    );
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      "org-1",
      "conv-1",
      "conversation.message.reaction.added",
      "user-1",
      { messageId: "msg-1", value: "👍" },
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });

  it("removeReaction appends and publishes a durable reaction-removed event", async () => {
    db.conversationMessage.findFirst.mockResolvedValue({
      id: "msg-1",
      orgId: "org-1",
      conversationId: "conv-1",
    });
    db.messageReaction.findFirst.mockResolvedValue({
      id: "rxn-1",
      orgId: "org-1",
      messageId: "msg-1",
      userId: "user-1",
      type: "EMOJI",
      value: "👍",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await removeReaction({
      orgId: "org-1",
      messageId: "msg-1",
      userId: "user-1",
      value: "👍",
    });

    expect(appendConversationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        conversationId: "conv-1",
        eventType: "conversation.message.reaction.removed",
      }),
    );
    expect(mockPublisher.publishConversationEvent).toHaveBeenCalledWith(
      "org-1",
      "conv-1",
      "conversation.message.reaction.removed",
      "user-1",
      { messageId: "msg-1", value: "👍" },
      expect.objectContaining({ eventId: expect.any(String), cursor: expect.any(String) }),
    );
  });
});
