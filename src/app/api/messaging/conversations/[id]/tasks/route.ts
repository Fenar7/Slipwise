import { NextRequest } from "next/server";
import { getConversationTaskSummaries } from "@/lib/messaging";
import { createTask } from "@/lib/messaging/task-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  requireStringField,
  requireNumberRange,
  requireValidDate,
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
    const priority = requireNumberRange(body.priority ?? 0, "Priority", 0, 3) ?? 0;
    const dueDate = requireValidDate(body.dueDate, "Due date");

    const task = await createTask({
      orgId,
      conversationId: id,
      createdBy: userId,
      title,
      description: body.description ?? null,
      priority,
      assigneeId: body.assigneeId ?? null,
      dueDate: dueDate ?? null,
      originatingMessageId: body.originatingMessageId ?? null,
    });

    return messagingApiResponse(task);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
