import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    messagingTask: {
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    messagingAuditEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: unknown) => {
      if (typeof cb === "function") {
        return (cb as (tx: typeof db) => Promise<unknown>)(db);
      }
      return Promise.resolve();
    }),
  };
  return { db };
});

vi.mock("@/lib/messaging/audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
  logMessagingAuditTx: vi.fn().mockResolvedValue(undefined),
  getMessagingAuditActionLabel: vi.fn((action: string) => {
    const labels: Record<string, string> = {
      TASK_CREATED: "Created task",
      TASK_UPDATED: "Updated task",
      TASK_ASSIGNED: "Assigned task",
      TASK_COMPLETED: "Completed task",
      ADMIN_SUPPORT_ACTION: "Performed admin support action",
    };
    return labels[action] ?? action;
  }),
  normalizeAuditMetadata: vi.fn((m: unknown) => m as Record<string, unknown> | null),
  MESSAGING_AUDIT_ACTION_LABELS: {},
}));

vi.mock("@/lib/messaging/authorization", () => ({
  requireConversationAccess: vi.fn(),
  evaluateConversationAccess: vi.fn(() => ({ allowed: true, reason: "access granted" })),
}));

vi.mock("@/lib/messaging/conversation-service", () => ({
  getConversationById: vi.fn(),
  listConversationsForUser: vi.fn(),
}));

vi.mock("@/lib/messaging/message-service", () => ({
  getMessageById: vi.fn(),
}));

vi.mock("@/lib/messaging/reaction-service", () => ({
  listReactionsForMessage: vi.fn(),
}));

vi.mock("@/lib/messaging/mention-readstate-service", () => ({
  getReadState: vi.fn(),
}));

vi.mock("@/lib/messaging/mappers", () => ({
  toConversationRecord: vi.fn((r: unknown) => r),
  toParticipantRecord: vi.fn((r: unknown) => r),
  toMessageRecord: vi.fn((r: unknown) => r),
  toThreadRecord: vi.fn((r: unknown) => r),
  toReadStateRecord: vi.fn((r: unknown) => r),
  toTaskRecord: vi.fn((r: unknown) => r),
}));

vi.mock("@/lib/messaging/read-shapes", () => ({
  toConversationSummary: vi.fn(() => ({})),
  toConversationDetail: vi.fn(() => ({})),
  toMessageDetail: vi.fn(() => ({})),
  toTaskSummary: vi.fn(({ record }: any) => ({
    id: record.id,
    orgId: record.orgId,
    conversationId: record.conversationId,
    title: record.title,
    status: record.status,
    priority: "low",
    isOverdue: false,
    assigneeId: record.assigneeId,
    dueDate: record.dueDate?.toISOString() ?? null,
    reminderAt: record.reminderAt?.toISOString() ?? null,
    reminderSentAt: record.reminderSentAt?.toISOString() ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    assigneeName: null,
    assigneeAvatarInitials: null,
    createdByName: null,
  })),
  type: {},
}));

vi.mock("@/lib/messaging/org-safe-helpers", () => ({
  conversationOrgSafeWhere: vi.fn((orgId: string, conversationId: string) => ({ orgId, conversationId })),
  participantOrgSafeWhere: vi.fn((orgId: string, conversationId: string, userId: string) => ({ orgId, conversationId, userId })),
}));

vi.mock("@/lib/messaging/task-service", () => ({
  listTasksForConversation: vi.fn(),
  listAllTasksForUser: vi.fn(),
}));

vi.mock("@/lib/messaging/service-contracts", () => ({
  isValidTaskListScope: vi.fn(),
}));

import { db } from "@/lib/db";
import {
  getTaskActivityTimeline,
  getTaskHealthDiagnostics,
  mapToTimelineEvent,
  type TaskHealthDiagnostics,
  type TimelineEvent,
} from "../read-models";
import type { MessagingAuditAction } from "../domain-types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTimelineRawEvent(overrides: Partial<{
  action: MessagingAuditAction;
  summary: string;
  actorId: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}> = {}) {
  return {
    action: "TASK_UPDATED" as MessagingAuditAction,
    summary: "Task was updated",
    actorId: "user-1",
    createdAt: new Date("2026-05-15T10:00:00Z"),
    metadata: null,
    ...overrides,
  };
}

function makeActiveParticipant(userId = "user-1") {
  return {
    id: "membership-1",
    orgId: "org-1",
    conversationId: "conv-1",
    userId,
    role: "MEMBER",
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    title: "Test Task",
    description: null,
    status: "OPEN",
    priority: 0,
    assigneeId: "user-assignee",
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

// ─── Blocker 1: Permission-gated timeline ────────────────────────────────────

describe("Sprint 7.4 — Blocker 1: Permission-gated timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns timeline events for an active participant", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(makeTask());
    (db.conversationParticipant.findFirst as any).mockResolvedValue(makeActiveParticipant());
    (db.messagingAuditEvent.findMany as any).mockResolvedValue([
      makeTimelineRawEvent({ action: "TASK_CREATED", summary: "Task created: Test Task" }),
      makeTimelineRawEvent({
        action: "TASK_COMPLETED",
        summary: "Task completed: Test Task",
        metadata: { previousStatus: "OPEN", newStatus: "DONE" },
      }),
    ]);

    const result = await getTaskActivityTimeline("org-1", "task-1", "user-1");

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0].eventType).toBe("task_created");
    expect(result![1].eventType).toBe("task_completed");
  });

  it("returns null for non-member (no metadata leakage)", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(makeTask());
    (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

    const result = await getTaskActivityTimeline("org-1", "task-1", "user-stranger");

    expect(result).toBeNull();
    expect(db.messagingAuditEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns null for non-existent task (no leakage)", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(null);

    const result = await getTaskActivityTimeline("org-1", "task-nonexistent", "user-1");

    expect(result).toBeNull();
    expect(db.conversationParticipant.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for revoked access (leftAt not null)", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(makeTask());
    (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

    const result = await getTaskActivityTimeline("org-1", "task-1", "user-left");

    expect(result).toBeNull();
  });

  it("enforces org scoping — different org returns null", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(null);

    const result = await getTaskActivityTimeline("org-other", "task-1", "user-1");

    expect(result).toBeNull();
  });
});

// ─── Blocker 1: Permission-gated diagnostics ────────────────────────────────

describe("Sprint 7.4 — Blocker 1: Permission-gated diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns diagnostics for org admin", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([
      { status: "OPEN", _count: { _all: 5 } },
      { status: "DONE", _count: { _all: 10 } },
    ]);
    (db.messagingTask.count as any)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(result).not.toBeNull();
    expect(result!.statusCounts).toEqual({ OPEN: 5, DONE: 10 });
    expect(result!.overdueCount).toBe(3);
    expect(result!.reminderDispatchedCount).toBe(7);
    expect(result!.reminderPendingCount).toBe(2);
  });

  it("returns diagnostics for org owner", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "owner" });
    (db.messagingTask.groupBy as any).mockResolvedValue([]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-owner");

    expect(result).not.toBeNull();
  });

  it("returns null for ordinary member (no leakage)", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "member" });

    const result = await getTaskHealthDiagnostics("org-1", "user-member");

    expect(result).toBeNull();
    expect(db.messagingTask.groupBy).not.toHaveBeenCalled();
  });

  it("returns null for user not in org (no leakage)", async () => {
    (db.member.findFirst as any).mockResolvedValue(null);

    const result = await getTaskHealthDiagnostics("org-1", "user-stranger");

    expect(result).toBeNull();
  });

  it("no cross-org leakage — admin of org-1 cannot see org-2 data", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([
      { status: "OPEN", _count: { _all: 5 } },
    ]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(result).not.toBeNull();
    const groupByCall = (db.messagingTask.groupBy as any).mock.calls[0][0];
    expect(groupByCall.where.orgId).toBe("org-1");
  });

  it("empty org returns zeroed results", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(result).toEqual({
      statusCounts: {},
      overdueCount: 0,
      reminderDispatchedCount: 0,
      reminderPendingCount: 0,
    });
  });
});

// ─── Blocker 3: Timeline event type mapping ─────────────────────────────────

describe("Sprint 7.4 — Blocker 3: Timeline event type mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("task_created maps correctly", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({ action: "TASK_CREATED" }));
    expect(event.eventType).toBe("task_created");
    expect(event.label).toBe("Created task");
  });

  it("task_completed maps correctly", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({ action: "TASK_COMPLETED" }));
    expect(event.eventType).toBe("task_completed");
    expect(event.label).toBe("Completed task");
  });

  it("task_assigned maps correctly", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({ action: "TASK_ASSIGNED" }));
    expect(event.eventType).toBe("task_assigned");
    expect(event.label).toBe("Assigned task");
  });

  it("task_cancelled maps from TASK_UPDATED with newStatus=CANCELLED", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { previousStatus: "OPEN", newStatus: "CANCELLED" },
    }));
    expect(event.eventType).toBe("task_cancelled");
  });

  it("task_reopened maps from TASK_UPDATED with previousStatus=DONE", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { previousStatus: "DONE", newStatus: "OPEN" },
    }));
    expect(event.eventType).toBe("task_reopened");
  });

  it("task_assigned maps from TASK_UPDATED with newAssigneeId", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { previousAssigneeId: null, newAssigneeId: "user-new" },
    }));
    expect(event.eventType).toBe("task_assigned");
  });

  it("task_assignee_cleared maps from TASK_UPDATED with newAssigneeId=null", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { previousAssigneeId: "user-old", newAssigneeId: null },
    }));
    expect(event.eventType).toBe("task_assignee_cleared");
  });

  it("task_reminder_sent maps from TASK_UPDATED with reminderType=scheduled", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { reminderType: "scheduled", assigneeId: "user-assignee" },
    }));
    expect(event.eventType).toBe("task_reminder_sent");
  });

  it("task_due_date_changed maps from TASK_UPDATED with updatedFields containing dueDate", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { updatedFields: ["dueDate"] },
    }));
    expect(event.eventType).toBe("task_due_date_changed");
  });

  it("task_reminder_changed maps from TASK_UPDATED with updatedFields containing reminderAt", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { updatedFields: ["reminderAt"] },
    }));
    expect(event.eventType).toBe("task_reminder_changed");
  });

  it("generic task_updated for unspecific TASK_UPDATED", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: { updatedFields: ["description"] },
    }));
    expect(event.eventType).toBe("task_updated");
  });

  it("sparse older audit history degrades safely (null metadata)", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: null,
    }));
    expect(event.eventType).toBe("task_updated");
  });

  it("sparse older audit history with empty metadata degrades safely", () => {
    const event = mapToTimelineEvent(makeTimelineRawEvent({
      action: "TASK_UPDATED",
      metadata: {},
    }));
    expect(event.eventType).toBe("task_updated");
  });
});

// ─── Blocker 4: Diagnostics statusCounts correctness ────────────────────────

describe("Sprint 7.4 — Blocker 4: Diagnostics statusCounts correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns numeric counts by status (no ts-ignore, uses _count._all)", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([
      { status: "OPEN", _count: { _all: 5 } },
      { status: "IN_PROGRESS", _count: { _all: 3 } },
      { status: "DONE", _count: { _all: 10 } },
      { status: "CANCELLED", _count: { _all: 2 } },
    ]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(result!.statusCounts).toEqual({
      OPEN: 5,
      IN_PROGRESS: 3,
      DONE: 10,
      CANCELLED: 2,
    });
    for (const count of Object.values(result!.statusCounts)) {
      expect(typeof count).toBe("number");
    }
  });

  it("overdue, reminder counts are numeric", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([]);
    (db.messagingTask.count as any)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(typeof result!.overdueCount).toBe("number");
    expect(typeof result!.reminderDispatchedCount).toBe("number");
    expect(typeof result!.reminderPendingCount).toBe("number");
    expect(result!.overdueCount).toBe(3);
    expect(result!.reminderDispatchedCount).toBe(7);
    expect(result!.reminderPendingCount).toBe(2);
  });

  it("diagnostics result is properly typed at return boundary", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    const diagnostics: TaskHealthDiagnostics = result!;
    expect(diagnostics.statusCounts).toBeDefined();
    expect(typeof diagnostics.overdueCount).toBe("number");
    expect(typeof diagnostics.reminderDispatchedCount).toBe("number");
    expect(typeof diagnostics.reminderPendingCount).toBe("number");
  });
});

// ─── Blocker 5: Reminder sweep operational signals ──────────────────────────

describe("Sprint 7.4 — Blocker 5: Reminder sweep operational signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-mock audit module to pick up vi.clearAllMocks
    (db.messagingTask.findMany as any).mockResolvedValue([]);
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 0 });
  });

  it("sweep emits structured started signal", async () => {
    const { dispatchDueTaskReminders } = await import("../task-reminders");

    await dispatchDueTaskReminders();

    const { logMessagingAudit } = await import("../audit");
    const sweepStartedCalls = (logMessagingAudit as any).mock.calls.filter(
      (c: any[]) => c[0]?.action === "ADMIN_SUPPORT_ACTION" && c[0]?.summary === "Reminder sweep started"
    );
    expect(sweepStartedCalls.length).toBe(1);
    expect(sweepStartedCalls[0][0].metadata.sweepType).toBe("task_reminder");
    expect(sweepStartedCalls[0][0].actorId).toBe("__sweep__");
  });

  it("sweep emits structured completed signal with counts", async () => {
    const { dispatchDueTaskReminders } = await import("../task-reminders");

    await dispatchDueTaskReminders();

    const { logMessagingAudit } = await import("../audit");
    const sweepCompletedCalls = (logMessagingAudit as any).mock.calls.filter(
      (c: any[]) => c[0]?.action === "ADMIN_SUPPORT_ACTION" && c[0]?.summary?.startsWith("Reminder sweep completed")
    );
    expect(sweepCompletedCalls.length).toBe(1);
    expect(sweepCompletedCalls[0][0].metadata.evaluated).toBe(0);
  });

  it("sweep with candidates emits dispatched/failed counts in completed signal", async () => {
    const candidate = {
      id: "task-1", orgId: "org-1", conversationId: "conv-1",
      title: "Test", description: null, status: "OPEN", priority: 0,
      assigneeId: "user-assignee", dueDate: null,
      reminderAt: new Date("2026-01-01"), reminderSentAt: null,
      completedAt: null, completedBy: null, createdBy: "user-1",
      createdAt: new Date(), updatedAt: new Date(),
    };

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue({
      id: "membership-1", orgId: "org-1", conversationId: "conv-1",
      userId: "user-assignee", role: "MEMBER", leftAt: null,
      mutedUntil: null, displayName: null, isPinned: false,
      joinedAt: new Date(), updatedAt: new Date(),
    });
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({ ...candidate, reminderSentAt: new Date() });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const { dispatchDueTaskReminders } = await import("../task-reminders");

    await dispatchDueTaskReminders(10);

    const { logMessagingAudit } = await import("../audit");
    const sweepCompletedCalls = (logMessagingAudit as any).mock.calls.filter(
      (c: any[]) => c[0]?.action === "ADMIN_SUPPORT_ACTION" && c[0]?.summary === "Reminder sweep completed"
    );
    expect(sweepCompletedCalls.length).toBe(1);
    expect(sweepCompletedCalls[0][0].metadata.dispatched).toBe(1);
    expect(sweepCompletedCalls[0][0].metadata.evaluated).toBe(1);
  });

  it("sweep emits structured completed with skippedIneligibleAssignee count", async () => {
    const candidate = {
      id: "task-1", orgId: "org-1", conversationId: "conv-1",
      title: "Test", description: null, status: "OPEN", priority: 0,
      assigneeId: "user-left", dueDate: null,
      reminderAt: new Date("2026-01-01"), reminderSentAt: null,
      completedAt: null, completedBy: null, createdBy: "user-1",
      createdAt: new Date(), updatedAt: new Date(),
    };

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

    const { dispatchDueTaskReminders } = await import("../task-reminders");

    await dispatchDueTaskReminders(10);

    const { logMessagingAudit } = await import("../audit");
    const sweepCompletedCalls = (logMessagingAudit as any).mock.calls.filter(
      (c: any[]) => c[0]?.action === "ADMIN_SUPPORT_ACTION" && c[0]?.summary === "Reminder sweep completed"
    );
    expect(sweepCompletedCalls.length).toBe(1);
    expect(sweepCompletedCalls[0][0].metadata.skippedIneligibleAssignee).toBe(1);
  });

  it("no sensitive payload in sweep signals", async () => {
    const { dispatchDueTaskReminders } = await import("../task-reminders");

    await dispatchDueTaskReminders();

    const { logMessagingAudit } = await import("../audit");
    for (const call of (logMessagingAudit as any).mock.calls) {
      const params = call[0];
      if (params.action === "ADMIN_SUPPORT_ACTION") {
        const serialized = JSON.stringify(params);
        expect(serialized).not.toContain("token");
        expect(serialized).not.toContain("secret");
        expect(serialized).not.toContain("password");
        expect(serialized).not.toContain("body");
        expect(serialized).not.toContain("content");
      }
    }
  });
});

// ─── Regression: existing Sprint 7.1/7.2/7.3 behavior ──────────────────────

describe("Sprint 7.4 — Regression: existing behavior preserved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("timeline does not block when task has no conversation (edge case)", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(null);

    const result = await getTaskActivityTimeline("org-1", "nonexistent-task", "user-1");

    expect(result).toBeNull();
  });

  it("diagnostics returns deterministic shape for all statuses", async () => {
    (db.member.findFirst as any).mockResolvedValue({ role: "admin" });
    (db.messagingTask.groupBy as any).mockResolvedValue([
      { status: "OPEN", _count: { _all: 1 } },
      { status: "IN_PROGRESS", _count: { _all: 2 } },
      { status: "OVERDUE", _count: { _all: 3 } },
      { status: "DONE", _count: { _all: 4 } },
      { status: "CANCELLED", _count: { _all: 5 } },
    ]);
    (db.messagingTask.count as any).mockResolvedValue(0);

    const result = await getTaskHealthDiagnostics("org-1", "user-admin");

    expect(result!.statusCounts).toEqual({
      OPEN: 1, IN_PROGRESS: 2, OVERDUE: 3, DONE: 4, CANCELLED: 5,
    });
  });
});
