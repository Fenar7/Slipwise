import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/messaging/_utils", () => ({
  requireMessagingApiContext: vi.fn(),
  handleMessagingApiError: vi.fn((err) => {
    let status = 500;
    if (err.status) status = err.status;
    else if (err.name === "NotFoundError" || err.message?.toLowerCase().includes("not found")) status = 404;
    else if (err.name === "ConversationAccessError" || err.message?.toLowerCase().includes("forbidden") || err.message?.toLowerCase().includes("access denied")) status = 403;
    else if (err.name === "InvalidInputError" || err.message?.toLowerCase().includes("must be") || err.message?.toLowerCase().includes("invalid")) status = 400;
    return new Response(JSON.stringify({ error: err.message }), { status });
  }),
  MessagingApiError: class extends Error {
    status: number;
    code: string;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.name = "MessagingApiError";
      this.code = code;
      this.status = status;
    }
  },
  MessagingApiErrorCode: {
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    INVALID_INPUT: "INVALID_INPUT",
    INTERNAL_ERROR: "INTERNAL_ERROR",
  },
}));

vi.mock("@/lib/db", () => {
  const mocks = {
    conversationMeeting: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    messagingTask: {
      findFirst: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/lib/messaging/read-models", () => ({
  getCalendarDiagnostics: vi.fn(),
}));

vi.mock("@/lib/messaging/provider-sync-service", () => ({
  syncMeetingToProvider: vi.fn(),
  syncTaskToProvider: vi.fn(),
  reconcileProviderChangesForMeeting: vi.fn(),
  reconcileProviderChangesForTask: vi.fn(),
}));

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { db } from "@/lib/db";
import { getCalendarDiagnostics } from "@/lib/messaging/read-models";
import {
  syncMeetingToProvider,
  syncTaskToProvider,
  reconcileProviderChangesForMeeting,
  reconcileProviderChangesForTask,
} from "@/lib/messaging/provider-sync-service";

import { GET as getDiagnostics } from "../admin/calendar-diagnostics/route";
import { POST as postReconcile } from "../admin/calendar-diagnostics/reconcile/route";

function makeRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Sprint 8.5 Admin Calendar Diagnostics API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/messaging/admin/calendar-diagnostics", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(requireMessagingApiContext).mockRejectedValueOnce({
        status: 401,
        message: "Unauthorized",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics");
      const res = await getDiagnostics(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 if authenticated but not admin/owner", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-1",
        role: "member",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics");
      const res = await getDiagnostics(req);

      expect(res.status).toBe(403);
    });

    it("returns 200 and diagnostics for authorized admin", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-admin",
        role: "admin",
      } as any);

      const mockDiagnostics = { connections: [], meetingSyncFailures: [], taskSyncFailures: [], conflictIndicators: [] };
      vi.mocked(getCalendarDiagnostics).mockResolvedValueOnce(mockDiagnostics as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics");
      const res = await getDiagnostics(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.diagnostics).toEqual(mockDiagnostics);
    });
  });

  describe("POST /api/messaging/admin/calendar-diagnostics/reconcile", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(requireMessagingApiContext).mockRejectedValueOnce({
        status: 401,
        message: "Unauthorized",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics/reconcile", "POST", {
        meetingId: "meet-1",
        action: "retry",
      });
      const res = await postReconcile(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 if authenticated but not admin/owner", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-1",
        role: "member",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics/reconcile", "POST", {
        meetingId: "meet-1",
        action: "retry",
      });
      const res = await postReconcile(req);

      expect(res.status).toBe(403);
    });

    it("returns 400 if action is missing or invalid", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-admin",
        role: "admin",
      } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics/reconcile", "POST", {
        meetingId: "meet-1",
        action: "invalid-action",
      });
      const res = await postReconcile(req);

      expect(res.status).toBe(400);
    });

    it("returns 404 if meeting is not found", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-admin",
        role: "admin",
      } as any);

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce(null);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics/reconcile", "POST", {
        meetingId: "meet-missing",
        action: "retry",
      });
      const res = await postReconcile(req);

      expect(res.status).toBe(404);
    });

    it("successfully runs retry for meeting, creates audit trail, and returns 200", async () => {
      vi.mocked(requireMessagingApiContext).mockResolvedValueOnce({
        orgId: "org-1",
        userId: "user-admin",
        role: "admin",
      } as any);

      vi.mocked(db.conversationMeeting.findFirst).mockResolvedValueOnce({
        id: "meet-1",
        title: "Test Sync Meeting",
        conversationId: "conv-1",
      } as any);

      vi.mocked(syncMeetingToProvider).mockResolvedValueOnce({ id: "meet-1" } as any);

      const req = makeRequest("http://localhost/api/messaging/admin/calendar-diagnostics/reconcile", "POST", {
        meetingId: "meet-1",
        action: "retry",
      });
      const res = await postReconcile(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(syncMeetingToProvider).toHaveBeenCalledWith("org-1", "meet-1");
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "ADMIN_SUPPORT_ACTION",
            meetingId: "meet-1",
          }),
        }),
      );
    });
  });
});
