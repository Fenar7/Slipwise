import { NextRequest } from "next/server";
import { getConversationDetail } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
} from "../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id
 * Get enriched conversation detail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const { limit, cursor } = parsePagination(request.nextUrl.searchParams);

    const detail = await getConversationDetail(orgId, id, userId, {
      messageLimit: limit,
      messageCursor: cursor,
    });

    if (!detail) {
      return handleMessagingApiError(
        new Error("Conversation not found or access denied"),
      );
    }

    return messagingApiResponse(detail);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
