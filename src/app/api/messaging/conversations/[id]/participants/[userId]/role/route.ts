import { NextRequest } from "next/server";
import { updateParticipantRole, isValidParticipantRole } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/participants/:userId/role
 * Update a participant's role.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { orgId, userId: actorId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
    const { id, userId: targetUserId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const role = isValidParticipantRole(body.role) ? body.role : null;

    if (!role) {
      throw new Error("role is required");
    }

    const participant = await updateParticipantRole({
      orgId,
      conversationId: id,
      userId: targetUserId,
      role,
      updatedBy: actorId,
    });

    return messagingApiResponse({ participant });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
