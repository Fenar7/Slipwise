import { NextRequest } from "next/server";
import { archiveConversation } from "@/lib/messaging";
import { isPlatformAdminUser } from "@/lib/auth/require-org";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  applyMessagingRateLimit,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/archive
 * Archive a conversation (soft-delete).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();
    await applyMessagingRateLimit(request, orgId, "messagingGovernance");
    const { id } = await params;

    const conversation = await archiveConversation({
      orgId,
      conversationId: id,
      archivedBy: userId,
      actorOrgRole: role,
      isPlatformAdmin: isPlatformAdminUser(userId),
    });

    return messagingApiResponse(conversation);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
