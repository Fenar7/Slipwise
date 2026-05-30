import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    messagingTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
    },
    conversationMessage: {
      findUnique: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    jobLog: {
      create: vi.fn(),
    },
  };
  return { db };
});

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

vi.mock("@/lib/messaging/audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logMessagingAudit } from "@/lib/messaging/audit";
import {
  dispatchDueTaskReminders,
  sendTaskAssignmentNotification,
  isReminderEligible,
} from "../task-reminders";
import { assignTask, updateTask, createTask } from "../task-service";
import type { MessagingTaskRecord } from "../domain-types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<MessagingTaskRecord> = {}): MessagingTaskRecord {
  return {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    originatingMessageId: null,
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

function mockActiveParticipant(userId = "user-assignee") {
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

function mockActiveConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    orgId: "org-1",
    type: "CHANNEL",
    name: "engineering",
    description: null,
    visibility: "PUBLIC",
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: "user-owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── 1. Reminder execution eligibility ────────────────────────────────────────

describe("Sprint 7.2 — Reminder Eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isReminderEligible (pure domain check)", () => {
    it("OPEN task with past reminderAt and no reminderSentAt is eligible", () => {
      expect(
        isReminderEligible({
          status: "OPEN",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(true);
    });

    it("IN_PROGRESS task with past reminderAt is eligible", () => {
      expect(
        isReminderEligible({
          status: "IN_PROGRESS",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(true);
    });

    it("OVERDUE task with past reminderAt is eligible", () => {
      expect(
        isReminderEligible({
          status: "OVERDUE",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(true);
    });

    it("DONE task is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "DONE",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(false);
    });

    it("CANCELLED task is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "CANCELLED",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(false);
    });

    it("task with future reminderAt is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "OPEN",
          reminderAt: new Date("2099-01-01"),
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(false);
    });

    it("task with null reminderAt is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "OPEN",
          reminderAt: null,
          reminderSentAt: null,
          assigneeId: "user-1",
        })
      ).toBe(false);
    });

    it("task with reminderSentAt already set is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "OPEN",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: new Date("2026-01-02"),
          assigneeId: "user-1",
        })
      ).toBe(false);
    });

    it("task with null assigneeId is NOT eligible", () => {
      expect(
        isReminderEligible({
          status: "OPEN",
          reminderAt: new Date("2026-01-01"),
          reminderSentAt: null,
          assigneeId: null,
        })
      ).toBe(false);
    });
  });

  describe("dispatchDueTaskReminders — eligibility in DB sweep", () => {
    it("selects only open-family tasks with due reminders and valid assignees", async () => {
      (db.messagingTask.findMany as any).mockResolvedValue([]);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

      await dispatchDueTaskReminders();

      expect(db.messagingTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
            reminderAt: { not: null, lte: expect.any(Date) },
            reminderSentAt: null,
            assigneeId: { not: null },
          }),
        })
      );
    });

    it("returns empty result when no candidates exist", async () => {
      (db.messagingTask.findMany as any).mockResolvedValue([]);

      const result = await dispatchDueTaskReminders();

      expect(result.evaluated).toBe(0);
      expect(result.dispatched).toBe(0);
    });
  });
});

// ─── 2. Idempotency and concurrency safety ────────────────────────────────────

describe("Sprint 7.2 — Idempotency and Concurrency Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("task with reminderSentAt already set is filtered out at DB level", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await dispatchDueTaskReminders();

    // The DB query already excludes reminderSentAt IS NOT NULL
    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.reminderSentAt).toBeNull();
  });

  it("atomic claim succeeds when reminderSentAt is still NULL", async () => {
    const candidate = makeTask({
      reminderAt: new Date("2026-01-01"),
      assigneeId: "user-assignee",
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: null,
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const result = await dispatchDueTaskReminders();

    expect(result.dispatched).toBe(1);
    // Claim sets reminderSentAt to now
    expect(db.messagingTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "task-1",
          reminderSentAt: null,
          status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        }),
        data: { reminderSentAt: expect.any(Date) },
      })
    );
    // After successful send, reminderSentAt stays set (no release call)
    // The only updateMany calls are: 1 claim, 0 releases
    expect(db.messagingTask.updateMany).toHaveBeenCalledTimes(1);
  });

  it("atomic claim fails gracefully when another run already claimed the task", async () => {
    const candidate = makeTask({
      reminderAt: new Date("2026-01-01"),
      assigneeId: "user-assignee",
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    // updateMany returns 0 — another run already claimed it
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await dispatchDueTaskReminders();

    expect(result.dispatched).toBe(0);
    // Should NOT attempt to send notification
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("partial failure does not mark unrelated tasks as sent", async () => {
    const task1 = makeTask({
      id: "task-1",
      reminderAt: new Date("2026-01-01"),
      assigneeId: "user-1",
    });
    const task2 = makeTask({
      id: "task-2",
      reminderAt: new Date("2026-01-02"),
      assigneeId: "user-2",
    });

    (db.messagingTask.findMany as any).mockResolvedValue([task1, task2]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());

    // task-1 claim succeeds, task-2 claim fails
    (db.messagingTask.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })  // task-1 claimed
      .mockResolvedValueOnce({ count: 0 }); // task-2 already claimed

    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...task1,
      reminderSentAt: null,
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const result = await dispatchDueTaskReminders();

    expect(result.dispatched).toBe(1);
    // Only task-1 notification created via createNotification (mocked), not task-2
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: "task-1",
      })
    );
  });

  it("notification failure releases the claim so next sweep retries", async () => {
    const candidate = makeTask({
      reminderAt: new Date("2026-01-01"),
      assigneeId: "user-assignee",
    });

    // Sweep 1: claim succeeds, notification fails
    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })  // claim
      .mockResolvedValueOnce({ count: 1 }); // release (sets reminderSentAt back to NULL)
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: null,
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (createNotification as any).mockRejectedValueOnce(new Error("Notification service down"));

    const result1 = await dispatchDueTaskReminders();
    expect(result1.dispatched).toBe(0);
    expect(result1.failed).toBe(1);
    // Claim + release = 2 updateMany calls
    expect(db.messagingTask.updateMany).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();

    // Sweep 2: task is eligible again (reminderSentAt released to NULL)
    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any)
      .mockResolvedValueOnce({ count: 1 }); // claim again
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: null,
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (createNotification as any).mockResolvedValue({ id: "notif-2" });

    const result2 = await dispatchDueTaskReminders();
    expect(result2.dispatched).toBe(1);
    expect(result2.failed).toBe(0);
  });

  it("repeated sweep after success does not double-send", async () => {
    const candidate = makeTask({
      reminderAt: new Date("2026-01-01"),
      assigneeId: "user-assignee",
    });

    // First sweep
    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: null,
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const result1 = await dispatchDueTaskReminders();
    expect(result1.dispatched).toBe(1);

    vi.clearAllMocks();

    // Second sweep — task now has reminderSentAt set (from successful first sweep)
    // so DB query returns empty
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    const result2 = await dispatchDueTaskReminders();
    expect(result2.dispatched).toBe(0);
    expect(result2.evaluated).toBe(0);
  });
});

// ─── 3. Assignment notification behavior ──────────────────────────────────────

describe("Sprint 7.2 — Assignment Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assignTask sends notification to new assignee", async () => {
    const mockTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      description: "Task desc",
      status: "OPEN",
      priority: 1,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: null,
      originatingMessageId: "msg-1",
      reminderAt: null,
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-actor"))  // Actor check
      .mockResolvedValueOnce(mockActiveParticipant("user-new"));   // Assignee check
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockTask, ...data })
    );
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await assignTask({
      orgId: "org-1",
      taskId: "task-1",
      assigneeId: "user-new",
      actorId: "user-actor",
      conversationId: "conv-1",
    });

    // Wait for fire-and-forget notification
    await new Promise((r) => setTimeout(r, 10));

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-new",
        orgId: "org-1",
        type: "TASK_ASSIGNED",
        title: "Task assigned: Task Title",
        sourceRef: "task-1",
        sourceModule: "messaging",
      })
    );
  });

  it("assignTask does NOT send notification when clearing assignee", async () => {
    const mockTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      description: null,
      status: "OPEN",
      priority: 1,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: "user-old",
      originatingMessageId: null,
      reminderAt: null,
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant("user-actor"));
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockTask, ...data })
    );

    await assignTask({
      orgId: "org-1",
      taskId: "task-1",
      assigneeId: null,
      actorId: "user-actor",
      conversationId: "conv-1",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("updateTask sends assignment notification when assignee changes", async () => {
    const mockTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      description: null,
      status: "OPEN",
      priority: 1,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: "user-old",
      originatingMessageId: null,
      reminderAt: null,
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-actor"))
      .mockResolvedValueOnce(mockActiveParticipant("user-new"));
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockTask, ...data })
    );
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await updateTask({
      orgId: "org-1",
      taskId: "task-1",
      actorId: "user-actor",
      conversationId: "conv-1",
      assigneeId: "user-new",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-new",
        type: "TASK_ASSIGNED",
      })
    );
  });

  it("sendTaskAssignmentNotification creates audit event", async () => {
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await sendTaskAssignmentNotification(
      {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task",
        description: null,
        originatingMessageId: null,
      },
      "user-assignee",
      "user-actor",
    );

    expect(logMessagingAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-actor",
        action: "TASK_ASSIGNED",
        taskId: "task-1",
      })
    );
  });
});

// ─── 4. Reminder invalidation / edits ─────────────────────────────────────────

describe("Sprint 7.2 — Reminder Invalidation / Edits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completed task does not send reminder (filtered at DB level)", async () => {
    // DB query filters for open-family statuses, so DONE tasks never appear
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    const result = await dispatchDueTaskReminders();

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS", "OVERDUE"] });
    expect(result.evaluated).toBe(0);
  });

  it("cancelled task does not send reminder (filtered at DB level)", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await dispatchDueTaskReminders();

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["OPEN", "IN_PROGRESS", "OVERDUE"] });
  });

  it("task with cleared reminder (reminderAt=null) is not selected", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await dispatchDueTaskReminders();

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.where.reminderAt).toEqual({ not: null, lte: expect.any(Date) });
  });

  it("task with future reminderAt is not selected", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await dispatchDueTaskReminders();

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    // The where clause uses lte: now, so future reminders are excluded
    expect(call.where.reminderAt.lte).toBeInstanceOf(Date);
  });

  it("reassigned task reminder uses current assignee", async () => {
    const candidate = makeTask({
      assigneeId: "user-current",
      reminderAt: new Date("2026-01-01"),
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant("user-current"));
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: new Date(),
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await dispatchDueTaskReminders();

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-current",
      })
    );
  });
});

// ─── 5. Security / route protection ───────────────────────────────────────────

describe("Sprint 7.2 — Cron Route Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatchDueTaskReminders is a pure service function (no route-level auth)", async () => {
    // The cron route handles auth via validateCronSecret.
    // The service function is designed to be called from the route only.
    // This test verifies the service function works independently.
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    const result = await dispatchDueTaskReminders();

    expect(result).toEqual({
      dispatched: 0,
      skippedNoAssignee: 0,
      skippedIneligibleAssignee: 0,
      failed: 0,
      evaluated: 0,
    });
  });

  it("dispatch respects limit parameter", async () => {
    (db.messagingTask.findMany as any).mockResolvedValueOnce([]);

    await dispatchDueTaskReminders(10);

    const findManyCalls = (db.messagingTask.findMany as any).mock.calls;
    expect(findManyCalls.length).toBe(1);
    expect(findManyCalls[0][0].take).toBe(10);
  });

  it("dispatch uses default limit of 50 when not specified", async () => {
    (db.messagingTask.findMany as any).mockResolvedValue([]);

    await dispatchDueTaskReminders();

    const call = (db.messagingTask.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(50);
  });
});

// ─── 6. Notification payload safety ───────────────────────────────────────────

describe("Sprint 7.2 — Notification Payload Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reminder notification includes safe task/conversation deep-link", async () => {
    const candidate = makeTask({
      id: "task-1",
      conversationId: "conv-1",
      title: "Secure Task",
      assigneeId: "user-assignee",
      reminderAt: new Date("2026-01-01"),
      originatingMessageId: "msg-orig",
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: new Date(),
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await dispatchDueTaskReminders();

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-assignee",
        orgId: "org-1",
        type: "TASK_REMINDER",
        title: "Reminder: Secure Task",
        link: expect.stringContaining("/app/messaging/conversations/conv-1/tasks/task-1"),
        sourceModule: "messaging",
        sourceRef: "task-1",
      })
    );
  });

  it("notification body truncates description to 120 chars", async () => {
    const longDesc = "A".repeat(200);
    const candidate = makeTask({
      description: longDesc,
      assigneeId: "user-assignee",
      reminderAt: new Date("2026-01-01"),
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: new Date(),
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await dispatchDueTaskReminders();

    const body = (createNotification as any).mock.calls[0][0].body;
    expect(body.length).toBeLessThan(200);
    expect(body).toContain("...");
  });

  it("assignment notification includes safe deep-link", async () => {
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await sendTaskAssignmentNotification(
      {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Assigned Task",
        description: null,
        originatingMessageId: null,
      },
      "user-assignee",
      "user-actor",
    );

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        link: expect.stringContaining("/app/messaging/conversations/conv-1/tasks/task-1"),
      })
    );
  });

  it("no cross-org identifiers leak into notification payload", async () => {
    const candidate = makeTask({
      orgId: "org-1",
      assigneeId: "user-assignee",
      reminderAt: new Date("2026-01-01"),
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...candidate,
      reminderSentAt: new Date(),
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await dispatchDueTaskReminders();

    const notifData = (createNotification as any).mock.calls[0][0];
    // orgId should match task's orgId
    expect(notifData.orgId).toBe("org-1");
    // No foreign org references
    expect(JSON.stringify(notifData)).not.toContain("org-2");
  });
});

// ─── 7. Regression coverage ───────────────────────────────────────────────────

describe("Sprint 7.2 — Regression: assignTask still works", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assignTask returns updated task with new assignee", async () => {
    const mockTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      status: "OPEN",
      priority: 1,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: null,
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-actor"))
      .mockResolvedValueOnce(mockActiveParticipant("user-new"));
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockTask, ...data })
    );
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const result = await assignTask({
      orgId: "org-1",
      taskId: "task-1",
      assigneeId: "user-new",
      actorId: "user-actor",
      conversationId: "conv-1",
    });

    expect(result.assigneeId).toBe("user-new");
  });

  it("assignTask rejects invalid assignee (not a participant)", async () => {
    const mockTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Title",
      status: "OPEN",
      priority: 1,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: null,
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-actor"))
      .mockResolvedValueOnce(null); // Assignee not a participant
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    await expect(
      assignTask({
        orgId: "org-1",
        taskId: "task-1",
        assigneeId: "user-invalid",
        actorId: "user-actor",
        conversationId: "conv-1",
      })
    ).rejects.toThrow("Assignee must be an active participant");
  });
});

// ─── 8. Eligible assignee validation in sweep ─────────────────────────────────

describe("Sprint 7.2 — Assignee Validation in Sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips tasks where assignee is no longer an active participant", async () => {
    const candidate = makeTask({
      assigneeId: "user-left",
      reminderAt: new Date("2026-01-01"),
    });

    (db.messagingTask.findMany as any).mockResolvedValue([candidate]);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(null); // Not a participant

    const result = await dispatchDueTaskReminders();

    expect(result.skippedIneligibleAssignee).toBe(1);
    expect(result.dispatched).toBe(0);
    // Should NOT attempt atomic claim or notification
    expect(db.messagingTask.updateMany).not.toHaveBeenCalled();
  });

  it("processes multiple candidates and tracks skipped vs dispatched", async () => {
    const task1 = makeTask({
      id: "task-1",
      assigneeId: "user-valid",
      reminderAt: new Date("2026-01-01"),
    });
    const task2 = makeTask({
      id: "task-2",
      assigneeId: "user-left",
      reminderAt: new Date("2026-01-02"),
    });

    (db.messagingTask.findMany as any).mockResolvedValue([task1, task2]);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-valid"))  // task-1: valid
      .mockResolvedValueOnce(null);                                 // task-2: not a participant

    (db.messagingTask.updateMany as any).mockResolvedValue({ count: 1 });
    (db.messagingTask.findUnique as any).mockResolvedValue({
      ...task1,
      reminderSentAt: new Date(),
    });
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const result = await dispatchDueTaskReminders();

    expect(result.evaluated).toBe(2);
    expect(result.dispatched).toBe(1);
    expect(result.skippedIneligibleAssignee).toBe(1);
  });
});

// ─── 9. createTask assignment notification ────────────────────────────────────

describe("Sprint 7.2 — createTask Assignment Notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask with initial assignee sends assignment notification", async () => {
    const mockTask = {
      id: "task-new",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "New Task",
      description: "Desc",
      status: "OPEN",
      priority: 0,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: "user-assignee",
      originatingMessageId: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
    };

    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-creator"))  // Creator check
      .mockResolvedValueOnce(mockActiveParticipant("user-assignee")); // Assignee check
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.create as any).mockResolvedValue(mockTask);
    (db.member.findFirst as any).mockResolvedValue(null);
    (db.notification.create as any).mockResolvedValue({ id: "notif-1" });

    await createTask({
      orgId: "org-1",
      conversationId: "conv-1",
      createdBy: "user-creator",
      title: "New Task",
      description: "Desc",
      assigneeId: "user-assignee",
    });

    // Wait for fire-and-forget notification
    await new Promise((r) => setTimeout(r, 10));

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-assignee",
        orgId: "org-1",
        type: "TASK_ASSIGNED",
        title: "Task assigned: New Task",
        sourceRef: "task-new",
        sourceModule: "messaging",
      })
    );
  });

  it("createTask with null assignee does NOT send notification", async () => {
    const mockTask = {
      id: "task-new",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "New Task",
      description: null,
      status: "OPEN",
      priority: 0,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: null,
      originatingMessageId: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
    };

    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant("user-creator"));
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.create as any).mockResolvedValue(mockTask);

    await createTask({
      orgId: "org-1",
      conversationId: "conv-1",
      createdBy: "user-creator",
      title: "New Task",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("createTask rejects invalid assignee before any notification attempt", async () => {
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-creator"))
      .mockResolvedValueOnce(null); // Assignee not a participant
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    await expect(
      createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-creator",
        title: "Should fail",
        assigneeId: "user-invalid",
      })
    ).rejects.toThrow("Assignee must be an active participant");

    // Notification should never be attempted
    await new Promise((r) => setTimeout(r, 10));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notification failure does not block task creation", async () => {
    const mockTask = {
      id: "task-new",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "New Task",
      description: null,
      status: "OPEN",
      priority: 0,
      createdBy: "user-creator",
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: null,
      assigneeId: "user-assignee",
      originatingMessageId: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
    };

    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant("user-creator"))
      .mockResolvedValueOnce(mockActiveParticipant("user-assignee"));
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
    (db.messagingTask.create as any).mockResolvedValue(mockTask);
    (db.member.findFirst as any).mockResolvedValue(null);
    (createNotification as any).mockRejectedValue(new Error("Notification service down"));

    // createTask should succeed even though notification fails
    const result = await createTask({
      orgId: "org-1",
      conversationId: "conv-1",
      createdBy: "user-creator",
      title: "New Task",
      assigneeId: "user-assignee",
    });

    expect(result.id).toBe("task-new");
    expect(result.title).toBe("New Task");
  });
});
