import { NextRequest } from "next/server";
import { listParticipantsForConversation } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/participants
 * List active participants for a conversation.
 *
 * Hardening (Sprint 3.3): unauthorized access returns 404 to prevent existence
 * leakage. Only active participants can enumerate members.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;

    const participants = await safeRead(
      listParticipantsForConversation(orgId, id, userId),
    );

    return messagingApiResponse({ participants });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
