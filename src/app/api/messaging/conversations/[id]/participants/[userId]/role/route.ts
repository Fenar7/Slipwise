import { NextRequest } from "next/server";
import { updateParticipantRole, isValidParticipantRole } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/participants/:userId/role
 * Update a participant's role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { orgId, userId: actorId } = await requireMessagingApiContext();
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
