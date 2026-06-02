import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const mocks = {
    conversationMeeting: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    meetingAttendee: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    meetingReminder: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

import { db } from "@/lib/db";
import { updateRsvp, seedMeetingAttendees, listMeetingAttendees } from "../rsvp-service";
import { dispatchMeetingReminder, processPendingReminders, listMeetingReminders } from "../meeting-reminder-service";
import { getImminentMeetingAlert, listImminentMeetings, assertOrgMembership } from "../imminent-meeting-service";
import { meetingIsWithinOneHour, meetingIsWithinFifteenMinutes } from "../domain-types";

describe("Sprint 8.4 — RSVP, Reminders & Imminent Alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RSVP Mutators", () => {
    it("fails when attempting to explicitly set PENDING status", async () => {
      await expect(
        updateRsvp({
          orgId: "org-1",
          meetingId: "meet-1",
          userId: "user-1",
          rsvpStatus: "PENDING",
        })
      ).rejects.toThrow("RSVP status PENDING cannot be set explicitly");
    });

    it("fails if meeting is not found", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce(null);
      await expect(
        updateRsvp({
          orgId: "org-1",
          meetingId: "meet-1",
          userId: "user-1",
          rsvpStatus: "ACCEPTED",
        })
      ).rejects.toThrow("Meeting not found");
    });

    it("fails if meeting is CANCELLED", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        status: "CANCELLED",
      } as any);
      await expect(
        updateRsvp({
          orgId: "org-1",
          meetingId: "meet-1",
          userId: "user-1",
          rsvpStatus: "ACCEPTED",
        })
      ).rejects.toThrow("Cannot RSVP to a cancelled meeting");
    });

    it("fails if user is not a participant", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        status: "UPCOMING",
        conversationId: "conv-1",
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce(null);

      await expect(
        updateRsvp({
          orgId: "org-1",
          meetingId: "meet-1",
          userId: "user-1",
          rsvpStatus: "ACCEPTED",
        })
      ).rejects.toThrow("active participant access required");
    });

    it("fails if conversation is locked", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        status: "UPCOMING",
        conversationId: "conv-1",
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce({
        id: "part-1",
        orgId: "org-1",
        conversationId: "conv-1",
        userId: "user-1",
        role: "MEMBER",
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({
        id: "conv-1",
        orgId: "org-1",
        lockedAt: new Date(),
      } as any);

      await expect(
        updateRsvp({
          orgId: "org-1",
          meetingId: "meet-1",
          userId: "user-1",
          rsvpStatus: "ACCEPTED",
        })
      ).rejects.toThrow("updateRsvp: conversation is locked");
    });

    it("updates RSVP status successfully and logs audit event", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        status: "UPCOMING",
        conversationId: "conv-1",
        title: "Team Sync",
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce({
        id: "part-1",
        orgId: "org-1",
        conversationId: "conv-1",
        userId: "user-1",
        role: "MEMBER",
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({
        id: "conv-1",
        orgId: "org-1",
        lockedAt: null,
        archivedAt: null,
      } as any);
      vi.mocked(db.meetingAttendee.findUnique).mockResolvedValueOnce({
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "PENDING",
      } as any);
      vi.mocked(db.meetingAttendee.upsert).mockResolvedValueOnce({
        id: "att-1",
        orgId: "org-1",
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
        respondedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await updateRsvp({
        orgId: "org-1",
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
      });

      expect(res.rsvpStatus).toBe("ACCEPTED");
      expect(db.meetingAttendee.upsert).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("returns existing record without side effects if status is unchanged (idempotent)", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        status: "UPCOMING",
        conversationId: "conv-1",
        title: "Team Sync",
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValueOnce({
        id: "part-1",
        orgId: "org-1",
        conversationId: "conv-1",
        userId: "user-1",
        role: "MEMBER",
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({
        id: "conv-1",
        orgId: "org-1",
        lockedAt: null,
        archivedAt: null,
      } as any);
      vi.mocked(db.meetingAttendee.findUnique).mockResolvedValueOnce({
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
        respondedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await updateRsvp({
        orgId: "org-1",
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
      });

      expect(res.rsvpStatus).toBe("ACCEPTED");
      expect(db.meetingAttendee.upsert).not.toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("Seeding Meeting Attendees", () => {
    it("inserts pending RSVP records for active participants (skip duplicates)", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        conversationId: "conv-1",
      } as any);
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValueOnce([
        { userId: "user-1" },
        { userId: "user-2" },
      ] as any);

      await seedMeetingAttendees("org-1", "meet-1");

      expect(db.meetingAttendee.createMany).toHaveBeenCalledWith({
        data: [
          { orgId: "org-1", meetingId: "meet-1", userId: "user-1", rsvpStatus: "PENDING" },
          { orgId: "org-1", meetingId: "meet-1", userId: "user-2", rsvpStatus: "PENDING" },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe("Meeting Reminders", () => {
    it("dispatches new reminder when eligible and does not exist", async () => {
      const scheduledAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes in future
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        scheduledAt,
        durationMinutes: 30,
        status: "UPCOMING",
        title: "Refinement",
        scheduledBy: "user-1",
        conversationId: "conv-1",
      } as any);
      vi.mocked(db.meetingReminder.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.meetingReminder.create).mockResolvedValueOnce({
        id: "rem-1",
        orgId: "org-1",
        meetingId: "meet-1",
        window: "SIXTY_MINUTES",
        sentAt: new Date(),
        skipped: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await dispatchMeetingReminder("org-1", "meet-1", "SIXTY_MINUTES");
      expect(res).not.toBeNull();
      expect(res!.skipped).toBe(false);
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("skips reminder if meeting is already CANCELLED", async () => {
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        orgId: "org-1",
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
        durationMinutes: 30,
        status: "CANCELLED",
        title: "Refinement",
        scheduledBy: "user-1",
        conversationId: "conv-1",
      } as any);
      vi.mocked(db.meetingReminder.findUnique).mockResolvedValueOnce(null);
      vi.mocked(db.meetingReminder.create).mockResolvedValueOnce({
        id: "rem-1",
        orgId: "org-1",
        meetingId: "meet-1",
        window: "SIXTY_MINUTES",
        sentAt: null,
        skipped: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await dispatchMeetingReminder("org-1", "meet-1", "SIXTY_MINUTES");
      expect(res).not.toBeNull();
      expect(res!.skipped).toBe(true);
      expect(db.messagingAuditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("Imminent Meeting Alerts", () => {
    it("returns primary alert with urgency and ms countdown", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValueOnce([
        { conversationId: "conv-1" },
      ] as any);
      const scheduledAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Standup",
          scheduledAt,
          durationMinutes: 15,
          status: "UPCOMING",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          scheduledBy: "user-organizer",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);
      vi.mocked(db.meetingAttendee.findUnique).mockResolvedValueOnce({
        rsvpStatus: "ACCEPTED",
      } as any);

      const alert = await getImminentMeetingAlert("org-1", "user-1");
      expect(alert).not.toBeNull();
      expect(alert!.urgency).toBe("FIFTEEN_MINUTES");
      expect(alert!.joinUrl).toBe("https://meet.google.com/abc-defg-hij");
    });

    it("hides joinUrl if user has DECLINED", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValueOnce([
        { conversationId: "conv-1" },
      ] as any);
      const scheduledAt = new Date(Date.now() + 10 * 60 * 1000);
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Standup",
          scheduledAt,
          durationMinutes: 15,
          status: "UPCOMING",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          scheduledBy: "user-organizer",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);
      vi.mocked(db.meetingAttendee.findUnique).mockResolvedValueOnce({
        rsvpStatus: "DECLINED",
      } as any);

      const alert = await getImminentMeetingAlert("org-1", "user-1");
      expect(alert).not.toBeNull();
      expect(alert!.joinUrl).toBeNull();
    });
  });
});
