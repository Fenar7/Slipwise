import { NextRequest } from "next/server";
import { changeConversationVisibility, isValidConversationVisibility } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/visibility
 * Change conversation visibility. Only allowed for channels and groups.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const visibility = isValidConversationVisibility(body.visibility)
      ? body.visibility
      : null;

    if (!visibility) {
      throw new Error("visibility is required");
    }

    const conversation = await changeConversationVisibility({
      orgId,
      conversationId: id,
      visibility,
      actorId: userId,
    });

    return messagingApiResponse(conversation);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
