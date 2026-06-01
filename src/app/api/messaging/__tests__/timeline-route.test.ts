import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    conversation: {
      findFirst: vi.fn(),
    },
    messagingTask: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/api/messaging/_utils", () => ({
  requireMessagingApiContext: vi.fn(),
  handleMessagingApiError: vi.fn((err: unknown) => {
    if (err instanceof Error) {
      if (err.message === "Unauthorized") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { "content-type": "application/json" } });
  }),
}));

vi.mock("@/lib/messaging/read-models", () => ({
  getTaskActivityTimeline: vi.fn(),
}));

import { GET } from "../conversations/[id]/tasks/[taskId]/timeline/route";
import { db } from "@/lib/db";
import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { getTaskActivityTimeline } from "@/lib/messaging/read-models";

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

function captureResponse(response: Response): { status: number; json: () => Promise<any> } {
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireMessagingApiContext as any).mockResolvedValue({
    userId: "user-1",
    orgId: "org-1",
    role: "member",
  });
  (db.conversation.findFirst as any).mockResolvedValue({ id: "conv-1" });
  (db.messagingTask.findUnique as any).mockResolvedValue({
    orgId: "org-1",
    conversationId: "conv-1",
  });
});

describe("GET /api/messaging/conversations/[id]/tasks/[taskId]/timeline", () => {
  function callGet(overrides: Record<string, string> = {}) {
    const params = Promise.resolve({
      id: overrides.conversationId ?? "conv-1",
      taskId: overrides.taskId ?? "task-1",
    });
    return GET(makeRequest("http://localhost/api/messaging/conversations/conv-1/tasks/task-1/timeline"), { params } as any);
  }

  it("returns timeline for an allowed participant with correct conversation/task pair", async () => {
    (getTaskActivityTimeline as any).mockResolvedValue([
      {
        action: "TASK_CREATED",
        label: "Created task",
        summary: "Task created",
        actorId: "user-1",
        createdAt: new Date("2026-05-15T10:00:00Z"),
        metadata: null,
        eventType: "task_created",
      },
    ]);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.timeline).toHaveLength(1);
    expect(body.timeline[0].eventType).toBe("task_created");
    expect(typeof body.timeline[0].createdAt).toBe("string");
  });

  it("returns 404 when task does not belong to the route conversation", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      orgId: "org-1",
      conversationId: "conv-other",
    });

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(getTaskActivityTimeline).not.toHaveBeenCalled();
  });

  it("returns 404 when task does not exist", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(null);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(getTaskActivityTimeline).not.toHaveBeenCalled();
  });

  it("returns 404 for non-member (no metadata leakage)", async () => {
    (getTaskActivityTimeline as any).mockResolvedValue(null);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for non-existent conversation in org", async () => {
    (db.conversation.findFirst as any).mockResolvedValue(null);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(getTaskActivityTimeline).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    (requireMessagingApiContext as any).mockRejectedValue(new Error("Unauthorized"));

    const response = await callGet();

    expect(response.status).toBe(401);
  });

  it("returns 404 for cross-org task (task.orgId does not match auth)", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      orgId: "org-other",
      conversationId: "conv-1",
    });

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(getTaskActivityTimeline).not.toHaveBeenCalled();
  });

  it("scopes to correct org from auth context", async () => {
    (getTaskActivityTimeline as any).mockResolvedValue([]);

    await callGet();

    expect(getTaskActivityTimeline).toHaveBeenCalledWith("org-1", "task-1", "user-1");
  });
});
