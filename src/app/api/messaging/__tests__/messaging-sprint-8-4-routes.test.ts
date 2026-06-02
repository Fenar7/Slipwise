import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/messaging/rsvp-service", () => ({
  updateRsvp: vi.fn(),
  listMeetingAttendees: vi.fn(),
}));

vi.mock("@/lib/messaging/imminent-meeting-service", () => ({
  getImminentMeetingAlert: vi.fn(),
  listImminentMeetings: vi.fn(),
  assertOrgMembership: vi.fn(),
}));

vi.mock("@/lib/messaging/meeting-reminder-service", () => ({
  processPendingReminders: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth";
import { updateRsvp, listMeetingAttendees } from "@/lib/messaging/rsvp-service";
import { getImminentMeetingAlert, listImminentMeetings, assertOrgMembership } from "@/lib/messaging/imminent-meeting-service";
import { processPendingReminders } from "@/lib/messaging/meeting-reminder-service";

import { POST as postRsvp } from "../meetings/[meetingId]/rsvp/route";
import { GET as getAttendees } from "../meetings/[meetingId]/attendees/route";
import { GET as getImminentAlert } from "../meetings/imminent-alert/route";
import { ConversationAccessError, NotFoundError } from "@/lib/messaging/errors";

function makeRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Sprint 8.4 API Routes Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/messaging/meetings/[meetingId]/rsvp", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({ isAuthenticated: false } as any);

      const req = makeRequest("http://localhost/api/messaging/meetings/meet-1/rsvp", "POST", {
        rsvpStatus: "ACCEPTED",
      });
      const response = await postRsvp(req, { params: Promise.resolve({ meetingId: "meet-1" }) });

      expect(response.status).toBe(401);
    });

    it("returns 400 for invalid body", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/meetings/meet-1/rsvp", "POST", {
        rsvpStatus: "PENDING", // Invalid as per route constraint (only ACCEPTED/TENTATIVE/DECLINED allowed)
      });
      const response = await postRsvp(req, { params: Promise.resolve({ meetingId: "meet-1" }) });

      expect(response.status).toBe(400);
    });

    it("returns updated RSVP status on success", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);

      const mockResult = {
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
        respondedAt: new Date("2026-06-02T12:00:00Z"),
      };
      vi.mocked(updateRsvp).mockResolvedValueOnce(mockResult as any);

      const req = makeRequest("http://localhost/api/messaging/meetings/meet-1/rsvp", "POST", {
        rsvpStatus: "ACCEPTED",
      });
      const response = await postRsvp(req, { params: Promise.resolve({ meetingId: "meet-1" }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.rsvpStatus).toBe("ACCEPTED");
      expect(updateRsvp).toHaveBeenCalledWith({
        orgId: "org-1",
        meetingId: "meet-1",
        userId: "user-1",
        rsvpStatus: "ACCEPTED",
      });
    });

    it("returns 404 for missing meeting", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);
      vi.mocked(updateRsvp).mockRejectedValueOnce(new NotFoundError("Meeting not found"));

      const req = makeRequest("http://localhost/api/messaging/meetings/meet-1/rsvp", "POST", {
        rsvpStatus: "ACCEPTED",
      });
      const response = await postRsvp(req, { params: Promise.resolve({ meetingId: "meet-1" }) });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/messaging/meetings/[meetingId]/attendees", () => {
    it("returns attendee list mapped correctly (omits providerStatus)", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);

      const mockAttendees = [
        {
          userId: "user-1",
          rsvpStatus: "ACCEPTED",
          respondedAt: new Date("2026-06-02T12:00:00Z"),
          providerStatus: "RECONCILED",
        },
      ];
      vi.mocked(listMeetingAttendees).mockResolvedValueOnce(mockAttendees as any);

      const req = makeRequest("http://localhost/api/messaging/meetings/meet-1/attendees");
      const response = await getAttendees(req, { params: Promise.resolve({ meetingId: "meet-1" }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.attendees[0].userId).toBe("user-1");
      expect(json.attendees[0].rsvpStatus).toBe("ACCEPTED");
      expect(json.attendees[0].providerStatus).toBeUndefined(); // Should be omitted!
    });
  });

  describe("GET /api/messaging/meetings/imminent-alert", () => {
    it("returns primary alert shape on success", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);
      vi.mocked(assertOrgMembership).mockResolvedValueOnce(undefined);

      const mockAlert = {
        meetingId: "meet-1",
        title: "Standup",
        scheduledAt: "2026-06-02T12:00:00Z",
        urgency: "FIFTEEN_MINUTES",
        joinUrl: "https://meet.google.com/abc",
      };
      vi.mocked(getImminentMeetingAlert).mockResolvedValueOnce(mockAlert as any);

      const req = makeRequest("http://localhost/api/messaging/meetings/imminent-alert");
      const response = await getImminentAlert(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.alert).toEqual(mockAlert);
    });

    it("triggers reminder processing when ?process=true is passed", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);
      vi.mocked(assertOrgMembership).mockResolvedValueOnce(undefined);
      vi.mocked(getImminentMeetingAlert).mockResolvedValueOnce(null);

      const req = makeRequest("http://localhost/api/messaging/meetings/imminent-alert?process=true");
      await getImminentAlert(req);

      expect(processPendingReminders).toHaveBeenCalledWith("org-1", expect.any(Date));
    });

    it("returns null alert without 403 for non-org members", async () => {
      vi.mocked(getAuthContext).mockResolvedValueOnce({
        isAuthenticated: true,
        orgId: "org-1",
        userId: "user-1",
      } as any);
      vi.mocked(assertOrgMembership).mockRejectedValueOnce(new Error("Not a member"));

      const req = makeRequest("http://localhost/api/messaging/meetings/imminent-alert");
      const response = await getImminentAlert(req);
      const json = await response.json();

      expect(response.status).toBe(200); // 200 OK with null to prevent leakage!
      expect(json.alert).toBeNull();
    });
  });
});
