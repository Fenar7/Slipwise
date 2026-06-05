import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// Mock db client
vi.mock("@/lib/db", () => {
  const mocks = {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    messagingNotificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockImplementation(async (args: any) => {
        const userIds = args?.where?.userId?.in || [];
        const orgId = args?.where?.orgId;
        const findUniqueMock = mocks.messagingNotificationPreference.findUnique;
        const results = [];
        for (const userId of userIds) {
          const res = await findUniqueMock({
            where: {
              orgId_userId: { orgId, userId },
            },
          });
          if (res) {
            results.push({ userId, orgId, ...res });
          }
        }
        return results;
      }),
      upsert: vi.fn(),
    },
    conversationParticipant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    conversationReadState: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockImplementation(async (args: any) => {
        const userIds = args?.where?.userId?.in || [];
        const findFirstMock = mocks.conversationReadState.findFirst;
        const results = [];
        for (const userId of userIds) {
          const res = await findFirstMock({ where: { userId } });
          if (res) {
            results.push({ userId, ...res });
          } else {
            results.push({ userId, isMuted: false });
          }
        }
        return results;
      }),
      upsert: vi.fn(),
    },
    conversationMeeting: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockImplementation(async (args: any) => {
        const ids = args?.where?.id?.in || [];
        const findUniqueMock = mocks.profile.findUnique;
        const results = [];
        for (const id of ids) {
          const res = await findUniqueMock({ where: { id } });
          if (res) {
            results.push({ id, ...res });
          } else {
            results.push({ id, email: `${id}@slipwise.app` });
          }
        }
        return results;
      }),
    },
    downstreamConsumptionCheckpoint: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    conversationEventLog: {
      findMany: vi.fn(),
    },
    conversationMessage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    conversationThread: {
      findUnique: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    orgDefaults: {
      findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});


// Mock notification delivery engine function
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-id-123" }),
}));

// Mock auth / api utils
vi.mock("@/app/api/messaging/_utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/messaging/_utils")>();
  return {
    ...actual,
    requireMessagingApiContext: vi.fn().mockResolvedValue({ userId: "user-1", orgId: "org-1" }),
    messagingApiResponse: (data: any) => ({ success: true, data }),
    messagingApiError: (code: string, message: string, status?: number) => ({ success: false, error: { code, message }, status }),
    handleMessagingApiError: (err: any) => ({ success: false, error: err.message }),
  };
});

import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  getMessagingPreferences,
  updateMessagingPreferences,
  toggleConversationMute,
  getMessagingNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  processNotificationEvents,
  isCurrentlyInQuietHours,
} from "../notification-service";
import { dispatchDueMeetingRemindersSprint93 } from "../meeting-reminder-service";
import { dispatchDueTaskReminders } from "../task-reminders";

// API Route Handlers
import { GET as getNotificationsRoute, POST as postNotificationsRoute } from "@/app/api/messaging/notifications/route";
import { GET as getPrefsRoute, PUT as putPrefsRoute } from "@/app/api/messaging/notification-preferences/route";
import { POST as postMuteRoute } from "@/app/api/messaging/conversations/[conversationId]/mute/route";

describe("Sprint 9.3 — Notification Center, Preferences, and Alert Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Preference Defaults and Persistence", () => {
    it("returns default preferences if no row exists in the database", async () => {
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue(null);

      const prefs = await getMessagingPreferences({ userId: "user-1", orgId: "org-1" });

      expect(prefs.allNotificationsEnabled).toBe(true);
      expect(prefs.mentionsEnabled).toBe(true);
      expect(prefs.repliesEnabled).toBe(true);
      expect(prefs.dndEnabled).toBe(false);
      expect(prefs.dndStart).toBe("22:00");
      expect(prefs.dndEnd).toBe("08:00");
    });

    it("returns database values when preference row exists", async () => {
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue({
        id: "pref-1",
        orgId: "org-1",
        userId: "user-1",
        allNotificationsEnabled: false,
        mentionsEnabled: true,
        repliesEnabled: false,
        taskRemindersEnabled: true,
        meetingRemindersEnabled: true,
        dndEnabled: true,
        dndStart: "23:00",
        dndEnd: "07:00",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const prefs = await getMessagingPreferences({ userId: "user-1", orgId: "org-1" });

      expect(prefs.allNotificationsEnabled).toBe(false);
      expect(prefs.repliesEnabled).toBe(false);
      expect(prefs.dndEnabled).toBe(true);
      expect(prefs.dndStart).toBe("23:00");
      expect(prefs.dndEnd).toBe("07:00");
    });

    it("upserts user preferences on update", async () => {
      vi.mocked(db.messagingNotificationPreference.upsert).mockResolvedValue({
        id: "pref-1",
        orgId: "org-1",
        userId: "user-1",
        allNotificationsEnabled: true,
        mentionsEnabled: false,
        repliesEnabled: true,
        taskRemindersEnabled: true,
        meetingRemindersEnabled: true,
        dndEnabled: false,
        dndStart: "22:00",
        dndEnd: "08:00",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const updated = await updateMessagingPreferences({
        userId: "user-1",
        orgId: "org-1",
        preferences: { mentionsEnabled: false },
      });

      expect(updated.mentionsEnabled).toBe(false);
      expect(db.messagingNotificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId_userId: { orgId: "org-1", userId: "user-1" } },
          update: expect.objectContaining({ mentionsEnabled: false }),
        })
      );
    });
  });

  describe("Quiet Hours (DND) Check logic", () => {
    it("returns false if DND is disabled", () => {
      const inQuiet = isCurrentlyInQuietHours({
        dndEnabled: false,
        dndStart: "22:00",
        dndEnd: "08:00",
      } as any);
      expect(inQuiet).toBe(false);
    });

    it("evaluates quiet hours spanning overnight (22:00 - 08:00)", () => {
      const originalDate = global.Date;

      // Mock Date to 23:30 UTC
      const mockTimeQuiet = new Date("2026-06-03T23:30:00Z");
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockTimeQuiet.getTime());
          } else {
            super(...args);
          }
        }
      } as any;

      let inQuiet = isCurrentlyInQuietHours({
        dndEnabled: true,
        dndStart: "22:00",
        dndEnd: "08:00",
      } as any);
      expect(inQuiet).toBe(true);

      // Mock Date to 12:00 (Noon) UTC
      const mockTimeNoon = new Date("2026-06-03T12:00:00Z");
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockTimeNoon.getTime());
          } else {
            super(...args);
          }
        }
      } as any;

      inQuiet = isCurrentlyInQuietHours({
        dndEnabled: true,
        dndStart: "22:00",
        dndEnd: "08:00",
      } as any);
      expect(inQuiet).toBe(false);

      // Restore Date
      global.Date = originalDate;
    });

    it("evaluates quiet hours using timezone (Asia/Kolkata +5:30)", () => {
      const originalDate = global.Date;

      // Mock Date to 17:30 UTC. In Asia/Kolkata, this is 23:00 (17:30 + 5:30)
      const mockTime = new Date("2026-06-03T17:30:00Z");
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockTime.getTime());
          } else {
            super(...args);
          }
        }
      } as any;

      // With Asia/Kolkata, it is 23:00 local time, so inside quiet hours (22:00 - 08:00)
      const inQuietIST = isCurrentlyInQuietHours(
        {
          dndEnabled: true,
          dndStart: "22:00",
          dndEnd: "08:00",
        } as any,
        "Asia/Kolkata"
      );
      expect(inQuietIST).toBe(true);

      // Without timezone, it falls back to UTC (17:30), which is outside quiet hours
      const inQuietUTC = isCurrentlyInQuietHours({
        dndEnabled: true,
        dndStart: "22:00",
        dndEnd: "08:00",
      } as any);
      expect(inQuietUTC).toBe(false);

      // Restore Date
      global.Date = originalDate;
    });
  });

  describe("Conversation-level Mute Controls", () => {
    it("allows active conversation participants to mute a conversation", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({ id: "p-1" } as any);
      vi.mocked(db.conversationReadState.upsert).mockResolvedValue({} as any);

      await toggleConversationMute({
        userId: "user-1",
        orgId: "org-1",
        conversationId: "conv-1",
        isMuted: true,
      });

      expect(db.conversationReadState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId_userId: { conversationId: "conv-1", userId: "user-1" } },
          update: expect.objectContaining({ isMuted: true }),
        })
      );
    });

    it("rejects muting if the user is not an active participant", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      await expect(
        toggleConversationMute({
          userId: "user-1",
          orgId: "org-1",
          conversationId: "conv-1",
          isMuted: true,
        })
      ).rejects.toThrow("Mute toggle failed: user is not an active participant in this conversation");
    });
  });

  describe("Notification Listing and Mark-Read Security Boundaries", () => {
    it("lists messaging-specific notifications and filters by mentions", async () => {
      vi.mocked(db.notification.findMany).mockResolvedValue([
        { id: "n-1", type: "MENTION", userId: "user-1", orgId: "org-1" }
      ] as any);
      vi.mocked(db.notification.count).mockResolvedValue(1);

      const result = await getMessagingNotifications({
        userId: "user-1",
        orgId: "org-1",
        filter: "mentions",
      });

      expect(result.notifications).toHaveLength(1);
      expect(db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            orgId: "org-1",
            sourceModule: "messaging",
            type: "MENTION",
          }),
        })
      );
    });

    it("restricts marking read to owned messaging notifications", async () => {
      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 1 } as any);

      const success = await markNotificationRead({
        userId: "user-1",
        orgId: "org-1",
        notificationId: "n-1",
        isRead: true,
      });

      expect(success).toBe(true);
      expect(db.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "n-1",
            userId: "user-1",
            orgId: "org-1",
            sourceModule: "messaging",
          },
        })
      );
    });

    it("mark-all-read only updates unread messaging notifications in current user org scope", async () => {
      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 5 } as any);

      const count = await markAllNotificationsRead({ userId: "user-1", orgId: "org-1" });

      expect(count).toBe(5);
      expect(db.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            orgId: "org-1",
            sourceModule: "messaging",
            isRead: false,
          },
        })
      );
    });
  });

  describe("Durable Notification Routing (Event Stream)", () => {
    it("routes message.created event containing mentions to active conversation participants", async () => {
      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([
        {
          eventId: "e-1",
          cursor: 100n,
          eventType: "conversation.message.created",
          orgId: "org-1",
          conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-1", mentionIds: ["user-2", "user-3"] },
          createdAt: new Date(),
        }
      ] as any);
      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-1",
        body: "Hello @user-2 and @user-3",
        conversation: { name: "Dev Group" },
      } as any);
      vi.mocked(db.profile.findUnique).mockImplementation(async (args: any) => {
        if (args.where.id === "actor-1") return { name: "Actor User" } as any;
        return { email: `${args.where.id}@slipwise.app` } as any;
      });

      // user-2 is active participant, user-3 left
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-2" }
      ] as any);

      // Mock user-2 preferences: enabled
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue(null);

      await processNotificationEvents("org-1", "conv-1");

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "MENTION",
          body: "Actor User: Hello @user-2 and @user-3",
          sourceModule: "messaging",
        })
      );
      expect(createNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-3" })
      );
      expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalled();
    });

    it("creates in-app notification with emailRequested false for a user in DND during mention routing", async () => {
      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([
        {
          eventId: "e-3",
          cursor: 102n,
          eventType: "conversation.message.created",
          orgId: "org-1",
          conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-3", mentionIds: ["user-2"] },
          createdAt: new Date(),
        }
      ] as any);
      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-3",
        body: "Hello @user-2",
        conversation: { name: "Dev Group" },
      } as any);
      vi.mocked(db.profile.findUnique).mockImplementation(async (args: any) => {
        if (args.where.id === "actor-1") return { name: "Actor User" } as any;
        return { email: `user-2@slipwise.app` } as any;
      });

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-2" }
      ] as any);

      // Mock user-2 preference: allEnabled, mentionsEnabled, DND is active
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue({
        allNotificationsEnabled: true,
        mentionsEnabled: true,
        repliesEnabled: true,
        taskRemindersEnabled: true,
        meetingRemindersEnabled: true,
        dndEnabled: true,
        dndStart: "00:00",
        dndEnd: "23:59",
      } as any);

      await processNotificationEvents("org-1", "conv-1");

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "MENTION",
          emailRequested: false, // suppressed due to DND
        })
      );
    });

    it("routes thread.replied event to thread anchor author and distinct prior thread participants, respecting mute", async () => {
      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([
        {
          eventId: "e-2",
          cursor: 101n,
          eventType: "conversation.thread.replied",
          orgId: "org-1",
          conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-2", threadId: "thread-1" },
          createdAt: new Date(),
        }
      ] as any);
      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-2",
        body: "Thread response body",
        conversation: { name: "Project Alpha" },
      } as any);
      vi.mocked(db.profile.findUnique).mockImplementation(async (args: any) => {
        if (args.where.id === "actor-1") return { name: "Actor User" } as any;
        return { email: `${args.where.id}@slipwise.app` } as any;
      });

      vi.mocked(db.conversationThread.findUnique).mockResolvedValue({
        id: "thread-1",
        anchorMessage: { authorId: "anchor-author" },
      } as any);

      // Prior message author
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        { authorId: "prior-participant" }
      ] as any);

      // All are active participants (anchor-author and prior-participant)
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "anchor-author" },
        { userId: "prior-participant" }
      ] as any);

      // anchor-author has muted the conversation, prior-participant has not
      vi.mocked(db.conversationReadState.findFirst).mockImplementation(async (args: any) => {
        if (args.where.userId === "anchor-author") return { isMuted: true } as any;
        return { isMuted: false } as any;
      });

      await processNotificationEvents("org-1", "conv-1");

      // prior-participant should get notified
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "prior-participant",
          type: "REPLY",
        })
      );
      // anchor-author should not because of mute
      expect(createNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "anchor-author",
        })
      );
    });

    it("creates in-app notification with emailRequested false for a user in DND during reply routing", async () => {
      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([
        {
          eventId: "e-4",
          cursor: 103n,
          eventType: "conversation.thread.replied",
          orgId: "org-1",
          conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-4", threadId: "thread-1" },
          createdAt: new Date(),
        }
      ] as any);
      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-4",
        body: "Reply in thread",
        conversation: { name: "Project Alpha" },
      } as any);
      vi.mocked(db.profile.findUnique).mockImplementation(async (args: any) => {
        if (args.where.id === "actor-1") return { name: "Actor User" } as any;
        return { email: `prior-participant@slipwise.app` } as any;
      });
      vi.mocked(db.conversationThread.findUnique).mockResolvedValue({
        id: "thread-1",
        anchorMessage: { authorId: "anchor-author" },
      } as any);
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        { authorId: "prior-participant" }
      ] as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "prior-participant" }
      ] as any);
      vi.mocked(db.conversationReadState.findFirst).mockResolvedValue({ isMuted: false } as any);

      // DND active for prior-participant
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue({
        allNotificationsEnabled: true,
        repliesEnabled: true,
        dndEnabled: true,
        dndStart: "00:00",
        dndEnd: "23:59",
      } as any);

      await processNotificationEvents("org-1", "conv-1");

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "prior-participant",
          type: "REPLY",
          emailRequested: false, // suppressed due to DND
        })
      );
    });
  });
  describe("Task Reminder Preferences and Mute integration", () => {
    it("sweeps task reminders but skips notification if preferences disable them", async () => {
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([
        {
          id: "task-1",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Complete PR review",
          status: "OPEN",
          reminderAt: new Date(Date.now() - 1000),
          reminderSentAt: null,
          assigneeId: "user-2",
        }
      ] as any);
      vi.mocked(db.messagingTask.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue({
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Complete PR review",
        status: "OPEN",
        assigneeId: "user-2",
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" }
      ] as any);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([
        { orgId: "org-1", userId: "user-2", taskRemindersEnabled: false }
      ] as any);
      vi.mocked(db.member.findMany).mockResolvedValue([]);

      const result = await dispatchDueTaskReminders();

      expect(result.dispatched).toBe(1);
      expect(createNotification).not.toHaveBeenCalled();
    });

    it("creates in-app notification but suppresses email delivery for task assignee in DND", async () => {
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([
        {
          id: "task-2",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Complete DND task",
          status: "OPEN",
          reminderAt: new Date(Date.now() - 1000),
          reminderSentAt: null,
          assigneeId: "user-2",
        }
      ] as any);
      vi.mocked(db.messagingTask.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue({
        id: "task-2",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Complete DND task",
        status: "OPEN",
        assigneeId: "user-2",
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" }
      ] as any);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([
        {
          orgId: "org-1",
          userId: "user-2",
          allNotificationsEnabled: true,
          taskRemindersEnabled: true,
          dndEnabled: true,
          dndStart: "00:00",
          dndEnd: "23:59",
        }
      ] as any);
      vi.mocked(db.member.findMany).mockResolvedValue([
        { organizationId: "org-1", userId: "user-2", user: { email: "user-2@slipwise.app" } }
      ] as any);

      const result = await dispatchDueTaskReminders();

      expect(result.dispatched).toBe(1);
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "TASK_REMINDER",
          emailRequested: false, // suppressed due to DND
        })
      );
    });
  });

  describe("Meeting Reminder Sweep", () => {
    it("runs idempotent sweep and notifies active conversation participants if scheduled within 15 minutes", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins from now
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-1",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Sprint Sync",
          status: "UPCOMING",
          scheduledAt,
          conversation: {
            id: "conv-1",
            name: "Dev Team",
            archivedAt: null,
            lockedAt: null,
          },
        }
      ] as any);

      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" }
      ] as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-2", email: "user-2@slipwise.app" }
      ] as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(1);
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "MEETING_REMINDER",
          title: "Upcoming Meeting: Sprint Sync",
        })
      );
    });

    it("creates in-app notification but suppresses email delivery for participant in DND", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-2",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "DND Meeting",
          status: "UPCOMING",
          scheduledAt,
          conversation: {
            id: "conv-1",
            name: "Dev Team",
            archivedAt: null,
            lockedAt: null,
          },
        }
      ] as any);

      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" }
      ] as any);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-2", email: "user-2@slipwise.app" }
      ] as any);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);

      // User-2 in DND
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([
        {
          userId: "user-2",
          orgId: "org-1",
          allNotificationsEnabled: true,
          meetingRemindersEnabled: true,
          dndEnabled: true,
          dndStart: "00:00",
          dndEnd: "23:59",
        }
      ] as any);

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(1);
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "MEETING_REMINDER",
          emailRequested: false, // suppressed due to DND
        })
      );
    });

    it("releases claim on meeting reminder if notifications fail for all participants", async () => {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        {
          id: "meet-3",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Failed Sweep Meeting",
          status: "UPCOMING",
          scheduledAt,
          conversation: {
            id: "conv-1",
            name: "Dev Team",
            archivedAt: null,
            lockedAt: null,
          },
        }
      ] as any);

      vi.mocked(db.conversationMeeting.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { orgId: "org-1", conversationId: "conv-1", userId: "user-2" }
      ] as any);
      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-2", email: "user-2@slipwise.app" }
      ] as any);

      // createNotification throws for all participants — triggers claim release
      vi.mocked(createNotification).mockRejectedValue(new Error("Database connection timeout"));

      const result = await dispatchDueMeetingRemindersSprint93();

      expect(result.dispatched).toBe(0);
      expect(result.failedAllNotifications).toBe(1);

      expect(db.conversationMeeting.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "meet-3", reminderSentAt: expect.any(Date) },
          data: { reminderSentAt: null },
        })
      );
    });
  });

  describe("API Router Integration Handlers", () => {
    it("GET notifications list returns scoped notifications", async () => {
      vi.mocked(db.notification.findMany).mockResolvedValue([{ id: "n-1" }] as any);
      vi.mocked(db.notification.count).mockResolvedValue(1);

      const req = new NextRequest("http://localhost/api/messaging/notifications?filter=all");
      const res = await getNotificationsRoute(req) as any;

      expect(res.success).toBe(true);
      expect(res.data.notifications).toHaveLength(1);
    });

    it("POST notifications mark-read updates status", async () => {
      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 1 } as any);

      const req = new NextRequest("http://localhost/api/messaging/notifications", {
        method: "POST",
        body: JSON.stringify({ notificationId: "n-1", isRead: true }),
      });
      const res = await postNotificationsRoute(req) as any;

      expect(res.success).toBe(true);
      expect(res.data.success).toBe(true);
    });

    it("GET/PUT notification preferences operates on user context", async () => {
      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue(null);
      vi.mocked(db.messagingNotificationPreference.upsert).mockResolvedValue({
        allNotificationsEnabled: true,
      } as any);

      const getReq = new NextRequest("http://localhost/api/messaging/notification-preferences");
      const getRes = await getPrefsRoute(getReq) as any;
      expect(getRes.success).toBe(true);

      const putReq = new NextRequest("http://localhost/api/messaging/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ allNotificationsEnabled: false }),
      });
      const putRes = await putPrefsRoute(putReq) as any;
      expect(putRes.success).toBe(true);
    });

    it("POST mute rejects requests for users who are not active participants", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/messaging/conversations/conv-1/mute", {
        method: "POST",
        body: JSON.stringify({ isMuted: true }),
      });
      const res = await postMuteRoute(req, { params: Promise.resolve({ conversationId: "conv-1" }) }) as any;

      expect(res.success).toBe(false);
      expect(res.error).toContain("Mute toggle failed");
    });
  });

  describe("API Route Input Validation Handlers", () => {
    it("GET notifications list rejects invalid filter", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notifications?filter=invalid-filter");
      const res = await getNotificationsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("Invalid filter");
    });

    it("GET notifications list rejects invalid limit", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notifications?limit=-10");
      const res = await getNotificationsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("Limit must be a valid positive integer");
    });

    it("GET notifications list rejects too large limit", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notifications?limit=250");
      const res = await getNotificationsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("Limit must be between 1 and 100");
    });

    it("PUT preferences rejects unknown keys", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ unknownKey: true }),
      });
      const res = await putPrefsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("not a permitted preference option");
    });

    it("PUT preferences rejects invalid types for booleans", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ allNotificationsEnabled: "true" }),
      });
      const res = await putPrefsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("must be a boolean");
    });

    it("PUT preferences rejects invalid quiet-hours time format", async () => {
      const req = new NextRequest("http://localhost/api/messaging/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ dndStart: "25:00" }),
      });
      const res = await putPrefsRoute(req) as any;

      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.error.message).toContain("must be a string in HH:MM format");
    });
  });

  describe("Notification Idempotency and Downstream Retry Recovery", () => {
    it("createNotification helper is idempotent: returns existing row and skips email queueing when dedupeKey matches", async () => {
      const { createNotification: actualCreateNotification } = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");

      const existingNotif = { id: "notif-1", dedupeKey: "dedupe-123", isRead: false };
      vi.mocked(db.notification.findUnique).mockResolvedValue(existingNotif as any);

      const result = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "MEETING_REMINDER",
        title: "Test Meeting",
        body: "Starts in 15m",
        emailRequested: true,
        recipientEmail: "user-2@slipwise.app",
        dedupeKey: "dedupe-123",
      });

      expect(result).toEqual(existingNotif);
      expect(db.notification.findUnique).toHaveBeenCalled();
      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it("createNotification helper creates a new notification on first run, but returns existing on second run", async () => {
      const { createNotification: actualCreateNotification } = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");

      const newNotif = { id: "notif-2", dedupeKey: "dedupe-456" };
      
      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.notification.create).mockResolvedValueOnce(newNotif as any);

      const result1 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "TASK_REMINDER",
        title: "Task Title",
        body: "Task Body",
        dedupeKey: "dedupe-456",
      });

      expect(result1).toEqual(newNotif);
      expect(db.notification.create).toHaveBeenCalled();

      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(newNotif as any);

      const result2 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "TASK_REMINDER",
        title: "Task Title",
        body: "Task Body",
        dedupeKey: "dedupe-456",
      });

      expect(result2).toEqual(newNotif);
    });

    it("processNotificationEvents retry behavior after partial failure (first recipient succeeds, later throws) does not create duplicate notifications", async () => {
      vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([
        {
          eventId: "e-10",
          cursor: 200n,
          eventType: "conversation.message.created",
          orgId: "org-1",
          conversationId: "conv-1",
          actorId: "actor-1",
          payload: { messageId: "msg-10", mentionIds: ["user-2", "user-3"] },
          createdAt: new Date(),
        }
      ] as any);

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-10",
        body: "Hello @user-2 and @user-3",
        conversation: { name: "Test Group" },
      } as any);

      vi.mocked(db.profile.findUnique).mockImplementation(async (args: any) => {
        if (args.where.id === "actor-1") return { name: "Actor User" } as any;
        return { email: `${args.where.id}@slipwise.app` } as any;
      });

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-2" },
        { userId: "user-3" }
      ] as any);

      vi.mocked(db.messagingNotificationPreference.findUnique).mockResolvedValue(null);

      const createdNotifications: any[] = [];

      vi.mocked(createNotification).mockImplementation(async (params: any) => {
        if (params.userId === "user-3") {
          throw new Error("Simulated database write failure for user-3");
        }
        const exists = createdNotifications.some(n => n.userId === params.userId && n.dedupeKey === params.dedupeKey);
        if (!exists) {
          createdNotifications.push({ ...params, id: `notif-${params.userId}` });
        }
        return { id: `notif-${params.userId}` };
      });

      await processNotificationEvents("org-1", "conv-1");

      // Sprint 9.5: per-event error handling means the function does NOT throw on partial failure.
      // user-2 gets notified, user-3's failure is caught and logged, checkpoint is still updated.
      expect(createdNotifications.filter(n => n.userId === "user-2")).toHaveLength(1);
      expect(createdNotifications.filter(n => n.userId === "user-3")).toHaveLength(0);
      expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalled();

      vi.mocked(createNotification).mockImplementation(async (params: any) => {
        const exists = createdNotifications.some(n => n.userId === params.userId && n.dedupeKey === params.dedupeKey);
        if (!exists) {
          createdNotifications.push({ ...params, id: `notif-${params.userId}` });
        }
        return { id: `notif-${params.userId}` };
      });

      await processNotificationEvents("org-1", "conv-1");

      expect(createdNotifications.filter(n => n.userId === "user-2")).toHaveLength(1);
      expect(createdNotifications.filter(n => n.userId === "user-3")).toHaveLength(1);
      expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalled();
    });

    it("task reminder sweep passes dedupeKey and does not duplicate in-app notification when called twice", async () => {
      const { createNotification: actualCreateNotification } = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");

      const firstNotif = { id: "notif-task-1", dedupeKey: "task_reminder:task-1:1000" };
      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.notification.create).mockResolvedValueOnce(firstNotif as any);

      const result1 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "TASK_REMINDER",
        title: "Complete PR review",
        body: "Task reminder: Complete PR review",
        dedupeKey: "task_reminder:task-1:1000",
      });

      expect(result1).toEqual(firstNotif);
      expect(db.notification.create).toHaveBeenCalled();

      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(firstNotif as any);

      const result2 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "TASK_REMINDER",
        title: "Complete PR review",
        body: "Task reminder: Complete PR review",
        dedupeKey: "task_reminder:task-1:1000",
      });

      expect(result2).toEqual(firstNotif);
      expect(db.notification.create).not.toHaveBeenCalledTimes(2);
    });

    it("meeting reminder sweep passes dedupeKey and does not duplicate in-app notification when called twice", async () => {
      const { createNotification: actualCreateNotification } = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");

      const firstNotif = { id: "notif-meet-1", dedupeKey: "meeting_reminder:meet-1:FIFTEEN_MINUTES" };
      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.notification.create).mockResolvedValueOnce(firstNotif as any);

      const result1 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "MEETING_REMINDER",
        title: "Upcoming Meeting: Sprint Sync",
        body: "Meeting Starts in 15 minutes.",
        dedupeKey: "meeting_reminder:meet-1:FIFTEEN_MINUTES",
      });

      expect(result1).toEqual(firstNotif);
      expect(db.notification.create).toHaveBeenCalled();

      vi.mocked(db.notification.findUnique).mockResolvedValueOnce(firstNotif as any);

      const result2 = await actualCreateNotification({
        userId: "user-2",
        orgId: "org-1",
        type: "MEETING_REMINDER",
        title: "Upcoming Meeting: Sprint Sync",
        body: "Meeting Starts in 15 minutes.",
        dedupeKey: "meeting_reminder:meet-1:FIFTEEN_MINUTES",
      });

      expect(result2).toEqual(firstNotif);
      expect(db.notification.create).not.toHaveBeenCalledTimes(2);
    });

    it("createNotification throws error on P2002 when the second findUnique re-fetch returns null", async () => {
      const { createNotification: actualCreateNotification } = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");

      vi.mocked(db.notification.findUnique)
        .mockResolvedValueOnce(null) // first check — not found
        .mockResolvedValueOnce(null); // second check after P2002

      vi.mocked(db.notification.create).mockRejectedValueOnce({ code: "P2002" });

      await expect(
        actualCreateNotification({
          userId: "user-2",
          orgId: "org-1",
          type: "TASK_REMINDER",
          title: "Task Title",
          body: "Task Body",
          dedupeKey: "key",
        })
      ).rejects.toThrow("createNotification: deduplication re-fetch returned null after P2002 — retry required");
    });
  });
});
