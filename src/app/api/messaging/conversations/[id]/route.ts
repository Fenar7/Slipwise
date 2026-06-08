import { NextRequest } from "next/server";
import {
  getConversationDetail,
  updatePortalConversationState,
  updatePortalConversationAssignment,
} from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  MessagingNotFoundError,
  requireEnumField,
} from "../../_utils";
import { isPlatformAdminUser } from "@/lib/auth/require-org";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id
 * Get enriched conversation detail.
 *
 * Hardening (Sprint 3.3): returns 404 for any unauthorized access to prevent
 * existence leakage. Only active participants can read conversation detail.
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
      throw new MessagingNotFoundError("Conversation not found or access denied.");
    }

    return messagingApiResponse(detail);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * PATCH /api/messaging/conversations/:id
 * Update portal lifecycle state or assignment.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireMessagingApiContext();
    const { orgId, userId, role: actorOrgRole } = context;
    const isPlatformAdmin = isPlatformAdminUser(userId);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    let result = null;

    if ("portalState" in body) {
      const portalState = requireEnumField(
        body.portalState,
        "portalState",
        ["OPEN", "WAITING_ON_INTERNAL", "WAITING_ON_CLIENT", "CLOSED"] as const
      );
      result = await updatePortalConversationState({
        orgId,
        conversationId: id,
        portalState,
        actorId: userId,
        actorOrgRole,
        isPlatformAdmin,
      });
    }

    if ("assigneeId" in body) {
      const assigneeId =
        body.assigneeId === null || body.assigneeId === ""
          ? null
          : typeof body.assigneeId === "string"
          ? body.assigneeId
          : undefined;

      if (assigneeId === undefined) {
        throw new Error("Invalid assigneeId");
      }

      result = await updatePortalConversationAssignment({
        orgId,
        conversationId: id,
        assigneeId,
        actorId: userId,
        actorOrgRole,
        isPlatformAdmin,
      });
    }

    if (!result) {
      throw new Error("No fields to update");
    }

    return messagingApiResponse({ success: true });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
