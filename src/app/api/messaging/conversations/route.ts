import { NextRequest } from "next/server";
import {
  listConversationSummariesForUser,
  createConversation,
} from "@/lib/messaging";
import { isValidConversationType, isValidConversationVisibility } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  requireStringField,
  requireEnumField,
} from "../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations
 * List conversation summaries for the current user in their active org.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { limit, cursor } = parsePagination(request.nextUrl.searchParams);

    const conversations = await listConversationSummariesForUser(orgId, userId, {
      limit,
      cursor,
    });

    return messagingApiResponse({
      conversations,
      meta: {
        limit,
        hasMore: conversations.length === limit,
      },
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations
 * Create a new conversation.
 */
export async function POST(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const body = (await request.json()) as Record<string, unknown>;

    const type = requireEnumField(body.type, "type", ["CHANNEL", "DM", "GROUP"] as const);
    const name = type === "DM" ? null : requireStringField(body.name, "name", 256);
    const description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
    const visibility =
      type === "DM"
        ? null
        : body.visibility != null
          ? requireEnumField(body.visibility, "visibility", ["PUBLIC", "PRIVATE"] as const)
          : null;

    const dmPeerId =
      type === "DM" && typeof body.dmPeerId === "string" ? body.dmPeerId : null;

    if (type === "DM" && !dmPeerId) {
      throw new Error("DM conversations require dmPeerId");
    }

    const initialParticipantIds: string[] = [];
    if (Array.isArray(body.initialParticipantIds)) {
      for (const id of body.initialParticipantIds) {
        if (typeof id === "string" && id.trim().length > 0) {
          initialParticipantIds.push(id.trim());
        }
      }
    }

    const result = await createConversation({
      orgId,
      type,
      name,
      description,
      visibility,
      dmPeerId,
      createdBy: userId,
      initialParticipantIds,
    });

    return messagingApiResponse(result, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
