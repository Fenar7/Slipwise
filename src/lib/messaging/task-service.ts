import "server-only";

import { db } from "@/lib/db";
import type { MessagingTaskRecord } from "./domain-types";
import { participantOrgSafeWhere } from "./org-safe-helpers";
import { toTaskRecord } from "./mappers";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";
import { requireConversationAccess } from "./authorization";
import { toConversationRecord, toParticipantRecord } from "./mappers";
import { sendTaskAssignmentNotification } from "./task-reminders";
import { logMessagingAudit, logMessagingAuditTx } from "./audit";
import type {
  CreateTaskInput,
  UpdateTaskStatusInput,
  AssignTaskInput,
  UpdateTaskInput,
  TaskListFilterInput,
  TaskListResult,
} from "./service-contracts";

function validateReminderAt(reminderAt: Date | null | undefined, dueDate: Date | null | undefined, now = new Date()): void {
  if (reminderAt === undefined || reminderAt === null) return;
  if (isNaN(reminderAt.getTime())) {
    throw new InvalidInputError("Reminder must be a valid date");
  }
  if (reminderAt <= now) {
    throw new InvalidInputError("Reminder must be in the future");
  }
  if (dueDate && reminderAt > dueDate) {
    throw new InvalidInputError("Reminder must not be after the due date");
  }
}

export async function listTasksForConversation(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<MessagingTaskRecord[]> {
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("listTasksForConversation: active participant access required");
  }

  const rows = await db.messagingTask.findMany({
    where: { orgId, conversationId },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });

  return rows.map(toTaskRecord);
}

export async function createTask(input: CreateTaskInput): Promise<MessagingTaskRecord> {
  const { orgId, conversationId, createdBy, assigneeId } = input;

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, createdBy),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("createTask: active participant access required");
  }

  // Enforce conversation action policy (archive/lock)
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "createTask",
  );

  if (assigneeId) {
    const assigneeMembership = await db.conversationParticipant.findFirst({
      where: {
        ...participantOrgSafeWhere(orgId, conversationId, assigneeId),
        leftAt: null,
      },
    });

    if (!assigneeMembership) {
      throw new InvalidInputError("Assignee must be an active participant in the conversation");
    }
  }

  if (input.originatingMessageId) {
    const msg = await db.conversationMessage.findUnique({
      where: { id: input.originatingMessageId },
    });

    if (!msg) {
      throw new InvalidInputError("Originating message not found");
    }

    if (msg.orgId !== orgId || msg.conversationId !== conversationId) {
      throw new InvalidInputError("Originating message must belong to the same conversation and organization");
    }
  }

  validateReminderAt(input.reminderAt, input.dueDate);

  const task = await db.$transaction(async (tx) => {
    const created = await tx.messagingTask.create({
      data: {
        orgId,
        conversationId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 0,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        reminderAt: input.reminderAt ?? null,
        originatingMessageId: input.originatingMessageId ?? null,
        createdBy,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: createdBy,
      action: "TASK_CREATED",
      summary: `Task created: ${created.title}`,
      conversationId: created.conversationId,
      taskId: created.id,
      metadata: null,
    });

    return created;
  });

  // Emit assignment notification when task is created with an initial assignee (fire-and-forget)
  if (assigneeId) {
    sendTaskAssignmentNotification(
      {
        id: task.id,
        orgId: task.orgId,
        conversationId: task.conversationId,
        title: task.title,
        description: task.description,
        originatingMessageId: task.originatingMessageId,
      },
      assigneeId,
      createdBy,
    ).catch(() => {});
  }

  return toTaskRecord(task);
}

export async function updateTaskStatus(input: UpdateTaskStatusInput): Promise<MessagingTaskRecord> {
  const { orgId, taskId, status, actorId, conversationId } = input;

  const task = await db.messagingTask.findUnique({
    where: { id: taskId, orgId },
  });

  if (!task) {
    throw new NotFoundError("Task not found");
  }

  if (task.conversationId !== conversationId) {
    throw new NotFoundError("Task not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, task.conversationId, actorId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("updateTaskStatus: active participant access required");
  }

  // Enforce conversation action policy (archive/lock)
  const conversation = await db.conversation.findUnique({
    where: { id: task.conversationId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "updateTaskStatus",
  );

  const updateData: any = { status };

  if (status === "DONE" && task.status !== "DONE") {
    updateData.completedAt = new Date();
    updateData.completedBy = actorId;
    updateData.reminderAt = null;
  } else if (status !== "DONE" && task.status === "DONE") {
    updateData.completedAt = null;
    updateData.completedBy = null;
  }

  const updatedTask = await db.$transaction(async (tx) => {
    const updated = await tx.messagingTask.update({
      where: { id: taskId },
      data: updateData,
    });

    const auditAction = status === "DONE" ? "TASK_COMPLETED" : status === "CANCELLED" ? "TASK_UPDATED" : "TASK_UPDATED";
    await logMessagingAuditTx(tx, {
      orgId,
      actorId,
      action: auditAction,
      summary: `Task ${status === "DONE" ? "completed" : status === "CANCELLED" ? "cancelled" : "updated"}: ${updated.title}`,
      conversationId: updated.conversationId,
      taskId: updated.id,
      metadata: { previousStatus: task.status, newStatus: status },
    });

    return updated;
  });

  return toTaskRecord(updatedTask);
}

export async function assignTask(input: AssignTaskInput): Promise<MessagingTaskRecord> {
  const { orgId, taskId, assigneeId, actorId, conversationId } = input;

  const task = await db.messagingTask.findUnique({
    where: { id: taskId, orgId },
  });

  if (!task) {
    throw new NotFoundError("Task not found");
  }

  if (task.conversationId !== conversationId) {
    throw new NotFoundError("Task not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, task.conversationId, actorId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("assignTask: active participant access required");
  }

  // Enforce conversation action policy (archive/lock)
  const conversation = await db.conversation.findUnique({
    where: { id: task.conversationId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "assignTask",
  );

  if (assigneeId) {
    const assigneeMembership = await db.conversationParticipant.findFirst({
      where: {
        ...participantOrgSafeWhere(orgId, task.conversationId, assigneeId),
        leftAt: null,
      },
    });

    if (!assigneeMembership) {
      throw new InvalidInputError("Assignee must be an active participant in the conversation");
    }
  }

  const updatedTask = await db.$transaction(async (tx) => {
    const updated = await tx.messagingTask.update({
      where: { id: taskId },
      data: { assigneeId },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId,
      action: "TASK_UPDATED",
      summary: `Task assignee ${assigneeId === null ? "cleared" : "updated"}: ${updated.title}`,
      conversationId: updated.conversationId,
      taskId: updated.id,
      metadata: { previousAssigneeId: task.assigneeId, newAssigneeId: assigneeId },
    });

    return updated;
  });

  // Emit assignment notification when a non-null assignee is set (fire-and-forget)
  if (assigneeId && assigneeId !== task.assigneeId) {
    sendTaskAssignmentNotification(
      {
        id: task.id,
        orgId: task.orgId,
        conversationId: task.conversationId,
        title: task.title,
        description: task.description,
        originatingMessageId: task.originatingMessageId,
      },
      assigneeId,
      actorId,
    ).catch(() => {});
  }

  return toTaskRecord(updatedTask);
}

export async function updateTask(input: UpdateTaskInput): Promise<MessagingTaskRecord> {
  const { orgId, taskId, actorId, conversationId } = input;

  const task = await db.messagingTask.findUnique({
    where: { id: taskId, orgId },
  });

  if (!task) {
    throw new NotFoundError("Task not found");
  }

  if (task.conversationId !== conversationId) {
    throw new NotFoundError("Task not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, task.conversationId, actorId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("updateTask: active participant access required");
  }

  // Enforce conversation action policy (archive/lock)
  const conversation = await db.conversation.findUnique({
    where: { id: task.conversationId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "updateTask",
  );

  // Validate assignee if it's being updated to a non-null value
  if (input.assigneeId) {
    const assigneeMembership = await db.conversationParticipant.findFirst({
      where: {
        ...participantOrgSafeWhere(orgId, task.conversationId, input.assigneeId),
        leftAt: null,
      },
    });

    if (!assigneeMembership) {
      throw new InvalidInputError("Assignee must be an active participant in the conversation");
    }
  }

  // Build the update data
  const updateData: any = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
  if (input.assigneeId !== undefined) updateData.assigneeId = input.assigneeId;

  // Validate reminder against effective dueDate (input takes precedence, else existing)
  const effectiveDueDate = input.dueDate !== undefined ? input.dueDate : task.dueDate;
  validateReminderAt(input.reminderAt, effectiveDueDate);

  if (input.reminderAt !== undefined) {
    updateData.reminderAt = input.reminderAt;
  }

  if (input.status !== undefined) {
    updateData.status = input.status;
    const oldStatus = task.status;
    const newStatus = input.status;

    if (newStatus === "DONE" && oldStatus !== "DONE") {
      updateData.completedAt = new Date();
      updateData.completedBy = actorId;
      updateData.reminderAt = null;
    } else if (newStatus !== "DONE" && oldStatus === "DONE") {
      updateData.completedAt = null;
      updateData.completedBy = null;
    }
  }

  const updatedTask = await db.$transaction(async (tx) => {
    const updated = await tx.messagingTask.update({
      where: { id: taskId },
      data: updateData,
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId,
      action: "TASK_UPDATED",
      summary: `Task updated: ${updated.title}`,
      conversationId: updated.conversationId,
      taskId: updated.id,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return updated;
  });

  // Emit assignment notification when assignee changes to a new non-null value (fire-and-forget)
  if (
    input.assigneeId !== undefined &&
    input.assigneeId !== null &&
    input.assigneeId !== task.assigneeId
  ) {
    sendTaskAssignmentNotification(
      {
        id: task.id,
        orgId: task.orgId,
        conversationId: task.conversationId,
        title: input.title ?? task.title,
        description: input.description !== undefined ? input.description : task.description,
        originatingMessageId: task.originatingMessageId,
      },
      input.assigneeId,
      actorId,
    ).catch(() => {});
  }

  return toTaskRecord(updatedTask);
}

const TASK_LIST_DEFAULT_LIMIT = 20;
const TASK_LIST_MAX_LIMIT = 50;

export async function listAllTasksForUser(
  filter: TaskListFilterInput,
): Promise<TaskListResult> {
  const { orgId, userId, scope, conversationId, cursor, limit: rawLimit } = filter;
  const limit = Math.min(TASK_LIST_MAX_LIMIT, Math.max(1, rawLimit ?? TASK_LIST_DEFAULT_LIMIT));

  const participantConversations = await db.conversationParticipant.findMany({
    where: {
      orgId,
      userId,
      leftAt: null,
    },
    select: {
      conversationId: true,
    },
  });

  const accessibleConversationIds = participantConversations.map((pc) => pc.conversationId);

  if (accessibleConversationIds.length === 0) {
    return { tasks: [], nextCursor: null, hasMore: false };
  }

  // If a specific conversation is requested, validate membership
  if (conversationId) {
    if (!accessibleConversationIds.includes(conversationId)) {
      return { tasks: [], nextCursor: null, hasMore: false };
    }
  }

  const targetConversationIds = conversationId
    ? [conversationId]
    : accessibleConversationIds;

  // Build the base where clause scoped to accessible conversations
  const where: Record<string, unknown> = {
    orgId,
    conversationId: { in: targetConversationIds },
  };

  // OVERDUE is included in the open-family set because taskIsOpen() treats it as
  // open, and existing stored OVERDUE rows must remain visible in default views.
  const OPEN_FAMILY_STATUSES = ["OPEN", "IN_PROGRESS", "OVERDUE"] as const;
  const now = new Date();

  if (scope === "in_progress") {
    where.status = "IN_PROGRESS";
  } else if (scope === "done") {
    where.status = "DONE";
  } else if (scope === "cancelled") {
    where.status = "CANCELLED";
  } else if (scope === "overdue") {
    where.status = { in: [...OPEN_FAMILY_STATUSES] };
    where.dueDate = { lt: now };
  } else if (scope === "due_soon") {
    const upperBound = new Date();
    upperBound.setDate(upperBound.getDate() + 7);
    where.status = { in: [...OPEN_FAMILY_STATUSES] };
    where.dueDate = { gte: now, lte: upperBound };
  } else if (scope === "assigned") {
    where.assigneeId = userId;
  } else if (scope === "created") {
    where.createdBy = userId;
  } else {
    // Default (no scope or scope=open): accessible open work only.
    // DONE and CANCELLED are excluded from the default global view.
    where.status = { in: [...OPEN_FAMILY_STATUSES] };
  }

  // Stable pagination: dueDate asc, then id as unique tiebreaker for deterministic
  // cursor-based pagination. Tasks with equal dueDate will not reorder/skip across pages.
  const rows = await db.messagingTask.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

  return {
    tasks: sliced.map(toTaskRecord),
    nextCursor,
    hasMore,
  };
}

