import { NextRequest } from "next/server";
import { updateTask } from "@/lib/messaging/task-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireEnumField,
  requireStringField,
  requireNumberRange,
  requireValidDate,
  MessagingApiError,
  MessagingApiErrorCode,
} from "../../../../../_utils";
import type { MessagingTaskStatus } from "@/lib/messaging/domain-types";

export const runtime = "nodejs";

const VALID_TASK_STATUSES: readonly MessagingTaskStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: conversationId, taskId } = await params;
    const body = await request.json();

    // Reject empty/no-op payloads cleanly
    if (
      body.title === undefined &&
      body.description === undefined &&
      body.priority === undefined &&
      body.dueDate === undefined &&
      body.reminderAt === undefined &&
      body.assigneeId === undefined &&
      body.status === undefined
    ) {
      throw new MessagingApiError(
        MessagingApiErrorCode.VALIDATION_ERROR,
        "At least one editable field must be provided.",
        422,
      );
    }

    let title: string | undefined = undefined;
    if (body.title !== undefined) {
      title = requireStringField(body.title, "Task title", 256);
    }

    let description: string | null | undefined = undefined;
    if (body.description !== undefined) {
      if (body.description === null || body.description === "") {
        description = null;
      } else {
        description = requireStringField(body.description, "Description", 1000);
      }
    }

    let priority: number | undefined = undefined;
    if (body.priority !== undefined) {
      priority = requireNumberRange(body.priority, "Priority", 0, 3);
    }

    let dueDate: Date | null | undefined = undefined;
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        dueDate = null;
      } else {
        dueDate = requireValidDate(body.dueDate, "Due date");
      }
    }

    let reminderAt: Date | null | undefined = undefined;
    if (body.reminderAt !== undefined) {
      if (body.reminderAt === null || body.reminderAt === "") {
        reminderAt = null;
      } else {
        reminderAt = requireValidDate(body.reminderAt, "Reminder");
      }
    }

    let assigneeId: string | null | undefined = undefined;
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null || body.assigneeId === "") {
        assigneeId = null;
      } else {
        assigneeId = requireStringField(body.assigneeId, "Assignee ID");
      }
    }

    let status: MessagingTaskStatus | undefined = undefined;
    if (body.status !== undefined) {
      status = requireEnumField(body.status, "status", VALID_TASK_STATUSES);
    }

    const updatedTask = await updateTask({
      orgId,
      taskId,
      actorId: userId,
      conversationId,
      title,
      description,
      priority,
      dueDate,
      reminderAt,
      assigneeId,
      status,
    });

    return messagingApiResponse(updatedTask);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
