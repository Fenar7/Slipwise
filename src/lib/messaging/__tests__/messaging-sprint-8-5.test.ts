import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

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
    },
    messagingTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
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

describe("Sprint 8.5 — Reliability, Diagnostics & Provider Parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCalendarDiagnostics", () => {
    it("returns null for non-admin callers (no leakage)", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({
        role: "MEMBER",
      } as any);

      const result = await getCalendarDiagnostics("org-1", "user-member");
      expect(result).toBeNull();
    });

    it("returns correct diagnostics payload for admins", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({
        role: "ADMIN",
      } as any);

      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          emailAddress: "g@example.com",
          status: "ACTIVE",
          lastSyncAt: new Date("2026-06-02T12:00:00Z"),
          lastSyncError: null,
        },
        {
          id: "conn-2",
          provider: "OUTLOOK",
          emailAddress: "o@example.com",
          status: "RECONNECT_REQUIRED",
          lastSyncAt: new Date("2026-06-02T11:00:00Z"),
          lastSyncError: "Access token expired",
        },
        {
          id: "conn-3",
          provider: "GOOGLE",
          emailAddress: "g-degraded@example.com",
          status: "ACTIVE",
          lastSyncAt: new Date("2026-06-02T11:30:00Z"),
          lastSyncError: "Google createEvent failed: 503 Service Unavailable",
        },
      ] as any);

      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          title: "Status Sync",
          conversationId: "conv-1",
          scheduledAt: new Date("2026-06-02T13:00:00Z"),
          status: "UPCOMING",
          providerEventId: JSON.stringify({ GOOGLE: "event-g-1" }), // Missing OUTLOOK mapping
        },
      ] as any);

      vi.mocked(db.messagingTask.findMany).mockResolvedValueOnce([
        {
          id: "task-1",
          title: "Publish reports",
          conversationId: "conv-1",
          dueDate: new Date("2026-06-02T17:00:00Z"),
          status: "OPEN",
          providerEventId: null, // Missing all mappings
        },
      ] as any);

      const result = await getCalendarDiagnostics("org-1", "user-admin");
      expect(result).not.toBeNull();
      expect(result?.connections).toHaveLength(3);
      expect(result?.connections[0].health).toBe("healthy");
      expect(result?.connections[0].lastSyncErrorClass).toBe("NONE");
      
      expect(result?.connections[1].health).toBe("reconnect_required");
      expect(result?.connections[1].lastSyncErrorClass).toBe("AUTH_EXPIRED");

      expect(result?.connections[2].health).toBe("degraded");
      expect(result?.connections[2].lastSyncErrorClass).toBe("PROVIDER_UNAVAILABLE");

      // Verify sync failure lists
      expect(result?.meetingSyncFailures).toHaveLength(1);
      expect(result?.meetingSyncFailures[0].failureClass).toBe("MISSING_PROVIDER_EVENT");

      expect(result?.taskSyncFailures).toHaveLength(1);
      expect(result?.taskSyncFailures[0].failureClass).toBe("MISSING_PROVIDER_EVENT");
    });

    it("detects duplicate calendar event mappings as conflict indicators", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValueOnce({
        role: "OWNER",
      } as any);

      vi.mocked(db.calendarConnection.findMany).mockResolvedValueOnce([
        {
          id: "conn-1",
          provider: "GOOGLE",
          emailAddress: "g@example.com",
          status: "ACTIVE",
          lastSyncError: null,
        },
      ] as any);

      // Two different meetings sharing the same Google provider event ID
      vi.mocked(db.conversationMeeting.findMany).mockResolvedValueOnce([
        {
          id: "meet-1",
          title: "Meeting A",
          conversationId: "conv-1",
          scheduledAt: new Date("2026-06-02T13:00:00Z"),
          status: "UPCOMING",
          providerEventId: JSON.stringify({ GOOGLE: "duplicate-event-id" }),
        },
        {
          id: "meet-2",
          title: "Meeting B",
          conversationId: "conv-1",
          scheduledAt: new Date("2026-06-02T14:00:00Z"),
          status: "UPCOMING",
          providerEventId: JSON.stringify({ GOOGLE: "duplicate-event-id" }),
        },
      ] as any);

      vi.mocked(db.messagingTask.findMany).mockResolvedValueOnce([]);

      const result = await getCalendarDiagnostics("org-1", "user-owner");
      expect(result?.conflictIndicators).toHaveLength(1);
      expect(result?.conflictIndicators[0].type).toBe("meeting");
      expect(result?.conflictIndicators[0].details).toContain("Duplicate external calendar mapping detected");
    });
  });

  describe("Provider Parity Check", () => {
    it("ensures Google and Outlook adapters strictly fulfill the shared adapter contract", () => {
      const google = new GoogleCalendarAdapter();
      const outlook = new OutlookCalendarAdapter();

      expect(google.getProviderType()).toBe("GOOGLE");
      expect(outlook.getProviderType()).toBe("OUTLOOK");

      expect(typeof google.getAuthUrl).toBe("function");
      expect(typeof outlook.getAuthUrl).toBe("function");

      expect(typeof google.exchangeCode).toBe("function");
      expect(typeof outlook.exchangeCode).toBe("function");

      expect(typeof google.refreshAccessToken).toBe("function");
      expect(typeof outlook.refreshAccessToken).toBe("function");

      expect(typeof google.createEvent).toBe("function");
      expect(typeof outlook.createEvent).toBe("function");

      expect(typeof google.updateEvent).toBe("function");
      expect(typeof outlook.updateEvent).toBe("function");

      expect(typeof google.deleteEvent).toBe("function");
      expect(typeof outlook.deleteEvent).toBe("function");

      expect(typeof google.getEvent).toBe("function");
      expect(typeof outlook.getEvent).toBe("function");
    });
  });
});
