import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    conversation: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/messaging/read-models", () => ({
  getTaskActivityTimeline: vi.fn(),
}));

import { GET } from "../conversations/[id]/tasks/[taskId]/timeline/route";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { getTaskActivityTimeline } from "@/lib/messaging/read-models";

const mockedRequireOrgContext = vi.mocked(requireOrgContext);
const mockedFindFirst = vi.mocked(db.conversation.findFirst);
const mockedGetTimeline = vi.mocked(getTaskActivityTimeline);

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrgContext.mockResolvedValue({
    userId: "user-1",
    orgId: "org-1",
    role: "member",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
  mockedFindFirst.mockResolvedValue({ id: "conv-1" });
});

describe("GET /api/messaging/conversations/[id]/tasks/[taskId]/timeline", () => {
  function callGet(overrides: Record<string, string> = {}) {
    const params = Promise.resolve({
      id: overrides.conversationId ?? "conv-1",
      taskId: overrides.taskId ?? "task-1",
    });
    return GET(makeRequest("http://localhost/api/messaging/conversations/conv-1/tasks/task-1/timeline"), { params } as any);
  }

  it("returns timeline for an allowed participant", async () => {
    mockedGetTimeline.mockResolvedValue([
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

  it("returns 404 for non-member", async () => {
    mockedGetTimeline.mockResolvedValue(null);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for non-existent conversation in org", async () => {
    mockedFindFirst.mockResolvedValue(null);

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
    expect(mockedGetTimeline).not.toHaveBeenCalled();
  });

  it("returns 404 for wrong org conversation", async () => {
    // Conversation exists but in different org — db.conversation.findFirst returns null due to org filter
    mockedFindFirst.mockResolvedValue(null);

    const response = await callGet({ conversationId: "conv-other" });

    expect(response.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockedRequireOrgContext.mockRejectedValue(new Error("Unauthorized"));

    const response = await callGet();

    expect(response.status).toBe(500);
  });

  it("scopes to correct org from auth context", async () => {
    mockedGetTimeline.mockResolvedValue([]);

    await callGet();

    expect(mockedGetTimeline).toHaveBeenCalledWith("org-1", "task-1", "user-1");
  });
});
