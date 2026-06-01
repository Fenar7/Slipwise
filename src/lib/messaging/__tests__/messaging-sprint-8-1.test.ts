import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const mocks = {
    conversationMeeting: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: unknown) => {
      if (typeof cb === "function") {
        return (cb as (tx: typeof mocks) => Promise<unknown>)(mocks);
      }
      return Promise.resolve();
    }),
  };
  return { db };
});

import { db } from "@/lib/db";
import {
  scheduleMeeting,
  updateMeeting,
  cancelMeeting,
  listMeetingsForConversation,
} from "../meeting-service";
import { getUnifiedCalendar, getMeetingDetail } from "../read-models";

function mockParticipant(userId = "user-1", role = "MEMBER") {
  return {
    id: `membership-${userId}`,
    orgId: "org-1",
    conversationId: "conv-1",
    userId,
    role,
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockConversation(overrides = {}) {
  return {
    id: "conv-1",
    orgId: "org-1",
    type: "CHANNEL",
    name: "General",
    description: null,
    visibility: "PUBLIC",
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockMeeting(overrides = {}) {
  return {
    id: "meet-1",
    orgId: "org-1",
    conversationId: "conv-1",
    title: "Project Sync",
    description: "Weekly sync",
    scheduledAt: new Date("2026-06-15T10:00:00Z"),
    durationMinutes: 30,
    status: "UPCOMING",
    providerEventId: null,
    scheduledBy: "user-1",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Sprint 8.1 — Meeting Service & Unified Calendar Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scheduleMeeting", () => {
    it("successfully schedules a meeting in an authorized active conversation", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation();
      const meet = mockMeeting();

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);
      vi.mocked(db.conversationMeeting.create).mockResolvedValue(meet);

      const result = await scheduleMeeting({
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Project Sync",
        description: "Weekly sync",
        scheduledAt: new Date("2026-06-15T10:00:00Z"),
        durationMinutes: 30,
        scheduledBy: "user-1",
      });

      expect(result.title).toBe("Project Sync");
      expect(result.status).toBe("UPCOMING");
      expect(db.conversationMeeting.create).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("fails if the scheduler is not an active participant", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Project Sync",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-2",
        })
      ).rejects.toThrow("active participant access required");
    });

    it("fails if the conversation is archived", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation({ archivedAt: new Date(), archivedBy: "user-1" });

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Project Sync",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-1",
        })
      ).rejects.toThrow("conversation is archived");
    });

    it("fails if the conversation is locked", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation({ lockedAt: new Date(), lockedBy: "user-1", lockReason: "security" });

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Project Sync",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-1",
        })
      ).rejects.toThrow("conversation is locked");
    });

    it("fails validation for malformed inputs", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation();

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-1",
        })
      ).rejects.toThrow("Meeting title is required");

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Valid Title",
          scheduledAt: new Date("invalid-date"),
          scheduledBy: "user-1",
        })
      ).rejects.toThrow("Meeting scheduled time must be a valid date");

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Valid Title",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          durationMinutes: -10,
          scheduledBy: "user-1",
        })
      ).rejects.toThrow("Meeting duration must be positive");
    });
  });

  describe("updateMeeting", () => {
    it("allows meeting organizer to edit details", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation();
      const meet = mockMeeting({ scheduledBy: "user-1" });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue({
        ...meet,
        title: "Updated Project Sync",
      });

      const result = await updateMeeting({
        orgId: "org-1",
        meetingId: "meet-1",
        title: "Updated Project Sync",
        updatedBy: "user-1",
      });

      expect(result.title).toBe("Updated Project Sync");
      expect(db.conversationMeeting.update).toHaveBeenCalled();
    });

    it("allows conversation admin/owner to edit details even if not the meeting organizer", async () => {
      const part = mockParticipant("user-admin", "ADMIN");
      const conv = mockConversation();
      const meet = mockMeeting({ scheduledBy: "user-organizer" });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue({
        ...meet,
        title: "Admin Override Sync",
      });

      const result = await updateMeeting({
        orgId: "org-1",
        meetingId: "meet-1",
        title: "Admin Override Sync",
        updatedBy: "user-admin",
      });

      expect(result.title).toBe("Admin Override Sync");
    });

    it("rejects edit if the caller is a normal member and not the organizer", async () => {
      const part = mockParticipant("user-other", "MEMBER");
      const conv = mockConversation();
      const meet = mockMeeting({ scheduledBy: "user-organizer" });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);

      await expect(
        updateMeeting({
          orgId: "org-1",
          meetingId: "meet-1",
          title: "Unauthorized Edit",
          updatedBy: "user-other",
        })
      ).rejects.toThrow("organizer or conversation admin/owner role required");
    });
  });

  describe("cancelMeeting", () => {
    it("successfully cancels a meeting and updates status while preserving audit integrity", async () => {
      const part = mockParticipant("user-1");
      const conv = mockConversation();
      const meet = mockMeeting({ scheduledBy: "user-1" });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversation.findFirst).mockResolvedValue(conv);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue({
        ...meet,
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "user-1",
        cancelReason: "Emergency",
      });

      const result = await cancelMeeting({
        orgId: "org-1",
        meetingId: "meet-1",
        cancelledBy: "user-1",
        cancelReason: "Emergency",
      });

      expect(result.status).toBe("CANCELLED");
      expect(result.cancelledBy).toBe("user-1");
      expect(result.cancelReason).toBe("Emergency");
      expect(db.conversationMeeting.update).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });
  });

  describe("listMeetingsForConversation", () => {
    it("returns list of meetings for active participants", async () => {
      const part = mockParticipant("user-1");
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(part);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        mockMeeting({ id: "m1", title: "Meeting 1" }),
        mockMeeting({ id: "m2", title: "Meeting 2" }),
      ]);

      const result = await listMeetingsForConversation("org-1", "conv-1", "user-1");

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Meeting 1");
    });

    it("rejects non-participants from viewing meeting lists", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      await expect(
        listMeetingsForConversation("org-1", "conv-1", "user-2")
      ).rejects.toThrow("active participant access required");
    });
  });

  describe("getUnifiedCalendar", () => {
    it("correctly maps and aggregates meetings, tasks and reminders into unified calendar entries", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1" },
      ]);
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        { id: "conv-1", name: "Engineering" },
      ]);

      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([
        mockMeeting({
          id: "m1",
          title: "Meeting Sync",
          scheduledAt: new Date("2026-06-10T10:00:00Z"),
          durationMinutes: 30,
        }),
      ]);

      vi.mocked(db.messagingTask.findMany).mockImplementation(async (args: any) => {
        if (args.where.dueDate) {
          // Task due date query
          return [
            {
              id: "t1",
              orgId: "org-1",
              conversationId: "conv-1",
              title: "Code Review",
              description: "Review Sprint PR",
              status: "OPEN",
              dueDate: new Date("2026-06-11T12:00:00Z"),
              assigneeId: "user-assignee",
              createdBy: "user-creator",
              createdAt: new Date(),
              updatedAt: new Date(),
              priority: 2,
            },
          ];
        } else if (args.where.reminderAt) {
          // Task reminder query
          return [
            {
              id: "t1",
              orgId: "org-1",
              conversationId: "conv-1",
              title: "Code Review",
              description: "Review Sprint PR",
              status: "OPEN",
              dueDate: new Date("2026-06-11T12:00:00Z"),
              reminderAt: new Date("2026-06-10T15:00:00Z"),
              assigneeId: "user-assignee",
              createdBy: "user-creator",
              createdAt: new Date(),
              updatedAt: new Date(),
              priority: 2,
            },
          ];
        }
        return [];
      });

      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-assignee", name: "Alice Assignee" },
        { id: "user-1", name: "Bob Scheduler" },
      ]);

      const calendar = await getUnifiedCalendar("org-1", "user-1");

      expect(calendar).toHaveLength(3); // 1 meeting, 1 due date, 1 reminder

      // Verify Meeting Entry
      const meetingEntry = calendar.find((e) => e.type === "meeting");
      expect(meetingEntry).toBeDefined();
      expect(meetingEntry!.title).toBe("Meeting Sync");
      expect(meetingEntry!.conversationName).toBe("Engineering");

      // Verify Task Due Entry
      const taskDueEntry = calendar.find((e) => e.type === "task_due_date");
      expect(taskDueEntry).toBeDefined();
      expect(taskDueEntry!.title).toBe("Due: Code Review");
      expect(taskDueEntry!.assigneeName).toBe("Alice Assignee");

      // Verify Task Reminder Entry
      const reminderEntry = calendar.find((e) => e.type === "task_reminder");
      expect(reminderEntry).toBeDefined();
      expect(reminderEntry!.title).toBe("Reminder: Code Review");
    });
  });
});
