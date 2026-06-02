import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

process.env.GOOGLE_CLIENT_ID = "mock-google-id";
process.env.OUTLOOK_CLIENT_ID = "mock-outlook-id";

// Create stable mock adapter definitions to use in both provider-sync and read-model tests
const mockGoogleAdapter = {
  getProviderType: vi.fn(() => "GOOGLE"),
  getAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  refreshAccessToken: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvent: vi.fn(),
};

const mockOutlookAdapter = {
  getProviderType: vi.fn(() => "OUTLOOK"),
  getAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  refreshAccessToken: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvent: vi.fn(),
};

vi.mock("@/lib/messaging/calendar-providers", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getCalendarProviderAdapter: vi.fn((provider) => {
      if (provider === "GOOGLE") return mockGoogleAdapter;
      return mockOutlookAdapter;
    }),
  };
});

vi.mock("@/lib/db", () => {
  const mocks = {
    calendarConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    conversationMeeting: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    conversationParticipant: {
      findMany: vi.fn(() => []),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

import { db } from "@/lib/db";
import { getCalendarDiagnostics } from "../read-models";
import { GoogleCalendarAdapter, OutlookCalendarAdapter } from "../calendar-providers";
import { syncMeetingToProvider, syncTaskToProvider, parseProviderEventIds } from "../provider-sync-service";

describe("Sprint 8.5 — Reliability, Diagnostics & Provider Parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCalendarDiagnostics with Reconcile Drift Detection", () => {
    it("returns null for non-admin callers (no leakage)", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({
        role: "MEMBER",
      } as any);

      const result = await getCalendarDiagnostics("org-1", "user-member");
      expect(result).toBeNull();
    });

    it("detects and flags RECONCILE_DRIFT when remote meeting title or scheduled time mismatch", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({ role: "ADMIN" } as any);
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          emailAddress: "g@example.com",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc", refreshToken: "enc-ref" }),
        },
      ] as any);

      // Local meeting
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          title: "Local Title",
          conversationId: "conv-1",
          scheduledAt: new Date("2026-06-02T13:00:00Z"),
          durationMinutes: 30,
          status: "UPCOMING",
          providerEventId: JSON.stringify({ GOOGLE: "remote-event-1" }),
        },
      ] as any);

      vi.mocked(db.messagingTask.findMany).mockResolvedValueOnce([]);

      // Mock remote drift in adapter: remote event has different title
      mockGoogleAdapter.getEvent.mockResolvedValueOnce({
        title: "Drifted Title",
        startAt: new Date("2026-06-02T13:00:00Z"),
        endAt: new Date("2026-06-02T13:30:00Z"),
        status: "ACTIVE",
      });

      const result = await getCalendarDiagnostics("org-1", "user-admin");
      expect(result?.meetingSyncFailures).toHaveLength(1);
      expect(result?.meetingSyncFailures[0].failureClass).toBe("RECONCILE_DRIFT");
    });

    it("detects and flags RECONCILE_DRIFT when remote task due date mismatch", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({ role: "ADMIN" } as any);
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          emailAddress: "g@example.com",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc", refreshToken: "enc-ref" }),
        },
      ] as any);

      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([]);

      // Local task
      vi.mocked(db.messagingTask.findMany).mockResolvedValueOnce([
        {
          id: "task-1",
          title: "Sync task",
          conversationId: "conv-1",
          dueDate: new Date("2026-06-02T15:00:00Z"),
          status: "OPEN",
          providerEventId: JSON.stringify({ GOOGLE: "remote-event-1" }),
        },
      ] as any);

      // Mock remote drift in adapter: remote task due date differs
      mockGoogleAdapter.getEvent.mockResolvedValueOnce({
        title: "Due: Sync task",
        startAt: new Date("2026-06-02T17:00:00Z"), // Mismatch
        endAt: new Date("2026-06-02T17:30:00Z"),
      });

      const result = await getCalendarDiagnostics("org-1", "user-admin");
      expect(result?.taskSyncFailures).toHaveLength(1);
      expect(result?.taskSyncFailures[0].failureClass).toBe("RECONCILE_DRIFT");
    });
  });

  describe("Hardened Cancel/Remove Flow with Missing Remote Events", () => {
    it("handles remote 404 cleanly on meeting cancellation, clearing mappings without failing", async () => {
      const mockMeeting = {
        id: "meet-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Cancelled Meet",
        status: "CANCELLED",
        scheduledAt: new Date(),
        durationMinutes: 30,
        providerEventId: JSON.stringify({ GOOGLE: "remote-event-1" }),
        scheduledBy: "user-1",
      };

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce(mockMeeting as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({ id: "conv-1" } as any);
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc", refreshToken: "enc-ref" }),
        },
      ] as any);

      // Mock deleteEvent to throw a 404 Not Found error
      mockGoogleAdapter.deleteEvent.mockRejectedValueOnce(new Error("404 Event Not Found"));

      // Mock db.conversationMeeting.update inside the transaction
      vi.mocked(db.conversationMeeting.update).mockResolvedValueOnce({
        ...mockMeeting,
        providerEventId: JSON.stringify({}), // Should be cleared!
      } as any);

      const result = await syncMeetingToProvider("org-1", "meet-1");
      expect(result.providerEventId).toBe(JSON.stringify({}));
      expect(db.calendarConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "conn-1" }),
          data: expect.objectContaining({ lastSyncError: null }), // Success health
        })
      );
    });

    it("handles remote 404 cleanly on task completion (unpublish), clearing mappings", async () => {
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Completed Task",
        status: "DONE", // Completed task = no longer eligible = unpublish
        dueDate: new Date(),
        providerEventId: JSON.stringify({ GOOGLE: "remote-event-1" }),
        createdBy: "user-1",
      };

      vi.mocked(db.messagingTask.findFirst).mockResolvedValueOnce(mockTask as any);
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc", refreshToken: "enc-ref" }),
        },
      ] as any);

      mockGoogleAdapter.deleteEvent.mockRejectedValueOnce(new Error("404 Event Not Found"));

      vi.mocked(db.messagingTask.update).mockResolvedValueOnce({
        ...mockTask,
        providerEventId: JSON.stringify({}), // Cleared!
      } as any);

      const result = await syncTaskToProvider("org-1", "task-1");
      expect(result.providerEventId).toBe(JSON.stringify({}));
      expect(db.calendarConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "conn-1" }),
          data: expect.objectContaining({ lastSyncError: null }),
        })
      );
    });
  });

  describe("High-Fidelity Provider Adapter Parity Tests", () => {
    it("ensures both adapters have matching Google / Microsoft Graph contract structure", () => {
      const google = new GoogleCalendarAdapter();
      const outlook = new OutlookCalendarAdapter();

      expect(google.getProviderType()).toBe("GOOGLE");
      expect(outlook.getProviderType()).toBe("OUTLOOK");

      const redirect = "http://localhost/callback";
      expect(google.getAuthUrl("state-1", redirect)).toContain("accounts.google.com");
      expect(outlook.getAuthUrl("state-1", redirect)).toContain("login.microsoftonline.com");
    });

    it("verifies join-link extraction parity by testing HTTP mapping outcomes", async () => {
      const mockFetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
          // Google payload returns video join URI
          return Promise.resolve(new Response(JSON.stringify({
            id: "g-event-123",
            conferenceData: {
              entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }]
            }
          }), { status: 200 }));
        }
        if (url.includes("graph.microsoft.com/v1.0/me/calendar/events")) {
          // Outlook payload returns onlineMeeting joinUrl
          return Promise.resolve(new Response(JSON.stringify({
            id: "o-event-123",
            onlineMeeting: {
              joinUrl: "https://teams.microsoft.com/l/meetup-join/123"
            }
          }), { status: 200 }));
        }
        return Promise.reject(new Error("Unhandled"));
      });

      vi.stubGlobal("fetch", mockFetch);

      const google = new GoogleCalendarAdapter();
      const outlook = new OutlookCalendarAdapter();

      const gResult = await google.createEvent("g-token", {
        title: "Meet G",
        startAt: new Date(),
        endAt: new Date(),
      });

      const oResult = await outlook.createEvent("o-token", {
        title: "Meet O",
        startAt: new Date(),
        endAt: new Date(),
      });

      expect(gResult.joinUrl).toBe("https://meet.google.com/abc-defg-hij");
      expect(oResult.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/123");

      vi.unstubAllGlobals();
    });

    it("verifies attendee RSVP response mapping parity across adapters", async () => {
      const mockFetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
          return Promise.resolve(new Response(JSON.stringify({
            id: "g-event-123",
            attendees: [
              { email: "att1@example.com", responseStatus: "accepted" },
              { email: "att2@example.com", responseStatus: "declined" }
            ]
          }), { status: 200 }));
        }
        if (url.includes("graph.microsoft.com/v1.0/me/calendar/events")) {
          return Promise.resolve(new Response(JSON.stringify({
            id: "o-event-123",
            attendees: [
              { emailAddress: { address: "att1@example.com" }, status: { response: "accepted" } },
              { emailAddress: { address: "att2@example.com" }, status: { response: "declined" } }
            ]
          }), { status: 200 }));
        }
        return Promise.reject(new Error("Unhandled"));
      });

      vi.stubGlobal("fetch", mockFetch);

      const google = new GoogleCalendarAdapter();
      const outlook = new OutlookCalendarAdapter();

      const gResult = await google.createEvent("g-token", {
        title: "Meet G",
        startAt: new Date(),
        endAt: new Date(),
      });

      const oResult = await outlook.createEvent("o-token", {
        title: "Meet O",
        startAt: new Date(),
        endAt: new Date(),
      });

      expect(gResult.attendeeResponses?.["att1@example.com"]).toBe("accepted");
      expect(gResult.attendeeResponses?.["att2@example.com"]).toBe("declined");

      expect(oResult.attendeeResponses?.["att1@example.com"]).toBe("accepted");
      expect(oResult.attendeeResponses?.["att2@example.com"]).toBe("declined");

      vi.unstubAllGlobals();
    });
  });

  describe("Duplicate Prevention under Multiple Same-Provider Connections", () => {
    it("ensures two active Google connections create distinct remote events and store both mappings without overwriting", async () => {
      const mockMeeting = {
        id: "meet-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Distinct Meet",
        status: "UPCOMING",
        scheduledAt: new Date("2026-06-02T13:00:00Z"),
        durationMinutes: 30,
        providerEventId: JSON.stringify({}), // empty initial mapping
        scheduledBy: "user-1",
      };

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce(mockMeeting as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({ id: "conv-1" } as any);
      
      // Two active GOOGLE connections
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-google-1",
          provider: "GOOGLE",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc1", refreshToken: "enc-ref1" }),
        },
        {
          id: "conn-google-2",
          provider: "GOOGLE",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc2", refreshToken: "enc-ref2" }),
        },
      ] as any);

      // Mock createEvent to return distinct event IDs
      mockGoogleAdapter.createEvent
        .mockResolvedValueOnce({ providerEventId: "google-event-id-1", joinUrl: "https://meet1" })
        .mockResolvedValueOnce({ providerEventId: "google-event-id-2", joinUrl: "https://meet2" });

      // Mock update
      vi.mocked(db.conversationMeeting.update).mockImplementationOnce((args: any) => {
        return Promise.resolve({
          ...mockMeeting,
          providerEventId: args.data.providerEventId,
        } as any);
      });

      const result = await syncMeetingToProvider("org-1", "meet-1");

      const parsedIds = parseProviderEventIds(result.providerEventId);
      // Both connection IDs must have their own distinct mapping
      expect(parsedIds["conn-google-1"]).toBe("google-event-id-1");
      expect(parsedIds["conn-google-2"]).toBe("google-event-id-2");
      // Mappings must not be overwritten or lost
      expect(Object.keys(parsedIds)).toHaveLength(2);
    });

    it("verifies that diagnostics remain truthful and detect no missing provider event when connection-keyed mapping exists", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({ role: "ADMIN" } as any);
      
      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-google-1",
          provider: "GOOGLE",
          status: "ACTIVE",
          tokenRef: JSON.stringify({ accessToken: "enc-acc", refreshToken: "enc-ref" }),
        },
      ] as any);

      // Local meeting has connection-keyed mapping
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          title: "Local Title",
          conversationId: "conv-1",
          scheduledAt: new Date("2026-06-02T13:00:00Z"),
          durationMinutes: 30,
          status: "UPCOMING",
          providerEventId: JSON.stringify({ "conn-google-1": "remote-event-1" }),
        },
      ] as any);

      vi.mocked(db.messagingTask.findMany).mockResolvedValueOnce([]);

      mockGoogleAdapter.getEvent.mockResolvedValueOnce({
        title: "Local Title",
        startAt: new Date("2026-06-02T13:00:00Z"),
        endAt: new Date("2026-06-02T13:30:00Z"),
        status: "ACTIVE",
      });

      const result = await getCalendarDiagnostics("org-1", "user-admin");
      // Connection-keyed mapping must be recognized, meaning 0 missing event failures and 0 drift failures
      expect(result?.meetingSyncFailures).toHaveLength(0);
    });
  });
});
