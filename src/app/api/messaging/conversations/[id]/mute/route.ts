import { NextRequest } from "next/server";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "@/app/api/messaging/_utils";
import { toggleConversationMute } from "@/lib/messaging/notification-service";

/**
 * POST /api/messaging/conversations/:conversationId/mute
 * Toggle mute status for a conversation.
 *
 * Sprint 11.3: requires messaging:read permission.
 * Mute is a notification preference on a readable conversation —
 * user must have read access to the conversation to manage its notifications.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await context.params;
    const { userId, orgId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    const body = await req.json();
    const { isMuted } = body;

    if (typeof isMuted !== "boolean") {
      return messagingApiError("VALIDATION_ERROR", "isMuted (boolean) is required", 422);
    }

    const result = await toggleConversationMute({
      userId,
      orgId,
      conversationId,
      isMuted,
    });

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
