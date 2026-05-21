import { NextRequest } from "next/server";
import { getConversationTaskSummaries } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../_utils";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const tasks = await getConversationTaskSummaries(orgId, id, userId);
    return messagingApiResponse(tasks);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
