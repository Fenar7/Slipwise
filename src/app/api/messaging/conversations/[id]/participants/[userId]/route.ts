import { NextRequest } from "next/server";
import { removeParticipant } from "@/lib/messaging";
import { isPlatformAdminUser } from "@/lib/auth/require-org";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../_utils";

export const runtime = "nodejs";

/**
 * DELETE /api/messaging/conversations/:id/participants/:userId
 * Remove a participant from a conversation.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 * Participant removal is a management action that modifies conversation
 * membership.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { orgId, userId: actorId, role } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
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
