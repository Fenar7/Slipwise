import { NextRequest } from "next/server";
import { listParticipantsForConversation } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/participants
 * List active participants for a conversation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId } = await requireMessagingApiContext();
    const { id } = await params;

    const participants = await listParticipantsForConversation(orgId, id);

    return messagingApiResponse({ participants });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
