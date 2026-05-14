import { NextRequest } from "next/server";
import { listThreadsForConversation } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/threads
 * List threads for a conversation.
 *
 * Hardening (Sprint 3.3): unauthorized access returns 404 to prevent existence
 * leakage. Only active participants can list threads.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;

    const threads = await safeRead(
      listThreadsForConversation(orgId, id, userId),
    );

    return messagingApiResponse({ threads });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
