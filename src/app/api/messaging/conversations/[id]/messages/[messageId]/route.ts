import { NextRequest } from "next/server";
import { editMessage, softDeleteMessage } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  requireStringField,
} from "../../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/messages/:messageId
 * Edit a message body.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
    const { messageId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const newBody = requireStringField(body.body, "body", 10000);

    const updated = await editMessage({
      orgId,
      messageId,
      actorId: userId,
      body: newBody,
    });

    return messagingApiResponse(updated);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * DELETE /api/messaging/conversations/:id/messages/:messageId
 * Soft-delete a message.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
    const { messageId } = await params;

    const deleted = await softDeleteMessage({
      orgId,
      messageId,
      actorId: userId,
    });

    return messagingApiResponse(deleted);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
