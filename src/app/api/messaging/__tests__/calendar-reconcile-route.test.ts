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
    let status = 500;
    if (err.name === "InvalidInputError") status = 422;
    if (err.name === "NotFoundError") status = 404;
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? "Error" }),
      {
        status,
        headers: { "content-type": "application/json" },
      }
    );
  });
  return {
    requireMessagingApiContext,
    messagingApiResponse,
    handleMessagingApiError,
  };
});

vi.mock("@/lib/messaging/provider-sync-service", () => ({
  reconcileProviderChangesForMeeting: vi.fn(),
  reconcileProviderChangesForTask: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const mocks = {
    conversationMeeting: {
      findFirst: vi.fn(),
    },
    messagingTask: {
      findFirst: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
    },
  };
  return {
    db: mocks,
  };
});

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { reconcileProviderChangesForMeeting, reconcileProviderChangesForTask } from "@/lib/messaging/provider-sync-service";
import { db } from "@/lib/db";
import { POST as reconcilePost } from "../calendar/reconcile/route";

function makeRequest(url: string, body?: any): NextRequest {
  return new NextRequest(new URL(url), {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Calendar Reconcile API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMessagingApiContext).mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
      role: "member",
    });
  });

  it("returns validation error if neither meetingId nor taskId is provided", async () => {
    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", {});
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Either meetingId or taskId must be provided");
  });

  it("returns validation error if both meetingId and taskId are provided", async () => {
    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", { meetingId: "meet-1", taskId: "task-1" });
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Ambiguous request: cannot provide both meetingId and taskId at once");
  });

  it("successfully reconciles meeting when authorized", async () => {
    const mockMeeting = { id: "meet-1", conversationId: "conv-1" };
    const mockMembership = { id: "membership-1" };
    const mockReconciled = { id: "meet-1", title: "Reconciled Meet" };

    vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(mockMeeting as any);
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(mockMembership as any);
    vi.mocked(reconcileProviderChangesForMeeting).mockResolvedValue(mockReconciled as any);

    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", { meetingId: "meet-1" });
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.reconciled).toEqual(mockReconciled);
    expect(db.conversationMeeting.findFirst).toHaveBeenCalledWith({
      where: { id: "meet-1", orgId: "org-1" },
    });
    expect(db.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: { orgId: "org-1", conversationId: "conv-1", userId: "user-1", leftAt: null },
    });
    expect(reconcileProviderChangesForMeeting).toHaveBeenCalledWith("org-1", "meet-1", "user-1");
  });

  it("returns not found and prevents leakage if user is not in conversation for meeting", async () => {
    const mockMeeting = { id: "meet-1", conversationId: "conv-1" };

    vi.mocked(db.conversationMeeting.findFirst).mockResolvedValue(mockMeeting as any);
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null as any);

    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", { meetingId: "meet-1" });
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Meeting not found");
    expect(reconcileProviderChangesForMeeting).not.toHaveBeenCalled();
  });

  it("successfully reconciles task when authorized", async () => {
    const mockTask = { id: "task-1", conversationId: "conv-1" };
    const mockMembership = { id: "membership-1" };
    const mockReconciled = { id: "task-1", title: "Reconciled Task" };

    vi.mocked(db.messagingTask.findFirst).mockResolvedValue(mockTask as any);
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(mockMembership as any);
    vi.mocked(reconcileProviderChangesForTask).mockResolvedValue(mockReconciled as any);

    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", { taskId: "task-1" });
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.reconciled).toEqual(mockReconciled);
    expect(db.messagingTask.findFirst).toHaveBeenCalledWith({
      where: { id: "task-1", orgId: "org-1" },
    });
    expect(db.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: { orgId: "org-1", conversationId: "conv-1", userId: "user-1", leftAt: null },
    });
    expect(reconcileProviderChangesForTask).toHaveBeenCalledWith("org-1", "task-1", "user-1");
  });

  it("returns not found and prevents leakage if user is not in conversation for task", async () => {
    const mockTask = { id: "task-1", conversationId: "conv-1" };

    vi.mocked(db.messagingTask.findFirst).mockResolvedValue(mockTask as any);
    vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null as any);

    const req = makeRequest("http://localhost/api/messaging/calendar/reconcile", { taskId: "task-1" });
    const response = await reconcilePost(req);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Task not found");
    expect(reconcileProviderChangesForTask).not.toHaveBeenCalled();
  });
});
