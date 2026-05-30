import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    conversationParticipant: {
      findMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
    },
  };
  return { db };
});

import { db } from "@/lib/db";
import { listAllTasksForUser } from "../task-service";
import { getOrgTaskSummaries } from "../read-models";

describe("Sprint 6.4 Service layer — Global Tasks Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockTaskRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      description: "Task Description",
      status: "OPEN",
      priority: 1,
      assigneeId: "user-assignee",
      dueDate: new Date("2026-06-01T00:00:00Z"),
      createdBy: "user-creator",
      createdAt: new Date("2026-05-25T12:00:00Z"),
      updatedAt: new Date("2026-05-25T12:00:00Z"),
      completedAt: null,
      completedBy: null,
      ...overrides,
    };
  }

  it("listAllTasksForUser retrieves tasks for user's active conversations", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
      { conversationId: "conv-2" },
    ]);

    (db.messagingTask.findMany as any).mockResolvedValue([
      mockTaskRecord({ id: "task-1", conversationId: "conv-1" }),
      mockTaskRecord({ id: "task-2", conversationId: "conv-2" }),
    ]);

    const result = await listAllTasksForUser({ orgId: "org-1", userId: "user-1" });

    expect(db.conversationParticipant.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        userId: "user-1",
        leftAt: null,
      },
      select: {
        conversationId: true,
      },
    });

    expect(db.messagingTask.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        conversationId: { in: ["conv-1", "conv-2"] },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 21,
      skip: 0,
      cursor: undefined,
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe("task-1");
    expect(result.tasks[1].id).toBe("task-2");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("listAllTasksForUser returns empty list if user has no active conversations", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([]);

    const result = await listAllTasksForUser({ orgId: "org-1", userId: "user-1" });

    expect(result.tasks).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(db.messagingTask.findMany).not.toHaveBeenCalled();
  });

  it("listAllTasksForUser returns paginated results with hasMore", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);

    // Return 3 tasks when requesting limit=2
    const tasks = Array.from({ length: 3 }, (_, i) =>
      mockTaskRecord({ id: `task-${i + 1}` }),
    );
    (db.messagingTask.findMany as any).mockResolvedValue(tasks);

    const result = await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      limit: 2,
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("task-2");
  });

  it("getOrgTaskSummaries enriches tasks with profiles and conversation details", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);

    (db.messagingTask.findMany as any).mockResolvedValue([
      mockTaskRecord({ id: "task-1", conversationId: "conv-1" }),
    ]);

    (db.profile.findMany as any).mockResolvedValue([
      { id: "user-assignee", name: "Alice Green" },
      { id: "user-creator", name: "Bob Builder" },
    ]);

    (db.conversation.findMany as any).mockResolvedValue([
      { id: "conv-1", type: "CHANNEL", name: "engineering" },
    ]);

    const result = await getOrgTaskSummaries("org-1", "user-1");

    expect(result.tasks).toHaveLength(1);
    const s = result.tasks[0];
    expect(s.id).toBe("task-1");
    expect(s.assigneeName).toBe("Alice Green");
    expect(s.assigneeAvatarInitials).toBe("AG");
    expect(s.createdByName).toBe("Bob Builder");
    expect(s.conversationName).toBe("engineering");
    expect(s.conversationType).toBe("CHANNEL");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });
});
