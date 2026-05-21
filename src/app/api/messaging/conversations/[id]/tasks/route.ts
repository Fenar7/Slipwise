import { NextRequest } from "next/server";
import { getConversationTaskSummaries } from "@/lib/messaging";
import { createTask } from "@/lib/messaging/task-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  requireStringField,
} from "../../../../_utils";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const tasks = await safeRead(
      getConversationTaskSummaries(orgId, id, userId)
    );
    return messagingApiResponse(tasks);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = await request.json();

    const title = requireStringField(body.title, "Task title");

    const task = await createTask({
      orgId,
      conversationId: id,
      createdBy: userId,
      title,
      description: body.description ?? null,
      priority: typeof body.priority === "number" ? body.priority : 0,
      assigneeId: body.assigneeId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      originatingMessageId: body.originatingMessageId ?? null,
    });

    return messagingApiResponse(task);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
