import { NextRequest } from "next/server";
import { listParticipantsForConversation, addParticipant, isValidParticipantRole } from "@/lib/messaging";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/participants
 * List active participants for a conversation.
 *
 * Hardening (Sprint 3.3): unauthorized access returns 404 to prevent existence
 * leakage. Only active participants can enumerate members.
 *
 * Sprint 11.3: requires messaging:read permission.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    const { id } = await params;

    const participants = await safeRead(
      listParticipantsForConversation(orgId, id, userId),
    );

    return messagingApiResponse({ participants });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations/:id/participants
 * Add a participant to a conversation.
 *
 * Sprint 11.3: requires messaging:update (manage) permission.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    const role = isValidParticipantRole(body.role) ? body.role : "MEMBER";

    if (!targetUserId) {
      throw new Error("userId is required");
    }

    const participant = await addParticipant({
      orgId,
      conversationId: id,
      userId: targetUserId,
      role,
      addedBy: userId,
    });

    return messagingApiResponse({ participant });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
