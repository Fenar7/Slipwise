import { NextRequest } from "next/server";
import { listConversationMessages, sendMessage } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  requireStringField,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/messages
 * List top-level messages for a conversation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId } = await requireMessagingApiContext();
    const { id } = await params;
    const { limit, cursor } = parsePagination(request.nextUrl.searchParams);

    const messages = await listConversationMessages(orgId, id, { limit, cursor: cursor ?? undefined });

    return messagingApiResponse({
      messages,
      meta: {
        limit,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations/:id/messages
 * Send a message (top-level or thread reply).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const messageBody = requireStringField(body.body, "body", 10000);
    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;

    const message = await sendMessage({
      orgId,
      conversationId: id,
      threadId,
      authorId: userId,
      body: messageBody,
      contentMeta:
        typeof body.contentMeta === "object" && body.contentMeta !== null
          ? (body.contentMeta as Record<string, unknown>)
          : null,
    });

    return messagingApiResponse(message, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
