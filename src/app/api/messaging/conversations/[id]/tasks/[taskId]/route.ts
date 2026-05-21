import { NextRequest } from "next/server";
import { updateTaskStatus, assignTask } from "@/lib/messaging/task-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireEnumField,
  MessagingApiError,
  MessagingApiErrorCode,
} from "../../../../../_utils";
import type { MessagingTaskStatus } from "@/lib/messaging/domain-types";

export const runtime = "nodejs";

const VALID_TASK_STATUSES: readonly MessagingTaskStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "OVERDUE",
  "CANCELLED",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { taskId } = await params;
    const body = await request.json();

    // Reject empty/no-op payloads cleanly
    if (
      body.status === undefined &&
      body.assigneeId === undefined
    ) {
      throw new MessagingApiError(
        MessagingApiErrorCode.VALIDATION_ERROR,
        "At least one of status or assigneeId must be provided.",
        422,
      );
    }

    let updatedTask = null;

    if (body.status !== undefined) {
      const status = requireEnumField(body.status, "status", VALID_TASK_STATUSES);
      updatedTask = await updateTaskStatus({
        orgId,
        taskId,
        status,
        actorId: userId,
      });
    }

    if (body.assigneeId !== undefined) {
      updatedTask = await assignTask({
        orgId,
        taskId,
        assigneeId: body.assigneeId,
        actorId: userId,
      });
    }

    return messagingApiResponse(updatedTask);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
