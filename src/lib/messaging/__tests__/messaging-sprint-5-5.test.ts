import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    conversationMessage: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    conversationParticipant: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationThread: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    conversationReadState: {
      upsert: vi.fn(),
    },
    messageMention: {
      createMany: vi.fn(),
    },
    conversationAttachment: {
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
import { replyToThread } from "@/lib/messaging/thread-service";
import { appendConversationEvent } from "@/lib/messaging/realtime/event-log-service";
import { getRealtimePublisherOrNoop } from "@/lib/messaging/realtime/publisher";

const mockPublisher = getRealtimePublisherOrNoop() as {
  publishConversationEvent: ReturnType<typeof vi.fn>;
};

describe("Sprint 5.5 — attachments service correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage creates attachment rows when attachments are provided", async () => {
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationMessage.create.mockResolvedValue({
      id: "m1", orgId: "org", conversationId: "c1", threadId: null,
      authorId: "user-1", body: "msg", contentMeta: null, status: "ACTIVE",
      editedAt: null, deletedAt: null, participantCountAtSend: 2, createdAt: new Date(), updatedAt: new Date(),
    });
    db.conversationReadState.upsert.mockResolvedValue({});

    await sendMessage({
      orgId: "org",
      conversationId: "c1",
      authorId: "user-1",
      body: "check attachment",
      attachments: [
        { storageRef: "org/messaging/file.pdf", fileName: "file.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
      ],
    });

    expect(db.conversationAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            storageRef: "org/messaging/file.pdf",
            fileName: "file.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            scanStatus: "PENDING",
          }),
        ]),
      }),
    );
  });

  it("sendMessage handles multiple attachments correctly", async () => {
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);
    db.conversationParticipant.count.mockResolvedValue(3);
    db.conversationMessage.create.mockResolvedValue({
      id: "m2", orgId: "org", conversationId: "c1", threadId: null,
      authorId: "user-1", body: "multi", contentMeta: null, status: "ACTIVE",
      editedAt: null, deletedAt: null, participantCountAtSend: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    db.conversationReadState.upsert.mockResolvedValue({});

    await sendMessage({
      orgId: "org",
      conversationId: "c1",
      authorId: "user-1",
      body: "multi attachment",
      attachments: [
        { storageRef: "org/messaging/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100 },
        { storageRef: "org/messaging/b.png", fileName: "b.png", mimeType: "image/png", sizeBytes: 200 },
      ],
    });

    expect(db.conversationAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ fileName: "a.pdf" }),
          expect.objectContaining({ fileName: "b.png" }),
        ]),
      }),
    );
  });

  it("replyToThread creates attachment rows for thread replies", async () => {
    db.conversationThread.findFirst.mockResolvedValue({ id: "t1", orgId: "org", conversationId: "c1" });
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);
    db.conversationParticipant.count.mockResolvedValue(3);
    db.conversationMessage.create.mockResolvedValue({
      id: "m3", orgId: "org", conversationId: "c1", threadId: "t1",
      authorId: "user-1", body: "reply", contentMeta: null, status: "ACTIVE",
      editedAt: null, deletedAt: null, participantCountAtSend: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    db.conversationThread.update.mockResolvedValue({});

    await replyToThread({
      orgId: "org",
      conversationId: "c1",
      threadId: "t1",
      authorId: "user-1",
      body: "reply with file",
      attachments: [
        { storageRef: "org/messaging/image.jpg", fileName: "image.jpg", mimeType: "image/jpeg", sizeBytes: 2048, thumbnailRef: "thumb.jpg" },
      ],
    });

    expect(db.conversationAttachment.createMany).toHaveBeenCalled();
  });

  it("sendMessage without attachments does not create attachment rows", async () => {
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationMessage.create.mockResolvedValue({
      id: "m4", orgId: "org", conversationId: "c1", threadId: null,
      authorId: "user-1", body: "no files", contentMeta: null, status: "ACTIVE",
      editedAt: null, deletedAt: null, participantCountAtSend: 2, createdAt: new Date(), updatedAt: new Date(),
    });
    db.conversationReadState.upsert.mockResolvedValue({});

    await sendMessage({
      orgId: "org",
      conversationId: "c1",
      authorId: "user-1",
      body: "no attachments",
    });

    expect(db.conversationAttachment.createMany).not.toHaveBeenCalled();
  });

  it("attachment send still succeeds when no attachments provided (backward compat)", async () => {
    db.conversationParticipant.findMany.mockResolvedValue([{ userId: "user-2" }]);
    db.conversationParticipant.count.mockResolvedValue(2);
    db.conversationMessage.create.mockResolvedValue({
      id: "m5", orgId: "org", conversationId: "c1", threadId: null,
      authorId: "user-1", body: "hello", contentMeta: null, status: "ACTIVE",
      editedAt: null, deletedAt: null, participantCountAtSend: 2, createdAt: new Date(), updatedAt: new Date(),
    });
    db.conversationReadState.upsert.mockResolvedValue({});

    const result = await sendMessage({
      orgId: "org",
      conversationId: "c1",
      authorId: "user-1",
      body: "hello",
    });

    expect(result.id).toBe("m5");
    expect(result.body).toBe("hello");
  });
});
