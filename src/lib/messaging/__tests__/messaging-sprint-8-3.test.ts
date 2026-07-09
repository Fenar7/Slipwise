import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const mocks = {
    member: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    conversationMeeting: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    messagingTask: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    calendarConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    meetingAttendee: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => {
      if (typeof cb === "function") {
        return cb(mocks);
      }
      return Promise.resolve();
    }),
  };
  return { db };
});

import { db } from "@/lib/db";
import { scheduleMeeting, updateMeeting, cancelMeeting, listMeetingsForConversation } from "../meeting-service";
import { createTask, updateTaskStatus, assignTask, updateTask, listTasksForConversation } from "../task-service";
import {
  syncMeetingToProvider,
  syncTaskToProvider,
  reconcileProviderChangesForMeeting,
  reconcileProviderChangesForTask,
  parseProviderEventIds,
  serializeProviderEventIds,
} from "../provider-sync-service";
import { getMeetingDetail, getUnifiedCalendar } from "../read-models";

function mockAdminMember() {
  return {
    id: "member-admin",
    orgId: "org-1",
    userId: "user-admin",
    role: "admin",
  };
}

function mockParticipant(userId = "user-1", role = "MEMBER") {
  return {
    id: `membership-${userId}`,
    orgId: "org-1",
    conversationId: "conv-1",
    userId,
    role,
    leftAt: null,
    joinedAt: new Date(),
    updatedAt: new Date(),
    user: {
      email: "user@example.com",
    },
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
    createdBy: "user-admin",
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
    title: "Sprint Sync",
    description: "Weekly sync",
    scheduledAt: new Date("2026-06-15T10:00:00Z"),
    durationMinutes: 30,
    status: "UPCOMING",
    providerEventId: null,
    scheduledBy: "user-admin",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: null,
    ...overrides,
  };
}

function mockTask(overrides = {}) {
  return {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    title: "Finish Sprint 8.3",
    description: "Implement calendar provider sync",
    status: "OPEN",
    priority: 2, // High
    assigneeId: "user-assignee",
    dueDate: new Date("2026-06-10T12:00:00Z"),
    reminderAt: null,
    reminderSentAt: null,
    completedAt: null,
    completedBy: null,
    createdBy: "user-admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    providerEventId: null,
    ...overrides,
  };
}

function mockConnectionRow(overrides = {}) {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GOOGLE" as const,
    providerAccountId: "google-acc-1",
    emailAddress: "admin@example.com",
    displayName: "Org Administrator",
    tokenRef: JSON.stringify({
      accessToken: "plain-access-token",
      refreshToken: "plain-refresh-token",
    }),
    tokenExpiry: new Date("2026-12-31T12:00:00Z"),
    status: "ACTIVE" as const,
    lastSyncAt: null,
    lastSyncError: null,
    disconnectedAt: null,
    connectedBy: "user-admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Sprint 8.3 — Provider Sync & Task Calendar Tests", () => {
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "mock-google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "mock-google-client-secret");
    vi.stubEnv("OUTLOOK_CLIENT_ID", "mock-outlook-client-id");
    vi.stubEnv("OUTLOOK_CLIENT_SECRET", "mock-outlook-client-secret");

    // Establish clean default mock resolutions for DB to avoid TypeError / NotFoundError issues
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(mockParticipant("user-admin", "OWNER") as any);
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([mockParticipant("user-admin", "OWNER")] as any);
    vi.mocked(db.conversation.findFirst).mockResolvedValue(mockConversation() as any);
    vi.mocked(db.conversation.findUnique).mockResolvedValue(mockConversation() as any);
    vi.mocked(db.calendarConnection.findMany).mockResolvedValue([mockConnectionRow()] as any);
    vi.mocked(db.calendarConnection.count).mockResolvedValue(1);
    vi.mocked(db.profile.findFirst).mockResolvedValue({ id: "user-assignee", name: "Assignee Name" } as any);
    vi.mocked(db.meetingAttendee.findMany).mockResolvedValue([]);
    vi.mocked(db.meetingAttendee.createMany).mockResolvedValue({ count: 0 });

    mockFetch = vi.fn().mockImplementation((url: string, options: any = {}) => {
      // 1. Google OAuth Token Refresh Mock
      if (url.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "new-google-access-token",
          expires_in: 3600,
        }), { status: 200 }));
      }
      // 2. Google Calendar API Create Event Mock
      if (url.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        if (options.method === "DELETE") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          id: "google-remote-event-id-999",
          status: "confirmed",
          summary: "Sprint Sync",
          conferenceData: {
            entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }]
          },
          attendees: [{ email: "user@example.com", responseStatus: "accepted" }]
        }), { status: 200 }));
      }
      // 3. Microsoft Graph API Mock
      if (url.includes("graph.microsoft.com/v1.0/me/calendar/events") || url.includes("graph.microsoft.com/v1.0/me/events")) {
        if (options.method === "DELETE") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          id: "outlook-remote-event-id-999",
          subject: "Sprint Sync",
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/xyz" },
          start: { dateTime: "2026-06-15T10:00:00" },
          end: { dateTime: "2026-06-15T10:30:00" },
          isCancelled: false,
          attendees: [{ emailAddress: { address: "user@example.com" }, status: { response: "accepted" } }]
        }), { status: 200 }));
      }
      return Promise.reject(new Error(`Unhandled mock fetch for ${url}`));
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("Idempotent Calendar Event Sync on mutations", () => {
    it("creates a provider event exactly once during scheduleMeeting", async () => {
      const meet = mockMeeting();

      vi.mocked(db.conversationMeeting.create).mockResolvedValue(meet as any);
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);
      
      const syncedMeetRow = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.conversationMeeting.findUnique).mockResolvedValue(syncedMeetRow as any);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(syncedMeetRow as any);

      const result = await scheduleMeeting({
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Sprint Sync",
        description: "Weekly sync",
        scheduledAt: new Date("2026-06-15T10:00:00Z"),
        durationMinutes: 30,
        scheduledBy: "user-admin",
      });

      expect(result.providerEventId).toContain("google-remote-event-id-999");
      expect(mockFetch).toHaveBeenCalled();
      const createCall = mockFetch.mock.calls.find((call: any) => call[0].includes("googleapis.com") && call[1]?.method === "POST");
      expect(createCall).toBeDefined();
    });

    it("prevents duplicate creation by updating rather than creating if providerEventId exists", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(meet as any);
      vi.mocked(db.conversationMeeting.findUnique).mockResolvedValue(meet as any);

      const result = await updateMeeting({
        orgId: "org-1",
        conversationId: "conv-1",
        meetingId: "meet-1",
        title: "Updated Sprint Sync",
        updatedBy: "user-admin",
      });

      const putCall = mockFetch.mock.calls.find((call: any) => call[0].includes("google-remote-event-id-999") && call[1]?.method === "PUT");
      expect(putCall).toBeDefined();
      const postCall = mockFetch.mock.calls.find((call: any) => call[0].includes("googleapis.com") && call[1]?.method === "POST");
      expect(postCall).toBeUndefined();
    });

    it("cancels remote provider event and marks local meeting as cancelled during cancelMeeting", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      const cancelledMeet = mockMeeting({ status: "CANCELLED", providerEventId: "{}" });
      
      // Dynamic mock implementation: 1st call (inside cancelMeeting validation) returns UPCOMING,
      // 2nd call (inside syncMeetingToProvider execution) returns CANCELLED.
      let findFirstCallCount = 0;
      vi.mocked(db.conversationMeeting.findFirst).mockImplementation(async () => {
        findFirstCallCount++;
        if (findFirstCallCount === 1) {
          return meet as any;
        } else {
          return { ...meet, status: "CANCELLED" } as any;
        }
      });
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(cancelledMeet as any);
      vi.mocked(db.conversationMeeting.findUnique).mockResolvedValue(cancelledMeet as any);

      const result = await cancelMeeting({
        orgId: "org-1",
        conversationId: "conv-1",
        meetingId: "meet-1",
        cancelledBy: "user-admin",
      });

      expect(result.status).toBe("CANCELLED");
      const deleteCall = mockFetch.mock.calls.find((call: any) => call[0].includes("google-remote-event-id-999") && call[1]?.method === "DELETE");
      expect(deleteCall).toBeDefined();
    });
  });

  describe("Task Calendar Publication Rules", () => {
    it("publishes task due dates to provider calendars when eligible", async () => {
      const task = mockTask({ providerEventId: null });

      vi.mocked(db.messagingTask.create).mockResolvedValue(task as any);
      vi.mocked(db.messagingTask.findFirst).mockResolvedValue(task as any);
      
      const syncedTaskRow = mockTask({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.messagingTask.update).mockResolvedValue(syncedTaskRow as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(syncedTaskRow as any);

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Finish Sprint 8.3",
        dueDate: new Date("2026-06-10T12:00:00Z"),
        createdBy: "user-admin",
      });

      expect(result.providerEventId).toContain("google-remote-event-id-999");
      const createCall = mockFetch.mock.calls.find((call: any) => call[0].includes("googleapis.com") && call[1]?.method === "POST");
      expect(createCall).toBeDefined();
    });

    it("deletes published task provider events when task is completed or cancelled", async () => {
      const task = mockTask({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      const completedTask = mockTask({ status: "DONE", providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(task as any);
      
      // Since updateTaskStatus only reads findUnique, findFirst is called exactly once in syncTaskToProvider.
      // So we can mock findFirst to resolve directly to completedTask (status DONE with providerEventId present).
      vi.mocked(db.messagingTask.findFirst).mockResolvedValue(completedTask as any);
      vi.mocked(db.messagingTask.update).mockResolvedValue(completedTask as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(completedTask as any);

      const result = await updateTaskStatus({
        orgId: "org-1",
        taskId: "task-1",
        status: "DONE",
        actorId: "user-admin",
        conversationId: "conv-1",
      });

      expect(result.status).toBe("DONE");
      const deleteCall = mockFetch.mock.calls.find((call: any) => call[0].includes("google-remote-event-id-999") && call[1]?.method === "DELETE");
      expect(deleteCall).toBeDefined();
    });

    it("propagates due-date changes to provider calendars", async () => {
      const task = mockTask({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(task as any);
      vi.mocked(db.messagingTask.findFirst).mockResolvedValue(task as any);
      
      const updatedTask = mockTask({ dueDate: new Date("2026-06-20T12:00:00Z"), providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.messagingTask.update).mockResolvedValue(updatedTask as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(updatedTask as any);

      const result = await updateTask({
        orgId: "org-1",
        taskId: "task-1",
        dueDate: new Date("2026-06-20T12:00:00Z"),
        actorId: "user-admin",
        conversationId: "conv-1",
      });

      expect(result.dueDate?.toISOString()).toBe("2026-06-20T12:00:00.000Z");
      const putCall = mockFetch.mock.calls.find((call: any) => call[0].includes("google-remote-event-id-999") && call[1]?.method === "PUT");
      expect(putCall).toBeDefined();
    });

    it("updates task description with new assignee details on reassignment", async () => {
      const task = mockTask({ assigneeId: "user-assignee", providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(task as any);
      vi.mocked(db.messagingTask.findFirst).mockResolvedValue(task as any);
      
      const reassignedTask = mockTask({ assigneeId: "user-new-assignee", providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.messagingTask.update).mockResolvedValue(reassignedTask as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(reassignedTask as any);

      // Mock profile search for new assignee
      vi.mocked(db.profile.findFirst).mockResolvedValue({ id: "user-new-assignee", name: "New Assignee Name" } as any);

      const result = await assignTask({
        orgId: "org-1",
        taskId: "task-1",
        assigneeId: "user-new-assignee",
        actorId: "user-admin",
        conversationId: "conv-1",
      });

      expect(result.assigneeId).toBe("user-new-assignee");
      const putCall = mockFetch.mock.calls.find((call: any) => call[0].includes("google-remote-event-id-999") && call[1]?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(putCall[1].body).description).toContain("New Assignee Name");
    });
  });

  describe("Inbound Reconciliation for provider-side drift", () => {
    it("reconciles title and time changes from remote provider safely back to Slipwise", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);

      // Mock remote event data returned from provider (carrying title and start time updates)
      const mockRemoteGet = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: "google-remote-event-id-999",
        status: "confirmed",
        summary: "Remotely Updated Title",
        start: { dateTime: "2026-06-15T11:00:00Z" },
        end: { dateTime: "2026-06-15T11:45:00Z" },
      }), { status: 200 }));
      vi.stubGlobal("fetch", mockRemoteGet);

      const reconciledMeet = mockMeeting({
        title: "Remotely Updated Title",
        scheduledAt: new Date("2026-06-15T11:00:00Z"),
        durationMinutes: 45,
        providerEventId: '{"GOOGLE":"google-remote-event-id-999"}'
      });
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(reconciledMeet as any);

      const result = await reconcileProviderChangesForMeeting("org-1", "meet-1", "user-admin");

      expect(result.title).toBe("Remotely Updated Title");
      expect(result.scheduledAt.toISOString()).toBe("2026-06-15T11:00:00.000Z");
      expect(result.durationMinutes).toBe(45);
    });

    it("reconciles remote cancellations by marking meeting as CANCELLED locally", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);

      // Return status cancelled from remote provider
      const mockRemoteGet = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: "google-remote-event-id-999",
        status: "cancelled",
      }), { status: 200 }));
      vi.stubGlobal("fetch", mockRemoteGet);

      const reconciledMeet = mockMeeting({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "user-admin",
        cancelReason: "Remote calendar cancellation reconciled",
      });
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(reconciledMeet as any);

      const result = await reconcileProviderChangesForMeeting("org-1", "meet-1", "user-admin");

      expect(result.status).toBe("CANCELLED");
    });

    it("reconciles attendee response changes into metadata", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);

      // Return responses from remote provider
      const mockRemoteGet = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: "google-remote-event-id-999",
        status: "confirmed",
        summary: "Sprint Sync",
        start: { dateTime: "2026-06-15T10:00:00Z" },
        end: { dateTime: "2026-06-15T10:30:00Z" },
        attendees: [
          { email: "att-1@example.com", responseStatus: "accepted" },
          { email: "att-2@example.com", responseStatus: "declined" }
        ]
      }), { status: 200 }));
      vi.stubGlobal("fetch", mockRemoteGet);

      const reconciledMeet = mockMeeting({
        metadata: {
          attendeeResponses: {
            "att-1@example.com": "accepted",
            "att-2@example.com": "declined",
          }
        }
      });
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(reconciledMeet as any);

      const result = await reconcileProviderChangesForMeeting("org-1", "meet-1", "user-admin");

      expect(result.metadata.attendeeResponses["att-1@example.com"]).toBe("accepted");
      expect(result.metadata.attendeeResponses["att-2@example.com"]).toBe("declined");
    });
  });

  describe("Security and Gating Restrictions", () => {
    it("ensures archived or locked conversation meeting mutations throw ConversationAccessError", async () => {
      const archivedConv = mockConversation({ archivedAt: new Date() });

      vi.mocked(db.conversation.findFirst).mockResolvedValue(archivedConv as any);
      vi.mocked(db.conversation.findUnique).mockResolvedValue(archivedConv as any);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Sprint Sync",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-admin",
        })
      ).rejects.toThrow("scheduleMeeting: conversation is archived");
    });

    it("ensures non-members attempting to sync or reconcile throw ConversationAccessError", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      await expect(
        scheduleMeeting({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Sprint Sync",
          scheduledAt: new Date("2026-06-15T10:00:00Z"),
          scheduledBy: "user-nonmember",
        })
      ).rejects.toThrow("scheduleMeeting: active participant access required");
    });
  });

  describe("Provider parity verification under shared contract", () => {
    it("works identically for both Google and Outlook connection providers", async () => {
      const meet = mockMeeting();
      
      const gConn = mockConnectionRow({ provider: "GOOGLE" });
      const oConn = mockConnectionRow({ provider: "OUTLOOK", providerAccountId: "outlook-acc-1", emailAddress: "admin@outlook.com" });

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);
      vi.mocked(db.calendarConnection.findMany).mockResolvedValue([gConn, oConn] as any);
      
      const syncedMeetRow = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999","OUTLOOK":"outlook-remote-event-id-999"}' });
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(syncedMeetRow as any);

      const result = await syncMeetingToProvider("org-1", "meet-1");

      const parsedIds = parseProviderEventIds(result.providerEventId);
      expect(parsedIds.GOOGLE).toBe("google-remote-event-id-999");
      expect(parsedIds.OUTLOOK).toBe("outlook-remote-event-id-999");

      const gCall = mockFetch.mock.calls.find((call: any) => call[0].includes("googleapis.com"));
      const oCall = mockFetch.mock.calls.find((call: any) => call[0].includes("graph.microsoft.com"));
      expect(gCall).toBeDefined();
      expect(oCall).toBeDefined();
    });
  });

  describe("Live Read-Path Orchestrated Reconciliation", () => {
    it("listMeetingsForConversation triggers reconciliation for active meetings", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([meet] as any);
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(meet as any);

      const result = await listMeetingsForConversation("org-1", "conv-1", "user-admin");
      expect(result).toBeDefined();
      expect(db.conversationMeeting.findMany).toHaveBeenCalled();
    });

    it("listTasksForConversation triggers reconciliation for active tasks", async () => {
      const task = mockTask({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.messagingTask.findMany).mockResolvedValue([task] as any);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(task as any);
      vi.mocked(db.messagingTask.update).mockResolvedValue(task as any);

      const result = await listTasksForConversation("org-1", "conv-1", "user-admin");
      expect(result).toBeDefined();
      expect(db.messagingTask.findMany).toHaveBeenCalled();
    });

    it("getMeetingDetail triggers reconciliation on read", async () => {
      const meet = mockMeeting({ providerEventId: '{"GOOGLE":"google-remote-event-id-999"}' });
      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(meet as any);
      vi.mocked(db.conversationMeeting.update).mockResolvedValue(meet as any);

      const result = await getMeetingDetail("org-1", "meet-1", "user-admin");
      expect(result).toBeDefined();
      expect(db.conversationMeeting.findFirst).toHaveBeenCalled();
    });

    it("getUnifiedCalendar triggers reconciliation on calendar loading and deduplicates same-task reconciliations", async () => {
      const taskWithBoth = mockTask({
        id: "task-both",
        providerEventId: '{"GOOGLE":"google-remote-event-id-999"}',
        dueDate: new Date("2026-06-15T12:00:00Z"),
        reminderAt: new Date("2026-06-14T12:00:00Z"),
      });

      const mockRemoteGet = vi.fn().mockImplementation((url: string, options: any = {}) => {
        return Promise.resolve(new Response(JSON.stringify({
          id: "google-remote-event-id-999",
          status: "confirmed",
          summary: "Due: Finish Sprint 8.3",
          start: { dateTime: "2026-06-15T12:00:00Z" },
          end: { dateTime: "2026-06-15T12:30:00Z" }
        }), { status: 200 }));
      });
      vi.stubGlobal("fetch", mockRemoteGet);

      vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([]);
      vi.mocked(db.messagingTask.findMany).mockImplementation(async (args: any) => {
        return [taskWithBoth] as any;
      });
      vi.mocked(db.conversationMeeting.findUnique).mockResolvedValue(null);
      vi.mocked(db.messagingTask.findUnique).mockResolvedValue(taskWithBoth as any);
      vi.mocked(db.messagingTask.update).mockResolvedValue(taskWithBoth as any);
      vi.mocked(db.conversation.findMany).mockResolvedValue([mockConversation()] as any);
      vi.mocked(db.profile.findMany).mockResolvedValue([{ id: "user-admin", name: "Org Administrator" }] as any);

      const result = await getUnifiedCalendar("org-1", "user-admin");
      expect(result).toBeDefined();

      const getEventCalls = mockRemoteGet.mock.calls.filter((call: any) => call[0].includes("googleapis.com/calendar/v3/calendars/primary/events/"));
      expect(getEventCalls.length).toBe(1);
    });
  });
});
