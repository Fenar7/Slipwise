import { NextRequest } from "next/server";
import { listThreadsForConversation } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
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
 *
 * Sprint 11.3: requires messaging:read permission.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    const { id } = await params;

    const threads = await safeRead(
      listThreadsForConversation(orgId, id, userId),
    );

    return messagingApiResponse({ threads });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
