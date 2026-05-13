import { NextRequest } from "next/server";
import { listThreadsForConversation } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/threads
 * List threads for a conversation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;

    const threads = await listThreadsForConversation(orgId, id, userId);

    return messagingApiResponse({ threads });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
