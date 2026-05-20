import { NextRequest } from "next/server";
import { renameConversation } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../../../_utils";

export const runtime = "nodejs";

/**
 * PATCH /api/messaging/conversations/:id/rename
 * Rename a conversation. Not allowed on DMs.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : "";

    if (!name) {
      throw new Error("name is required");
    }

    const conversation = await renameConversation({
      orgId,
      conversationId: id,
      name,
      actorId: userId,
    });

    return messagingApiResponse(conversation);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
