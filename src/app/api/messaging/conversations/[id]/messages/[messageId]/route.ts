import { NextRequest } from "next/server";
import { editMessage, softDeleteMessage } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireStringField,
} from "../../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/messages/:messageId
 * Edit a message body.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
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
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
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
