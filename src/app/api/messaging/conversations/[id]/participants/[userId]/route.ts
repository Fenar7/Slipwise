import { NextRequest } from "next/server";
import { removeParticipant } from "@/lib/messaging";
import { isPlatformAdminUser } from "@/lib/auth/require-org";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../_utils";

export const runtime = "nodejs";

/**
 * DELETE /api/messaging/conversations/:id/participants/:userId
 * Remove a participant from a conversation.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { orgId, userId: actorId, role } = await requireMessagingApiContext();
    const { id, userId: targetUserId } = await params;

    const participant = await removeParticipant({
      orgId,
      conversationId: id,
      userId: targetUserId,
      removedBy: actorId,
      actorOrgRole: role,
      isPlatformAdmin: isPlatformAdminUser(actorId),
    });

    return messagingApiResponse({ participant });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
