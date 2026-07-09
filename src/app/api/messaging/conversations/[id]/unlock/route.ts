import { NextRequest } from "next/server";
import { unlockConversation } from "@/lib/messaging";
import { isPlatformAdminUser } from "@/lib/auth/require-org";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  applyMessagingRateLimit,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/unlock
 * Unlock a conversation. Restores ordinary member mutations.
 *
 * Sprint 11.3: requires messaging:delete (governance) permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId, role } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.DELETE);
    await applyMessagingRateLimit(request, orgId, "messagingGovernance");
    const { id } = await params;

    const conversation = await unlockConversation({
      orgId,
      conversationId: id,
      unlockedBy: userId,
      actorOrgRole: role,
      isPlatformAdmin: isPlatformAdminUser(userId),
    });

    return messagingApiResponse(conversation);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
