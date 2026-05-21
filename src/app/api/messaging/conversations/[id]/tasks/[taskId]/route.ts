import { NextRequest } from "next/server";
import { updateTaskStatus, assignTask } from "@/lib/messaging/task-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../../_utils";
import type { MessagingTaskStatus } from "@/lib/messaging/domain-types";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { taskId } = await params;
    const body = await request.json();

    let updatedTask = null;

    if (body.status) {
      updatedTask = await updateTaskStatus({
        orgId,
        taskId,
        status: body.status as MessagingTaskStatus,
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

    if (!updatedTask) {
      throw new Error("No update fields provided");
    }

    return messagingApiResponse(updatedTask);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
