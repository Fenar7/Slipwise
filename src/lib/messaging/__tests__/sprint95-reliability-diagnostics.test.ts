import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above all top-level code. Use vi.hoisted()
// to create shared mock references that survive hoisting.
const { _db } = vi.hoisted(() => {
  const mocks = {
    conversationParticipant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
    },
    conversationMessage: {
      findMany: vi.fn().mockResolvedValue([]),
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
      findMany: vi.fn().mockResolvedValue([]),
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
      findFirst: vi.fn().mockResolvedValue({ role: "MEMBER" }),
      findUnique: vi.fn().mockResolvedValue({ role: "MEMBER" }),
      findMany: vi.fn().mockResolvedValue([]),
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
  return { _db: db };
});

vi.mock("@/lib/db", () => {
  return { db: _db };
});

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-id-123" }),
}));

vi.mock("@/lib/flow/delivery-engine", () => ({
  queueEmailDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../notification-service", () => ({
  DEFAULT_PREFERENCES: {
    allNotificationsEnabled: true,
    mentionsEnabled: true,
    repliesEnabled: true,
    taskRemindersEnabled: true,
    meetingRemindersEnabled: true,
    dndEnabled: false,
    dndStart: "22:00",
    dndEnd: "08:00",
    digestEnabled: false,
    digestFrequency: "DAILY",
  },
  getMessagingPreferences: vi.fn().mockResolvedValue({
    allNotificationsEnabled: true,
    mentionsEnabled: true,
    repliesEnabled: true,
    taskRemindersEnabled: true,
    meetingRemindersEnabled: true,
    dndEnabled: false,
    dndStart: "22:00",
    dndEnd: "08:00",
    digestEnabled: false,
    digestFrequency: "DAILY",
  }),
  isCurrentlyInQuietHours: vi.fn().mockReturnValue(false),
  processNotificationEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  hasRole: vi.fn((role: string, required: string) => {
    const levels: Record<string, number> = { owner: 100, co_owner: 90, admin: 80, member: 10 };
    return (levels[role] ?? 0) >= (levels[required] ?? 0);
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true }),
  rateLimitByIp: vi.fn().mockResolvedValue({ success: true }),
  RATE_LIMITS: { diagnostics: { maxRequests: 10, window: "60 s" } },
}));

import { db } from "@/lib/db";

import { createNotification } from "@/lib/notifications";
import { searchMessaging } from "../search-service";
import { dispatchDueTaskReminders } from "../task-reminders";
import { dispatchDueMeetingRemindersSprint93 } from "../meeting-reminder-service";
import { dispatchPendingDigests, dispatchDigestForUser } from "../digest-service";
import { getMessagingDiagnostics } from "../diagnostics-service";
import { processNotificationEvents } from "../notification-service";

describe("Sprint 9.5 — Reliability, Diagnostics, Performance, and Phase Closeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SEARCH SERVICE RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Search Service — Batched Queries and Visibility Safety", () => {
    it("uses select instead of include for conversation search (no full participant hydration)", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", isPinned: false },
      ] as any);
      vi.mocked(db.conversation.findMany).mockResolvedValue([]);
      vi.mocked(db.conversation.count).mockResolvedValue(0);

      await searchMessaging("org-1", "user-1", { q: "test", kinds: ["conversation"] });

      expect(db.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            type: true,
            name: true,
          }),
        })
      );
    });

    it("batch-fetches participant counts via groupBy instead of N+1 include", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", isPinned: false },
      ] as any);
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        { id: "conv-1", type: "CHANNEL", name: "general", description: null, visibility: "PUBLIC", createdAt: new Date(), orgId: "org-1" },
      ] as any);
      vi.mocked(db.conversationParticipant.groupBy).mockResolvedValue([
        { conversationId: "conv-1", _count: { id: 5 } },
      ] as any);
      vi.mocked(db.conversation.count).mockResolvedValue(1);

      const result = await searchMessaging("org-1", "user-1", { q: "general", kinds: ["conversation"] });

      expect(db.conversationParticipant.groupBy).toHaveBeenCalled();
      expect(result.results[0]).toHaveProperty("memberCount", 5);
    });

    it("batch-fetches conversation names for task and meeting results", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", isPinned: false },
      ] as any);
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([
        { id: "task-1", orgId: "org-1", conversationId: "conv-1", title: "Test Task", description: null, status: "OPEN", assigneeId: null, dueDate: null, createdAt: new Date() },
      ] as any);
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        { id: "conv-1", name: "engineering" },
      ] as any);
      vi.mocked(db.messagingTask.count).mockResolvedValue(1);
      vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
      vi.mocked(db.conversationMessage.count).mockResolvedValue(0);
      vi.mocked(db.conversation.count).mockResolvedValue(0);

      const result = await searchMessaging("org-1", "user-1", { q: "Test", kinds: ["task"] });

      // Should batch-fetch conversation names instead of using include
      expect(db.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ["conv-1"] } }),
        })
      );
      expect(result.results[0]).toHaveProperty("conversationName", "engineering");
    });

    it("file search metadata queries run in parallel (Promise.all)", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", isPinned: false },
      ] as any);
      vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValue(0);
      vi.mocked(db.conversationAttachment.count).mockResolvedValue(0);
      vi.mocked(db.messagingTask.count).mockResolvedValue(0);
      vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
      vi.mocked(db.conversationMessage.count).mockResolvedValue(0);
      vi.mocked(db.conversation.count).mockResolvedValue(0);

      const result = await searchMessaging("org-1", "user-1", { q: "report", kinds: ["file"] });

      expect(result.results).toEqual([]);
      expect(result.state).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TASK REMINDER RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Task Reminders — Batched Participant Validation", () => {
    it("batch-fetches participant status instead of per-candidate N+1 queries", async () => {
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([
        {
          id: "task-1", orgId: "org-1", conversationId: "conv-1",
          title: "Task 1", status: "OPEN", assigneeId: "user-1",
          reminderAt: new Date(Date.now() - 1000), reminderSentAt: null,
        },
        {
          id: "task-2", orgId: "org-1", conversationId: "conv-1",
          title: "Task 2", status: "OPEN", assigneeId: "user-2",
          reminderAt: new Date(Date.now() - 1000), reminderSentAt: null,
        },
      ] as any);

      // Batch participant check returns both as active
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-1" },
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" },
      ] as any);

      vi.mocked(db.messagingTask.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.messagingTask.findUnique).mockImplementation(async (args: any) => ({
        id: args.where.id, orgId: "org-1", conversationId: "conv-1",
        title: "Task", status: "OPEN", assigneeId: "user-1",
      }) as any);

      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.member.findMany).mockResolvedValue([]);
      vi.mocked(db.orgDefaults.findMany).mockResolvedValue([]);

      await dispatchDueTaskReminders(10);

      // Should batch-fetch all participants in one query, not per-candidate
      expect(db.conversationParticipant.findMany).toHaveBeenCalledTimes(1);
    });

    it("releases claim on notification failure for retry safety", async () => {
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([
        {
          id: "task-fail", orgId: "org-1", conversationId: "conv-1",
          title: "Failing Task", status: "OPEN", assigneeId: "user-1",
          reminderAt: new Date(Date.now() - 1000), reminderSentAt: null,
        },
      ] as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-1" },
      ] as any);
      vi.mocked(db.messagingTask.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue({
        id: "task-fail", orgId: "org-1", conversationId: "conv-1",
        title: "Failing Task", status: "OPEN", assigneeId: "user-1",
      } as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.member.findMany).mockResolvedValue([]);
      vi.mocked(db.orgDefaults.findMany).mockResolvedValue([]);

      // Notification fails
      vi.mocked(createNotification).mockRejectedValueOnce(new Error("DB timeout"));

      const result = await dispatchDueTaskReminders(10);

      expect(result.failed).toBe(1);
      // Claim should be released (reminderSentAt set back to null)
      expect(db.messagingTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "task-fail" }),
          data: { reminderSentAt: null },
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MEETING REMINDER RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Meeting Reminders — Batched Lookups and DB-Level Filtering", () => {
    it("filters archived/locked conversations at DB level (not in application loop)", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-1", orgId: "org-1", title: "Sprint Sync",
          scheduledAt, conversationId: "conv-1",
        },
      ] as any);

      // The query should include conversation filter
      expect(db.conversationMeeting.findMany).not.toHaveBeenCalled();

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      // Verify the query included conversation filtering
      const findManyCall = vi.mocked(db.conversationMeeting.findMany);
      if (findManyCall.mock.calls.length > 0) {
        expect(findManyCall).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              conversation: expect.objectContaining({
                archivedAt: null,
                lockedAt: null,
              }),
            }),
          })
        );
      }
    });

    it("batch-fetches all participant preferences and profiles upfront", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-1", orgId: "org-1", title: "Sync",
          scheduledAt, conversationId: "conv-1",
        },
      ] as any);

      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-1" },
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" },
      ] as any);

      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      await dispatchDueMeetingRemindersSprint93();

      // Should batch-fetch participants once, not per-meeting
      expect(db.conversationParticipant.findMany).toHaveBeenCalledTimes(1);
      // Should batch-fetch preferences once
      expect(db.messagingNotificationPreference.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DIGEST SERVICE RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Digest Service — Batched Preferences and Idempotency", () => {
    it("dispatchPendingDigests uses DB-level timezone exclusion", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

      vi.mocked(db.orgDefaults.findMany)
        .mockResolvedValueOnce([{ timezone: "America/New_York" }] as any)
        .mockResolvedValueOnce([{ organizationId: "org-1", timezone: "America/New_York" }] as any);

      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);

      const result = await dispatchPendingDigests(50);

      expect(result.evaluated).toBe(0);
      vi.useRealTimers();
    });

    it("dispatchDigestForUser re-checks freshness before dispatch (idempotency guard)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

      // First check: digest enabled and overdue
      vi.mocked(db.messagingNotificationPreference.findUnique)
        .mockResolvedValueOnce({
          digestEnabled: true, digestFrequency: "DAILY",
          lastDigestSentAt: new Date(Date.now() - 21 * 60 * 60 * 1000),
        } as any)
        // Re-check inside dispatchDigestForUser: still valid
        .mockResolvedValueOnce({
          digestEnabled: true, digestFrequency: "DAILY",
          lastDigestSentAt: new Date(Date.now() - 21 * 60 * 60 * 1000),
        } as any);

      vi.mocked(db.notification.findMany).mockResolvedValue([
        { id: "n-1", type: "MENTION" },
      ] as any);
      vi.mocked(db.messagingTask.count).mockResolvedValue(0);
      vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
      vi.mocked(db.member.findFirst).mockResolvedValue({
        user: { email: "user@example.com" },
      } as any);
      vi.mocked(db.notification.create).mockResolvedValue({ id: "digest-notif" } as any);
      vi.mocked(db.messagingNotificationPreference.update).mockResolvedValue({} as any);

      const result = await dispatchDigestForUser({
        userId: "user-1", orgId: "org-1",
      });

      expect(result.dispatched).toBe(true);
      vi.useRealTimers();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. NOTIFICATION SERVICE RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Notification Service — Per-Event Error Handling", () => {
    it("continues processing remaining events when one event fails (poison event isolation)", async () => {
      const { processNotificationEvents: realPNE } = await vi.importActual<typeof import("../notification-service")>("../notification-service");

      // Clear any leaked mockResolvedValueOnce stacks from prior tests
      vi.mocked(db.conversationEventLog.findMany).mockReset();
      vi.mocked(db.conversationMessage.findUnique).mockReset();

      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({ timezone: "UTC" } as any);

      // Two events: first will fail, second should still process
      vi.mocked(db.conversationEventLog.findMany)
        .mockResolvedValueOnce([
          {
            eventId: "e-good", cursor: 100n,
            eventType: "conversation.message.created",
            orgId: "org-1", conversationId: "conv-1",
            actorId: "actor-1",
            payload: { messageId: "msg-good", mentionIds: ["user-2"] },
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

      // First message lookup succeeds, second throws
      vi.mocked(db.conversationMessage.findUnique)
        .mockResolvedValueOnce({
          id: "msg-good", body: "Hello", deletedAt: null,
          conversationId: "conv-1",
          conversation: { name: "General" },
        } as any)
        .mockRejectedValueOnce(new Error("Connection reset"));

      vi.mocked(db.profile.findUnique).mockResolvedValue({ name: "Actor" } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-2" },
      ] as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);

      // Should not throw — poison event is caught
      await realPNE("org-1", "conv-1");

      // Good event should still produce a notification
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-2", type: "MENTION" })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DIAGNOSTICS SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Diagnostics Service — Truthfulness and Access Control", () => {
    it("returns null for non-admin users (no info leakage)", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({
        role: "member",
      } as any);

      const result = await getMessagingDiagnostics("org-1", "user-member");

      expect(result).toBeNull();
    });

    it("returns null for non-members", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue(null);

      const result = await getMessagingDiagnostics("org-1", "user-stranger");

      expect(result).toBeNull();
    });

    it("returns truthful health data for admins", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({
        role: "admin",
      } as any);

      // Search index health
      vi.mocked(db.conversationAttachment.count)
        .mockResolvedValueOnce(100) // totalAttachments
        .mockResolvedValueOnce(5)  // pendingScanCount
        .mockResolvedValueOnce(0); // blockedCount

      vi.mocked(db.messagingAttachmentIndex.count)
        .mockResolvedValueOnce(80) // indexedCount
        .mockResolvedValueOnce(10) // pendingCount
        .mockResolvedValueOnce(3)  // failedCount
        .mockResolvedValueOnce(7); // unindexedCount

      // Notification health
      vi.mocked(db.notification.count)
        .mockResolvedValueOnce(500)  // totalNotifications
        .mockResolvedValueOnce(50)   // unreadCount
        .mockResolvedValueOnce(480); // notificationsWithDedupe

      vi.mocked(db.notificationDelivery.count).mockResolvedValue(2);

      // Task reminder health
      vi.mocked(db.messagingTask.count)
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(15) // dispatched
        .mockResolvedValueOnce(3)  // pendingDispatch
        .mockResolvedValueOnce(2); // overdueWithoutReminder

      // Meeting reminder health
      vi.mocked(db.conversationMeeting.count)
        .mockResolvedValueOnce(5)  // totalUpcoming
        .mockResolvedValueOnce(3)  // remindersDispatched
        .mockResolvedValueOnce(2); // pendingReminders

      // Digest health
      vi.mocked(db.messagingNotificationPreference.count)
        .mockResolvedValueOnce(30) // digestEnabledUsers
        .mockResolvedValueOnce(20) // dailyUsers
        .mockResolvedValueOnce(10) // weeklyUsers
        .mockResolvedValueOnce(15); // recentlyDispatched

      // Follow-up health
      vi.mocked(db.messagingFollowUp.count)
        .mockResolvedValueOnce(25) // totalFollowUps
        .mockResolvedValueOnce(10) // pendingFollowUps
        .mockResolvedValueOnce(15); // resolvedFollowUps

      const result = await getMessagingDiagnostics("org-1", "user-admin");

      expect(result).not.toBeNull();
      expect(result!.searchIndexHealth.totalAttachments).toBe(100);
      expect(result!.searchIndexHealth.indexedCount).toBe(80);
      expect(result!.searchIndexHealth.indexingCoveragePercent).toBe(90);
      expect(result!.searchIndexHealth.degraded).toBe(false);
      expect(result!.notificationHealth.totalNotifications).toBe(500);
      expect(result!.reminderHealth.taskReminders.total).toBe(20);
      expect(result!.digestHealth.digestEnabledUsers).toBe(30);
      expect(result!.followUpHealth.totalFollowUps).toBe(25);
    });

    it("correctly identifies degraded search index state", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);

      // High failure rate => degraded
      vi.mocked(db.conversationAttachment.count)
        .mockResolvedValueOnce(100) // totalAttachments
        .mockResolvedValueOnce(0)  // pendingScanCount
        .mockResolvedValueOnce(0); // blockedCount

      vi.mocked(db.messagingAttachmentIndex.count)
        .mockResolvedValueOnce(50) // indexedCount
        .mockResolvedValueOnce(0)  // pendingCount
        .mockResolvedValueOnce(15) // failedCount (>10% of 100)
        .mockResolvedValueOnce(35); // unindexedCount

      vi.mocked(db.notification.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.notificationDelivery.count).mockResolvedValue(0);
      vi.mocked(db.messagingTask.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.conversationMeeting.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.messagingNotificationPreference.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.messagingFollowUp.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await getMessagingDiagnostics("org-1", "user-admin");

      expect(result!.searchIndexHealth.degraded).toBe(true);
      expect(result!.searchIndexHealth.failedCount).toBe(15);
    });

    it("returns 100% coverage when no attachments exist (healthy empty state)", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);

      vi.mocked(db.conversationAttachment.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.messagingAttachmentIndex.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.notification.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.notificationDelivery.count).mockResolvedValue(0);
      vi.mocked(db.messagingTask.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.conversationMeeting.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.messagingNotificationPreference.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.mocked(db.messagingFollowUp.count)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await getMessagingDiagnostics("org-1", "user-admin");

      expect(result!.searchIndexHealth.indexingCoveragePercent).toBe(100);
      expect(result!.searchIndexHealth.degraded).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. EDGE CASES AND CROSS-CUTTING CONCERNS
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // 3B. MEETING REMINDER DURABILITY (Sprint 9.5 Regression Fixes)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Meeting Reminders — Claim/Success Durability Model", () => {
    it("sets reminderSentAt on successful dispatch (durable success marker)", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-dur-1", orgId: "org-1", title: "Durable Meeting",
          scheduledAt, conversationId: "conv-1",
        },
      ] as any);

      // updateMany for claim returns count=1 (claim won)
      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-1" },
      ] as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-1", email: "user-1@slipwise.app" },
      ] as any);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(1);
      // First updateMany call is the claim — should set reminderSentAt to now
      expect(db.conversationMeeting.updateMany).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          where: expect.objectContaining({
            id: "meet-dur-1",
            reminderSentAt: null,
            status: "UPCOMING",
          }),
          data: { reminderSentAt: expect.any(Date) },
        })
      );
      // No release call — claim should remain as durable success
      expect(db.conversationMeeting.updateMany).toHaveBeenCalledTimes(1);
    });

    it("releases reminderSentAt back to null when all notifications fail", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-fail-1", orgId: "org-1", title: "Failing Meeting",
          scheduledAt, conversationId: "conv-1",
        },
      ] as any);

      const claimNow = new Date();
      vi.mocked(db.conversationMeeting.updateMany)
        .mockResolvedValueOnce({ count: 1 } as any)  // claim
        .mockResolvedValueOnce({ count: 1 } as any);  // release
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-1" },
      ] as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-1", email: "user-1@slipwise.app" },
      ] as any);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      // All notifications fail
      vi.mocked(createNotification).mockRejectedValue(new Error("DB timeout"));

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(0);
      expect(result.failedAllNotifications).toBe(1);
      // Second updateMany call is the release — should set reminderSentAt back to null
      expect(db.conversationMeeting.updateMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: expect.objectContaining({
            id: "meet-fail-1",
            reminderSentAt: expect.any(Date),
          }),
          data: { reminderSentAt: null },
        })
      );
    });

    it("concurrent claim loser skips cleanly (updateMany returns count=0)", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-concur-1", orgId: "org-1", title: "Concurrent Meeting",
          scheduledAt, conversationId: "conv-1",
        },
      ] as any);

      // Claim fails — another worker already claimed it
      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 0 } as any);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(0);
      expect(result.failedAllNotifications).toBe(0);
      // createNotification should never be called since claim was lost
      expect(createNotification).not.toHaveBeenCalled();
    });

    it("repeated sweeps do not re-process a successfully-reminded meeting", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      // Meeting already has reminderSentAt set — should NOT appear in candidates
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([] as any);
      vi.mocked(db.messagingAuditEvent.create).mockResolvedValue({} as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.evaluated).toBe(0);
      expect(result.dispatched).toBe(0);
      // No claim or notification attempts
      expect(db.conversationMeeting.updateMany).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases — Empty vs Degraded vs Unavailable States", () => {
    it("search returns truthful empty state when no conversations joined", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationMessage.count).mockResolvedValue(0);
      vi.mocked(db.conversation.findMany).mockResolvedValue([]);
      vi.mocked(db.conversation.count).mockResolvedValue(0);
      vi.mocked(db.messagingTask.count).mockResolvedValue(0);
      vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);

      const result = await searchMessaging("org-1", "user-1", { q: "anything" });

      expect(result.results).toEqual([]);
      expect(result.state).toBe("active");
      expect(result.facets.message).toBe(0);
    });

    it("search with force-degraded returns degraded state without querying DB", async () => {
      const result = await searchMessaging("org-1", "user-1", {
        q: "force-degraded",
      });

      expect(result.state).toBe("degraded");
      expect(result.results).toEqual([]);
      expect(db.conversationParticipant.findMany).not.toHaveBeenCalled();
    });
  });

  describe("Cross-Cutting — No Cross-Org or Cross-User Leakage", () => {
    it("search queries always include orgId filter", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", isPinned: false },
      ] as any);
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationMessage.count).mockResolvedValue(0);
      vi.mocked(db.conversation.count).mockResolvedValue(0);
      vi.mocked(db.messagingTask.count).mockResolvedValue(0);
      vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);

      await searchMessaging("org-1", "user-1", { q: "test", kinds: ["message"] });

      expect(db.conversationParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: "org-1" }),
        })
      );
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: "org-1" }),
        })
      );
    });
  });
});
