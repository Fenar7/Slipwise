import "server-only";

import { db } from "@/lib/db";
import type { MessagingTaskRecord } from "./domain-types";
import { participantOrgSafeWhere, taskOrgSafeWhere } from "./org-safe-helpers";
import { toTaskRecord, toConversationRecord, toParticipantRecord } from "./mappers";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";
import { requireConversationAccess } from "./authorization";
import type { CreateTaskInput, UpdateTaskStatusInput, AssignTaskInput } from "./service-contracts";

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
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
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

  const task = await db.messagingTask.create({
    data: {
      orgId,
      conversationId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 0,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      originatingMessageId: input.originatingMessageId ?? null,
      createdBy,
    },
  });

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
    throw new InvalidInputError("Task does not belong to the specified conversation");
  }

  // Verify actor is an active participant
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, actorId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("updateTaskStatus: active participant access required");
  }

  const completedAt = status === "DONE" ? new Date() : task.completedAt;
  const completedBy = status === "DONE" ? actorId : task.completedBy;

  const updated = await db.messagingTask.update({
    where: { id: taskId, orgId },
    data: {
      status,
      completedAt,
      completedBy,
    },
  });

  return toTaskRecord(updated);
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
    throw new InvalidInputError("Task does not belong to the specified conversation");
  }

  // Verify actor is an active participant
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, actorId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("assignTask: active participant access required");
  }

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

  const updated = await db.messagingTask.update({
    where: { id: taskId, orgId },
    data: { assigneeId: assigneeId ?? null },
  });

  return toTaskRecord(updated);
}
