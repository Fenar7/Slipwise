import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { _db } = vi.hoisted(() => {
  const mocks = {
    conversationParticipant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationMessage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    conversationMeeting: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    messagingAttachmentIndex: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    conversationAttachment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    messagingNotificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    notificationDelivery: {
      count: vi.fn(),
    },
    conversationReadState: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    messagingFollowUp: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    downstreamConsumptionCheckpoint: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    conversationEventLog: {
      findMany: vi.fn(),
    },
    conversationThread: {
      findUnique: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    orgDefaults: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { _dbMocks: mocks, _db: db };
});

vi.mock("@/lib/db", () => {
  return { db: _db };
});

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-id-123" }),
}));

vi.mock("../audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { processNotificationEvents } from "../notification-service";

describe("Notification Service — Checkpoint Safety on Partial Failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not advance checkpoint past a failed event cursor", async () => {
    vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({ timezone: "UTC" } as any);

    vi.mocked(db.conversationEventLog.findMany)
      .mockResolvedValueOnce([
        {
          eventId: "e-ok-1", cursor: 100n,
          eventType: "conversation.message.created",
          orgId: "org-1", conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-ok-1", mentionIds: ["user-2"] },
          createdAt: new Date(),
        },
        {
          eventId: "e-poison", cursor: 101n,
          eventType: "conversation.message.created",
          orgId: "org-1", conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-poison" },
          createdAt: new Date(),
        },
      ] as any);

    vi.mocked(db.conversationMessage.findUnique)
      .mockResolvedValueOnce({
        id: "msg-ok-1", body: "Hello 1", deletedAt: null,
        conversationId: "conv-1", conversation: { name: "General" },
      } as any)
      .mockRejectedValueOnce(new Error("DB connection reset"));

    vi.mocked(db.profile.findUnique).mockResolvedValue({ name: "Actor" } as any);
    vi.mocked(db.profile.findMany).mockResolvedValue([
      { id: "user-2", email: "user-2@slipwise.app" },
    ] as any);
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
      { userId: "user-2" },
    ] as any);
    vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);

    await processNotificationEvents("org-1", "conv-1");

    expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consumerType_orgId_conversationId: expect.objectContaining({
            consumerType: "notification",
            orgId: "org-1",
            conversationId: "conv-1",
          }),
        }),
        update: expect.objectContaining({ cursor: 100n }),
      })
    );
  });

  it("failed event remains retryable on the next invocation", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({ timezone: "UTC" } as any);

    vi.mocked(db.downstreamConsumptionCheckpoint.findUnique)
      .mockResolvedValueOnce(null);

    vi.mocked(db.conversationEventLog.findMany)
      .mockResolvedValueOnce([
        {
          eventId: "e-poison", cursor: 101n,
          eventType: "conversation.message.created",
          orgId: "org-1", conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-poison" },
          createdAt: new Date(),
        },
      ] as any);

    vi.mocked(db.conversationMessage.findUnique)
      .mockRejectedValueOnce(new Error("Timeout"));

    await processNotificationEvents("org-1", "conv-1");

    expect(db.downstreamConsumptionCheckpoint.upsert).not.toHaveBeenCalled();

    vi.mocked(db.downstreamConsumptionCheckpoint.findUnique)
      .mockResolvedValueOnce(null);

    vi.mocked(db.conversationEventLog.findMany)
      .mockResolvedValueOnce([
        {
          eventId: "e-poison", cursor: 101n,
          eventType: "conversation.message.created",
          orgId: "org-1", conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-poison", mentionIds: ["user-2"] },
          createdAt: new Date(),
        },
      ] as any);

    vi.mocked(db.conversationMessage.findUnique)
      .mockResolvedValueOnce({
        id: "msg-poison", body: "Reattempted", deletedAt: null,
        conversationId: "conv-1", conversation: { name: "General" },
      } as any);

    vi.mocked(db.profile.findUnique).mockResolvedValue({ name: "Actor" } as any);
    vi.mocked(db.profile.findMany).mockResolvedValue([
      { id: "user-2", email: "user-2@slipwise.app" },
    ] as any);
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
      { userId: "user-2" },
    ] as any);
    vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);

    await processNotificationEvents("org-1", "conv-1");

    expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ cursor: 101n }),
      })
    );
  });

  it("no duplicate notifications for already-processed successful events", async () => {
    vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({ timezone: "UTC" } as any);

    vi.mocked(db.conversationEventLog.findMany)
      .mockResolvedValueOnce([
        {
          eventId: "e-dup", cursor: 200n,
          eventType: "conversation.message.created",
          orgId: "org-1", conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-dup", mentionIds: ["user-2"] },
          createdAt: new Date(),
        },
      ] as any)
      .mockResolvedValueOnce([] as any);

    vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
      id: "msg-dup", body: "Dedup test", deletedAt: null,
      conversationId: "conv-1", conversation: { name: "General" },
    } as any);
    vi.mocked(db.profile.findUnique).mockResolvedValue({ name: "Actor" } as any);
    vi.mocked(db.profile.findMany).mockResolvedValue([
      { id: "user-2", email: "user-2@slipwise.app" },
    ] as any);
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
      { userId: "user-2" },
    ] as any);
    vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);

    const notifCalls: any[] = [];
    vi.mocked(createNotification).mockImplementation(async (params: any) => {
      notifCalls.push({ ...params });
      return { id: `notif-${params.userId}` };
    });

    await processNotificationEvents("org-1", "conv-1");
    await processNotificationEvents("org-1", "conv-1");

    const user2Mentions = notifCalls.filter(
      (c) => c.userId === "user-2" && c.type === "MENTION"
    );
    expect(user2Mentions).toHaveLength(1);
  });
});
