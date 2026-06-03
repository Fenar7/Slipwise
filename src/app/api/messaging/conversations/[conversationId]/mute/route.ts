import { NextRequest } from "next/server";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "@/app/api/messaging/_utils";
import { toggleConversationMute } from "@/lib/messaging/notification-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await context.params;
    const { userId, orgId } = await requireMessagingApiContext();
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
