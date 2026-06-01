import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/messaging/_utils", () => {
  const requireMessagingApiContext = vi.fn();
  const messagingApiResponse = vi.fn((data: any, status = 200) => {
    return new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  const handleMessagingApiError = vi.fn((err: any) => {
    const status = err.status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? "Error" }),
      {
        status,
        headers: { "content-type": "application/json" },
      }
    );
  });
  const safeRead = vi.fn(async (promise: any) => {
    try {
      return await promise;
    } catch (e: any) {
      throw e;
    }
  });
  const requireStringField = vi.fn((val: any) => val);
  const requireNumberRange = vi.fn((val: any) => val);
  const requireValidDate = vi.fn((val: any) => {
    if (!val) return undefined;
    const d = new Date(val);
    if (isNaN(d.getTime())) throw new Error("Invalid date");
    return d;
  });

  return {
    requireMessagingApiContext,
    messagingApiResponse,
    handleMessagingApiError,
    safeRead,
    requireStringField,
    requireNumberRange,
    requireValidDate,
    MessagingApiError: class extends Error {
      status = 422;
    },
    MessagingApiErrorCode: {
      VALIDATION_ERROR: "VALIDATION_ERROR",
    },
  };
});

vi.mock("@/lib/messaging/meeting-service", () => ({
  listMeetingsForConversation: vi.fn(),
  scheduleMeeting: vi.fn(),
  updateMeeting: vi.fn(),
  cancelMeeting: vi.fn(),
}));

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import {
  listMeetingsForConversation,
  scheduleMeeting,
  updateMeeting,
  cancelMeeting,
} from "@/lib/messaging/meeting-service";
import { GET as getMeetings, POST as postMeeting } from "../conversations/[id]/meetings/route";
import { PATCH as patchMeeting, DELETE as deleteMeeting } from "../conversations/[id]/meetings/[meetingId]/route";

function makeRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Meetings API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMessagingApiContext).mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
      role: "member",
    });
  });

  describe("GET /conversations/[id]/meetings", () => {
    it("successfully lists meetings for conversation", async () => {
      const mockMeetings = [{ id: "meet-1", title: "Meeting 1" }];
      vi.mocked(listMeetingsForConversation).mockResolvedValue(mockMeetings as any);

      const response = await getMeetings(
        makeRequest("http://localhost/api/messaging/conversations/conv-1/meetings"),
        { params: Promise.resolve({ id: "conv-1" }) }
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockMeetings);
      expect(listMeetingsForConversation).toHaveBeenCalledWith("org-1", "conv-1", "user-1");
    });
  });

  describe("POST /conversations/[id]/meetings", () => {
    it("successfully schedules a meeting", async () => {
      const mockCreated = { id: "meet-1", title: "Project Kickoff" };
      vi.mocked(scheduleMeeting).mockResolvedValue(mockCreated as any);

      const req = makeRequest("http://localhost/api/messaging/conversations/conv-1/meetings", "POST", {
        title: "Project Kickoff",
        scheduledAt: "2026-06-15T10:00:00Z",
        durationMinutes: 45,
      });

      const response = await postMeeting(req, { params: Promise.resolve({ id: "conv-1" }) });
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockCreated);
      expect(scheduleMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "org-1",
          conversationId: "conv-1",
          title: "Project Kickoff",
          scheduledBy: "user-1",
        })
      );
    });
  });

  describe("PATCH /conversations/[id]/meetings/[meetingId]", () => {
    it("successfully updates meeting details", async () => {
      const mockUpdated = { id: "meet-1", title: "Updated Project Kickoff" };
      vi.mocked(updateMeeting).mockResolvedValue(mockUpdated as any);

      const req = makeRequest("http://localhost/api/messaging/conversations/conv-1/meetings/meet-1", "PATCH", {
        title: "Updated Project Kickoff",
      });

      const response = await patchMeeting(req, {
        params: Promise.resolve({ id: "conv-1", meetingId: "meet-1" }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockUpdated);
      expect(updateMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "org-1",
          meetingId: "meet-1",
          title: "Updated Project Kickoff",
          updatedBy: "user-1",
        })
      );
    });
  });

  describe("DELETE /conversations/[id]/meetings/[meetingId]", () => {
    it("successfully cancels a meeting", async () => {
      const mockCancelled = { id: "meet-1", status: "CANCELLED" };
      vi.mocked(cancelMeeting).mockResolvedValue(mockCancelled as any);

      const req = makeRequest("http://localhost/api/messaging/conversations/conv-1/meetings/meet-1", "DELETE", {
        cancelReason: "Emergency",
      });

      const response = await deleteMeeting(req, {
        params: Promise.resolve({ id: "conv-1", meetingId: "meet-1" }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockCancelled);
      expect(cancelMeeting).toHaveBeenCalledWith({
        orgId: "org-1",
        meetingId: "meet-1",
        cancelledBy: "user-1",
        cancelReason: "Emergency",
      });
    });
  });
});
