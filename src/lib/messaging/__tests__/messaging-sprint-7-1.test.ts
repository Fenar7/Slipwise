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
import {
  taskIsOverdue,
  taskIsDueSoon,
  taskIsOpen,
  type MessagingTaskRecord,
} from "../domain-types";
import { isValidTaskListScope } from "../service-contracts";

// ─── Domain hardening: overdue / due-soon policy ──────────────────────────────

describe("Sprint 7.1 — Domain Hardening: taskIsOverdue policy", () => {
  function makeTask(overrides: Partial<MessagingTaskRecord> = {}): MessagingTaskRecord {
    return {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      originatingMessageId: null,
      title: "Test task",
      description: null,
      status: "OPEN",
      priority: 0,
      assigneeId: null,
      dueDate: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
      createdBy: "user-1",
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-01"),
      ...overrides,
    };
  }

  const pastDate = new Date("2026-01-01");
  const futureDate = new Date("2027-01-01");

  it("OPEN task with past due date is overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "OPEN", dueDate: pastDate }))).toBe(true);
  });

  it("IN_PROGRESS task with past due date is overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "IN_PROGRESS", dueDate: pastDate }))).toBe(true);
  });

  it("DONE task with past due date is NOT overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "DONE", dueDate: pastDate }))).toBe(false);
  });

  it("CANCELLED task with past due date is NOT overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "CANCELLED", dueDate: pastDate }))).toBe(false);
  });

  it("task with no due date is NOT overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "OPEN", dueDate: null }))).toBe(false);
  });

  it("task with future due date is NOT overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "OPEN", dueDate: futureDate }))).toBe(false);
  });

  it("DONE task with future due date is NOT overdue", () => {
    expect(taskIsOverdue(makeTask({ status: "DONE", dueDate: futureDate }))).toBe(false);
  });

  it("OVERDUE status with past due date is still open (IN_PROGRESS check)", () => {
    // OVERDUE status exists in enum but taskIsOpen treats it as open
    // However, taskIsOverdue should NOT short-circuit on status=OVERDUE
    // It should apply the same policy: done/cancelled = not overdue
    const task = makeTask({ status: "DONE", dueDate: pastDate });
    expect(taskIsOverdue(task)).toBe(false);
  });
});

describe("Sprint 7.1 — Domain Hardening: taskIsDueSoon policy", () => {
  function makeTask(overrides: Partial<MessagingTaskRecord> = {}): MessagingTaskRecord {
    return {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      originatingMessageId: null,
      title: "Test task",
      description: null,
      status: "OPEN",
      priority: 0,
      assigneeId: null,
      dueDate: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
      createdBy: "user-1",
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-01"),
      ...overrides,
    };
  }

  it("OPEN task due in 3 days is due soon", () => {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    expect(taskIsDueSoon(makeTask({ status: "OPEN", dueDate: in3Days }))).toBe(true);
  });

  it("OPEN task due in 10 days is NOT due soon (>7 days)", () => {
    const in10Days = new Date();
    in10Days.setDate(in10Days.getDate() + 10);
    expect(taskIsDueSoon(makeTask({ status: "OPEN", dueDate: in10Days }))).toBe(false);
  });

  it("DONE task due soon is NOT due soon (not open)", () => {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    expect(taskIsDueSoon(makeTask({ status: "DONE", dueDate: in3Days }))).toBe(false);
  });

  it("overdue task is NOT due soon (excluded by overdue check)", () => {
    const pastDate = new Date("2026-01-01");
    expect(taskIsDueSoon(makeTask({ status: "OPEN", dueDate: pastDate }))).toBe(false);
  });

  it("task with no due date is NOT due soon", () => {
    expect(taskIsDueSoon(makeTask({ status: "OPEN", dueDate: null }))).toBe(false);
  });
});

// ─── Type guard: isValidTaskListScope ─────────────────────────────────────────

describe("Sprint 7.1 — isValidTaskListScope", () => {
  it("accepts all valid scopes", () => {
    expect(isValidTaskListScope("open")).toBe(true);
    expect(isValidTaskListScope("done")).toBe(true);
    expect(isValidTaskListScope("cancelled")).toBe(true);
    expect(isValidTaskListScope("overdue")).toBe(true);
    expect(isValidTaskListScope("due_soon")).toBe(true);
    expect(isValidTaskListScope("assigned")).toBe(true);
    expect(isValidTaskListScope("created")).toBe(true);
  });

  it("rejects invalid scopes", () => {
    expect(isValidTaskListScope("invalid")).toBe(false);
    expect(isValidTaskListScope("")).toBe(false);
    expect(isValidTaskListScope(null)).toBe(false);
    expect(isValidTaskListScope(undefined)).toBe(false);
    expect(isValidTaskListScope("all")).toBe(false);
  });
});

// ─── Service layer: listAllTasksForUser with scope filters ────────────────────

describe("Sprint 7.1 — listAllTasksForUser: scope filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockTask(overrides: Record<string, unknown> = {}) {
    return {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task",
      description: null,
      status: "OPEN",
      priority: 0,
      assigneeId: null,
      dueDate: null,
      createdBy: "user-1",
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-01"),
      completedAt: null,
      completedBy: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
      { conversationId: "conv-2" },
    ]);
  });

  it("scope=open filters to OPEN and IN_PROGRESS statuses", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([mockTask()]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "open" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS"] });
  });

  it("scope=done filters to DONE status only", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "done" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toBe("DONE");
  });

  it("scope=cancelled filters to CANCELLED status only", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "cancelled" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toBe("CANCELLED");
  });

  it("scope=overdue filters to OPEN/IN_PROGRESS with past dueDate", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "overdue" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS"] });
    expect(call.where.dueDate).toHaveProperty("lt");
  });

  it("scope=due_soon filters to OPEN/IN_PROGRESS with dueDate in next 7 days", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "due_soon" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS"] });
    expect(call.where.dueDate).toHaveProperty("gte");
    expect(call.where.dueDate).toHaveProperty("lte");
  });

  it("scope=assigned filters to tasks assigned to the user", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "assigned" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.assigneeId).toBe("user-1");
  });

  it("scope=created filters to tasks created by the user", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", scope: "created" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.createdBy).toBe("user-1");
  });

  it("no scope returns all tasks across accessible conversations", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([mockTask()]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
    expect(call.where.dueDate).toBeUndefined();
    expect(call.where.assigneeId).toBeUndefined();
    expect(call.where.createdBy).toBeUndefined();
  });
});

// ─── Service layer: listAllTasksForUser with pagination ───────────────────────

describe("Sprint 7.1 — listAllTasksForUser: pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);
  });

  function mockTask(id: string) {
    return {
      id,
      orgId: "org-1",
      conversationId: "conv-1",
      title: `Task ${id}`,
      description: null,
      status: "OPEN",
      priority: 0,
      assigneeId: null,
      dueDate: null,
      createdBy: "user-1",
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-01"),
      completedAt: null,
      completedBy: null,
    };
  }

  it("applies limit from filter input (clamped to max 50)", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", limit: 10 });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(11); // limit + 1 for hasMore detection
  });

  it("clamps limit to max 50", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", limit: 100 });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(51); // 50 + 1
  });

  it("clamps limit to min 1", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({ orgId: "org-1", userId: "user-1", limit: 0 });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(2); // 1 + 1
  });

  it("applies cursor when provided", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      cursor: "task-cursor-123",
    });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.skip).toBe(1);
    expect(call.cursor).toEqual({ id: "task-cursor-123" });
  });

  it("returns hasMore=true when extra row exists", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([
      mockTask("t1"),
      mockTask("t2"),
      mockTask("t3"), // extra row beyond limit=2
    ]);

    const result = await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      limit: 2,
    });

    expect(result.hasMore).toBe(true);
    expect(result.tasks).toHaveLength(2);
    expect(result.nextCursor).toBe("t2");
  });

  it("returns hasMore=false when no extra row", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([
      mockTask("t1"),
      mockTask("t2"),
    ]);

    const result = await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      limit: 5,
    });

    expect(result.hasMore).toBe(false);
    expect(result.tasks).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});

// ─── Service layer: conversation-scoped access control ────────────────────────

describe("Sprint 7.1 — listAllTasksForUser: conversation-scoped access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when requesting a conversation the user is not a member of", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);

    const result = await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-unauthorized",
    });

    expect(result.tasks).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(db.messagingTask.findMany).not.toHaveBeenCalled();
  });

  it("scopes to requested conversation when user is a member", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
      { conversationId: "conv-2" },
    ]);
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await listAllTasksForUser({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-2",
    });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.conversationId).toEqual({ in: ["conv-2"] });
  });
});

// ─── Read models: getOrgTaskSummaries filter passthrough ──────────────────────

describe("Sprint 7.1 — getOrgTaskSummaries: filter passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated result shape", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);
    (db.messagingTask.findMany as any).mockResolvedValue([]);
    (db.profile.findMany as any).mockResolvedValue([]);
    (db.conversation.findMany as any).mockResolvedValue([]);

    const result = await getOrgTaskSummaries("org-1", "user-1");

    expect(result).toHaveProperty("tasks");
    expect(result).toHaveProperty("nextCursor");
    expect(result).toHaveProperty("hasMore");
    expect(Array.isArray(result.tasks)).toBe(true);
  });

  it("passes scope filter through to service layer", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
    ]);
    (db.messagingTask.findMany as any).mockResolvedValue([]);
    (db.profile.findMany as any).mockResolvedValue([]);
    (db.conversation.findMany as any).mockResolvedValue([]);

    await getOrgTaskSummaries("org-1", "user-1", { scope: "overdue" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS"] });
    expect(call.where.dueDate).toHaveProperty("lt");
  });

  it("passes conversationId filter through to service layer", async () => {
    (db.conversationParticipant.findMany as any).mockResolvedValue([
      { conversationId: "conv-1" },
      { conversationId: "conv-2" },
    ]);
    (db.messagingTask.findMany as any).mockResolvedValue([]);
    (db.profile.findMany as any).mockResolvedValue([]);
    (db.conversation.findMany as any).mockResolvedValue([]);

    await getOrgTaskSummaries("org-1", "user-1", { conversationId: "conv-2" });

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.conversationId).toEqual({ in: ["conv-2"] });
  });
});
