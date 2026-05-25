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
    // 1. Mock active conversations
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
      { conversationId: "conv-2" },
    ]);

    // 2. Mock database tasks returned
    (db.messagingTask.findMany as any).mockResolvedValue([
      mockTaskRecord({ id: "task-1", conversationId: "conv-1" }),
      mockTaskRecord({ id: "task-2", conversationId: "conv-2" }),
    ]);

    const tasks = await listAllTasksForUser("org-1", "user-1");

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
    });

    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe("task-1");
    expect(tasks[1].id).toBe("task-2");
  });

  it("listAllTasksForUser returns empty list if user has no active conversations", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([]);

    const tasks = await listAllTasksForUser("org-1", "user-1");

    expect(tasks).toHaveLength(0);
    expect(db.messagingTask.findMany).not.toHaveBeenCalled();
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

    const summaries = await getOrgTaskSummaries("org-1", "user-1");

    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    expect(s.id).toBe("task-1");
    expect(s.assigneeName).toBe("Alice Green");
    expect(s.assigneeAvatarInitials).toBe("AG");
    expect(s.createdByName).toBe("Bob Builder");
    expect(s.conversationName).toBe("engineering");
    expect(s.conversationType).toBe("CHANNEL");
  });
});
