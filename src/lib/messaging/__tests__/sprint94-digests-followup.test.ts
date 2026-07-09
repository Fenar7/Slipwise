import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock db client
vi.mock("@/lib/db", () => {
  const mocks = {
    notification: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    messagingTask: {
      count: vi.fn(),
    },
    conversationMeeting: {
      count: vi.fn(),
    },
    messagingNotificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orgDefaults: {
      findMany: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    conversationMessage: {
      findFirst: vi.fn(),
    },
    messagingFollowUp: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-id-123" }),
}));

vi.mock("@/lib/flow/delivery-engine", () => ({
  queueEmailDelivery: vi.fn().mockResolvedValue(undefined),
}));

// Mock audit logging
vi.mock("../audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
  logMessagingAuditTx: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { queueEmailDelivery } from "@/lib/flow/delivery-engine";
import {
  buildUserDigest,
  dispatchDigestForUser,
  dispatchPendingDigests,
} from "../digest-service";
import {
  flagMessageForFollowUp,
  resolveFollowUp,
  listFollowUps,
  deleteFollowUp,
} from "../followup-service";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "../errors";

describe("Sprint 9.4 — Notification Digest Service & Follow-Up Flag Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. buildUserDigest returns null when no unread notifications exist
  it("buildUserDigest returns null when no unread notifications exist", async () => {
    vi.mocked(db.notification.findMany).mockResolvedValueOnce([]);

    const result = await buildUserDigest({
      userId: "user-1",
      orgId: "org-1",
      since: new Date(),
    });

    expect(result).toBeNull();
  });

  // 2. buildUserDigest returns correct counts for mentions, replies, tasks, meetings
  it("buildUserDigest returns correct counts for mentions, replies, tasks, meetings", async () => {
    const mockNotifications = [
      { id: "1", type: "MENTION", createdAt: new Date() },
      { id: "2", type: "REPLY", createdAt: new Date() },
      { id: "3", type: "TASK_REMINDER", createdAt: new Date() },
      { id: "4", type: "MEETING_REMINDER", createdAt: new Date() },
    ];
    vi.mocked(db.notification.findMany).mockResolvedValueOnce(mockNotifications as any);
    vi.mocked(db.messagingTask.count).mockResolvedValueOnce(5);
    vi.mocked(db.conversationMeeting.count).mockResolvedValueOnce(3);

    const result = await buildUserDigest({
      userId: "user-1",
      orgId: "org-1",
      since: new Date(),
    });

    expect(result).toEqual({
      userId: "user-1",
      orgId: "org-1",
      unreadCount: 4,
      mentionCount: 1,
      replyCount: 1,
      taskReminderCount: 1,
      meetingReminderCount: 1,
      pendingTaskCount: 5,
      pendingMeetingCount: 3,
    });
  });

  // 3. dispatchDigestForUser skips when digestEnabled = false
  it("dispatchDigestForUser skips when digestEnabled = false", async () => {
    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValueOnce({
      digestEnabled: false,
    } as any);

    const result = await dispatchDigestForUser({
      userId: "user-1",
      orgId: "org-1",
    });

    expect(result).toEqual({
      dispatched: false,
      skipped: true,
      reason: "disabled",
    });
  });

  // 4. dispatchDigestForUser skips when last digest was sent too recently (idempotency guard)
  it("dispatchDigestForUser skips when last digest was sent too recently (idempotency guard)", async () => {
    const baseTime = new Date("2026-06-03T12:00:00Z");
    vi.setSystemTime(baseTime);

    // DAILY: limit is 20 hours
    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValueOnce({
      digestEnabled: true,
      digestFrequency: "DAILY",
      lastDigestSentAt: new Date(baseTime.getTime() - 15 * 60 * 60 * 1000), // 15 hours ago
    } as any);

    let result = await dispatchDigestForUser({
      userId: "user-1",
      orgId: "org-1",
    });
    expect(result).toEqual({
      dispatched: false,
      skipped: true,
      reason: "too_recent",
    });

    // WEEKLY: limit is 6 days 20 hours
    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValueOnce({
      digestEnabled: true,
      digestFrequency: "WEEKLY",
      lastDigestSentAt: new Date(baseTime.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    } as any);

    result = await dispatchDigestForUser({
      userId: "user-1",
      orgId: "org-1",
    });
    expect(result).toEqual({
      dispatched: false,
      skipped: true,
      reason: "too_recent",
    });
  });

  // 5. dispatchDigestForUser sends and updates lastDigestSentAt on success
  it("dispatchDigestForUser sends and updates lastDigestSentAt on success", async () => {
    const baseTime = new Date("2026-06-03T12:00:00Z");
    vi.setSystemTime(baseTime);

    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValueOnce({
      digestEnabled: true,
      digestFrequency: "DAILY",
      lastDigestSentAt: new Date(baseTime.getTime() - 21 * 60 * 60 * 1000), // 21 hours ago
    } as any);

    const mockNotifications = [
      { id: "1", type: "MENTION", createdAt: new Date() },
    ];
    vi.mocked(db.notification.findMany).mockResolvedValueOnce(mockNotifications as any);
    vi.mocked(db.messagingTask.count).mockResolvedValueOnce(1);
    vi.mocked(db.conversationMeeting.count).mockResolvedValueOnce(0);

    vi.mocked(db.member.findFirst).mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as any);

    vi.mocked(db.notification.create).mockResolvedValueOnce({
      id: "digest-audit-notif-id",
    } as any);

    const result = await dispatchDigestForUser({
      userId: "user-1",
      orgId: "org-1",
    });

    expect(result).toEqual({
      dispatched: true,
      skipped: false,
    });
    expect(queueEmailDelivery).toHaveBeenCalled();
    expect(db.messagingNotificationPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_userId: { orgId: "org-1", userId: "user-1" },
        },
        data: {
          lastDigestSentAt: baseTime,
        },
      })
    );
  });

  // 6. dispatchDigestForUser does not send between 23:00 and 07:00 local org time (quiet window)
  it("dispatchDigestForUser does not send between 23:00 and 07:00 local org time (quiet window)", async () => {
    // We mock current time to 23:30 UTC
    const baseTime = new Date("2026-06-03T23:30:00Z");
    vi.setSystemTime(baseTime);

    // Candidate has digest enabled and is overdue
    vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValueOnce([
      {
        orgId: "org-1",
        userId: "user-1",
        digestEnabled: true,
        digestFrequency: "DAILY",
        lastDigestSentAt: null,
      },
    ] as any);

    // Mock org timezone to UTC
    vi.mocked(db.orgDefaults.findMany)
      .mockResolvedValueOnce([{ timezone: "UTC" }] as any)
      .mockResolvedValueOnce([
        { organizationId: "org-1", timezone: "UTC" },
      ] as any);

    const result = await dispatchPendingDigests(50);

    // Since 23:30 is between 23:00 and 07:00, the sweep should skip the user
    expect(result).toEqual({
      dispatched: 0,
      skipped: 1,
      failed: 0,
      evaluated: 1,
    });
  });

  // 7. dispatchPendingDigests processes up to the limit and returns correct counters
  it("dispatchPendingDigests processes up to the limit and returns correct counters", async () => {
    // Mock current time to 12:00 UTC (active window)
    const baseTime = new Date("2026-06-03T12:00:00Z");
    vi.setSystemTime(baseTime);

    // We have 3 candidates but limit is 2
    vi.mocked(db.messagingNotificationPreference.findMany).mockImplementation(async (args: any) => {
      expect(args.take).toBe(2);
      return [
        {
          orgId: "org-1",
          userId: "user-1",
          digestEnabled: true,
          digestFrequency: "DAILY",
          lastDigestSentAt: null,
        },
        {
          orgId: "org-1",
          userId: "user-2",
          digestEnabled: true,
          digestFrequency: "DAILY",
          lastDigestSentAt: null,
        },
      ] as any;
    });

    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue({
      digestEnabled: true,
      digestFrequency: "DAILY",
      lastDigestSentAt: null,
    } as any);

    vi.mocked(db.orgDefaults.findMany)
      .mockResolvedValueOnce([{ timezone: "UTC" }] as any)
      .mockResolvedValueOnce([
        { organizationId: "org-1", timezone: "UTC" },
      ] as any);

    // For first user, dispatch succeeds
    // For second user, no notifications exist (empty) -> skips
    vi.mocked(db.notification.findMany)
      .mockResolvedValueOnce([{ id: "1", type: "MENTION" }] as any) // user-1 notifications
      .mockResolvedValueOnce([]); // user-2 notifications

    vi.mocked(db.member.findFirst).mockResolvedValueOnce({
      user: { email: "user1@example.com" },
    } as any);

    vi.mocked(db.notification.create).mockResolvedValueOnce({ id: "notif-1" } as any);

    const result = await dispatchPendingDigests(2);

    expect(result).toEqual({
      dispatched: 1,
      skipped: 1, // second user skipped due to empty digest
      failed: 0,
      evaluated: 2,
    });
  });

  // 8. flagMessageForFollowUp creates a new follow-up for a valid participant
  it("flagMessageForFollowUp creates a new follow-up for a valid participant", async () => {
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce({ id: "part-1" } as any);
    vi.mocked(db.conversationMessage.findFirst).mockResolvedValueOnce({ id: "msg-1" } as any);
    vi.mocked(db.messagingFollowUp.upsert).mockResolvedValueOnce({
      id: "followup-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      note: "Read this later",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await flagMessageForFollowUp({
      orgId: "org-1",
      userId: "user-1",
      messageId: "msg-1",
      conversationId: "conv-1",
      note: "Read this later",
    });

    expect(result.id).toBe("followup-1");
    expect(result.note).toBe("Read this later");
    expect(result.resolvedAt).toBeNull();
  });

  // 9. flagMessageForFollowUp re-opens a resolved follow-up on re-flag (upsert behavior)
  it("flagMessageForFollowUp re-opens a resolved follow-up on re-flag (upsert behavior)", async () => {
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce({ id: "part-1" } as any);
    vi.mocked(db.conversationMessage.findFirst).mockResolvedValueOnce({ id: "msg-1" } as any);
    vi.mocked(db.messagingFollowUp.upsert).mockResolvedValueOnce({
      id: "followup-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      note: "Updated note",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await flagMessageForFollowUp({
      orgId: "org-1",
      userId: "user-1",
      messageId: "msg-1",
      conversationId: "conv-1",
      note: "Updated note",
    });

    expect(result.resolvedAt).toBeNull();
    expect(result.note).toBe("Updated note");
    expect(db.messagingFollowUp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          note: "Updated note",
          resolvedAt: null,
          resolvedBy: null,
        },
      })
    );
  });

  // 10. flagMessageForFollowUp rejects if user is not an active participant (fail-closed)
  it("flagMessageForFollowUp rejects if user is not an active participant (fail-closed)", async () => {
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce(null);

    await expect(
      flagMessageForFollowUp({
        orgId: "org-1",
        userId: "user-1",
        messageId: "msg-1",
        conversationId: "conv-1",
      })
    ).rejects.toThrow(ConversationAccessError);
  });

  // 11. flagMessageForFollowUp rejects notes over 500 characters
  it("flagMessageForFollowUp rejects notes over 500 characters", async () => {
    const longNote = "a".repeat(501);

    await expect(
      flagMessageForFollowUp({
        orgId: "org-1",
        userId: "user-1",
        messageId: "msg-1",
        conversationId: "conv-1",
        note: longNote,
      })
    ).rejects.toThrow(InvalidInputError);
  });

  // 12. resolveFollowUp sets resolvedAt and is idempotent when already resolved
  it("resolveFollowUp sets resolvedAt and is idempotent when already resolved", async () => {
    const baseTime = new Date("2026-06-03T12:00:00Z");
    vi.setSystemTime(baseTime);

    const resolvedFollowUp = {
      id: "followup-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      note: null,
      resolvedAt: new Date(baseTime.getTime() - 1000),
      resolvedBy: "user-1",
    };

    // First, test already resolved (idempotence)
    vi.mocked(db.messagingFollowUp.findFirst).mockResolvedValueOnce(resolvedFollowUp as any);

    let result = await resolveFollowUp({
      orgId: "org-1",
      userId: "user-1",
      followUpId: "followup-1",
    });

    expect(result.resolvedAt).not.toBeNull();
    expect(db.messagingFollowUp.update).not.toHaveBeenCalled();

    // Second, test pending follow-up resolving
    const pendingFollowUp = {
      id: "followup-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      note: null,
      resolvedAt: null,
      resolvedBy: null,
    };
    vi.mocked(db.messagingFollowUp.findFirst).mockResolvedValueOnce(pendingFollowUp as any);
    vi.mocked(db.messagingFollowUp.update).mockResolvedValueOnce({
      ...pendingFollowUp,
      resolvedAt: baseTime,
      resolvedBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    result = await resolveFollowUp({
      orgId: "org-1",
      userId: "user-1",
      followUpId: "followup-1",
    });

    expect(result.resolvedAt).toEqual(baseTime);
    expect(db.messagingFollowUp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "followup-1" },
        data: {
          resolvedAt: baseTime,
          resolvedBy: "user-1",
        },
      })
    );
  });

  // 13. resolveFollowUp rejects another user's follow-up (ownership check)
  it("resolveFollowUp rejects another user's follow-up (ownership check)", async () => {
    vi.mocked(db.messagingFollowUp.findFirst).mockResolvedValueOnce(null);

    await expect(
      resolveFollowUp({
        orgId: "org-1",
        userId: "user-1",
        followUpId: "followup-other",
      })
    ).rejects.toThrow(NotFoundError);
  });

  // 14. listFollowUps returns only the calling user's own follow-ups (no cross-user leakage)
  it("listFollowUps returns only the calling user's own follow-ups (no cross-user leakage)", async () => {
    vi.mocked(db.messagingFollowUp.findMany).mockImplementation(async (args: any) => {
      expect(args.where.userId).toBe("user-1");
      expect(args.where.orgId).toBe("org-1");
      return [
        {
          id: "followup-1",
          orgId: "org-1",
          userId: "user-1",
          conversationId: "conv-1",
          messageId: "msg-1",
          note: "Personal bookmark",
          resolvedAt: null,
          resolvedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;
    });

    const result = await listFollowUps({
      orgId: "org-1",
      userId: "user-1",
      filter: "pending",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("followup-1");
  });

  // 15. deleteFollowUp returns { deleted: false } when the follow-up doesn't exist (idempotent)
  it("deleteFollowUp returns { deleted: false } when the follow-up doesn't exist (idempotent)", async () => {
    vi.mocked(db.messagingFollowUp.findFirst).mockResolvedValueOnce(null);

    const result = await deleteFollowUp({
      orgId: "org-1",
      userId: "user-1",
      followUpId: "nonexistent",
    });

    expect(result).toEqual({ deleted: false });
    expect(db.messagingFollowUp.delete).not.toHaveBeenCalled();
  });

  // 16. dispatchDigestForUser handles queue email failure correctly (truthful dispatch semantics)
  it("dispatchDigestForUser handles queue email failure correctly", async () => {
    const baseTime = new Date("2026-06-03T12:00:00Z");
    vi.setSystemTime(baseTime);

    vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValueOnce({
      digestEnabled: true,
      digestFrequency: "DAILY",
      lastDigestSentAt: new Date(baseTime.getTime() - 21 * 60 * 60 * 1000), // 21 hours ago
    } as any);

    const mockNotifications = [
      { id: "1", type: "MENTION", createdAt: new Date() },
    ];
    vi.mocked(db.notification.findMany).mockResolvedValueOnce(mockNotifications as any);
    vi.mocked(db.messagingTask.count).mockResolvedValueOnce(1);
    vi.mocked(db.conversationMeeting.count).mockResolvedValueOnce(0);

    vi.mocked(db.member.findFirst).mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as any);

    vi.mocked(db.notification.create).mockResolvedValueOnce({
      id: "digest-audit-notif-id-failed",
    } as any);

    // Mock queueEmailDelivery to reject/throw an error
    vi.mocked(queueEmailDelivery).mockRejectedValueOnce(new Error("Queue error"));

    const result = await dispatchDigestForUser({
      userId: "user-1",
      orgId: "org-1",
    });

    // Check it returns dispatched: false and skipped: false
    expect(result.dispatched).toBe(false);
    expect(result.skipped).toBe(false);
    // Check that we did NOT update lastDigestSentAt
    expect(db.messagingNotificationPreference.update).not.toHaveBeenCalled();
    // Check that we cleaned up/deleted the created notification
    expect(db.notification.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "digest-audit-notif-id-failed" },
      })
    );
  });
});
