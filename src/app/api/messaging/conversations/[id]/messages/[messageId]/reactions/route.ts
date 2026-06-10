import { NextRequest } from "next/server";
import { addReaction, removeReaction } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  requireStringField,
} from "../../../../../_utils";

export const runtime = "nodejs";

/**
 * POST /api/messaging/conversations/:id/messages/:messageId/reactions
 * Add or remove a reaction.
 *
 * Sprint 11.3: requires messaging:create (send) permission.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE);
    const { messageId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const action = requireStringField(body.action, "action");
    const value = requireStringField(body.value, "value");

    if (action === "add") {
      const reaction = await addReaction({
        orgId,
        messageId,
        userId,
        value,
      });
      return messagingApiResponse(reaction, 201);
    }

    if (action === "remove") {
      await removeReaction({
        orgId,
        messageId,
        userId,
        value,
      });
      return messagingApiResponse({ success: true });
    }

    return messagingApiResponse({ error: "Invalid action. Use 'add' or 'remove'." }, 400);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
