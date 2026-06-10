import { NextRequest } from "next/server";
import { changeConversationVisibility, isValidConversationVisibility } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/visibility
 * Change conversation visibility. Only allowed for channels and groups.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
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
