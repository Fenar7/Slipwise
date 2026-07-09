import { NextRequest } from "next/server";
import {
  listConversationSummariesForUser,
  createConversation,
} from "@/lib/messaging";
import { isValidConversationType, isValidConversationVisibility } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
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
 *
 * Sprint 11.3: requires messaging:read permission.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
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
 *
 * Sprint 11.3: requires messaging:create permission.
 */
export async function POST(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE);
    const body = (await request.json()) as Record<string, unknown>;

    const type = requireEnumField(body.type, "type", ["CHANNEL", "DM", "GROUP", "PORTAL"] as const);
    const name = (type === "DM" || type === "PORTAL") ? null : requireStringField(body.name, "name", 256);
    const description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
    const visibility =
      (type === "DM" || type === "PORTAL")
        ? null
        : body.visibility != null
          ? requireEnumField(body.visibility, "visibility", ["PUBLIC", "PRIVATE"] as const)
          : null;

    const dmPeerId =
      type === "DM" && typeof body.dmPeerId === "string" ? body.dmPeerId : null;

    if (type === "DM" && !dmPeerId) {
      throw new Error("DM conversations require dmPeerId");
    }

    const customerId = type === "PORTAL" ? requireStringField(body.customerId, "customerId") : null;
    const linkedRecordType = (type === "PORTAL" && body.linkedRecordType)
      ? requireEnumField(
          body.linkedRecordType,
          "linkedRecordType",
          ["CUSTOMER", "INVOICE", "QUOTE", "PAYMENT", "STATEMENT", "TICKET", "GENERAL_SUPPORT"] as const
        )
      : null;
    const linkedRecordId = (type === "PORTAL" && typeof body.linkedRecordId === "string")
      ? body.linkedRecordId
      : null;

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
      customerId,
      linkedRecordType,
      linkedRecordId,
    });

    return messagingApiResponse(result, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
