import { NextRequest } from "next/server";
import { markConversationRead } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  applyMessagingRateLimit,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * POST /api/messaging/conversations/:id/read
 * Mark a conversation as read for the current user.
 *
 * Sprint 5.2: server-authoritative read-state update.
 * - Membership check is handled by markConversationRead (assertActiveParticipant).
 * - Existence-hiding: non-members receive 404 via safeRead + service-layer guard.
 * - Rate-limited to prevent abuse.
 *
 * Sprint 11.3: requires messaging:read permission.
 * Read-state is a read-path capability — users must have read access to
 * mark conversations as read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    await applyMessagingRateLimit(request, orgId, "messagingSend");
    const { id: conversationId } = await params;

    const readState = await safeRead(
      markConversationRead({
        orgId,
        conversationId,
        userId,
        readAt: new Date(),
      }),
    );

    return messagingApiResponse({ readState });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
