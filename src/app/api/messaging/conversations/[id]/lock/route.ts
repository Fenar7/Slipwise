import { NextRequest } from "next/server";
import { lockConversation } from "@/lib/messaging";
import { isPlatformAdminUser } from "@/lib/auth/require-org";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  MessagingApiError,
  MessagingApiErrorCode,
  applyMessagingRateLimit,
} from "../../../_utils";

export const runtime = "nodejs";

const MAX_LOCK_REASON_LENGTH = 100;

function validateLockReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_LOCK_REASON_LENGTH) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `Lock reason must be at most ${MAX_LOCK_REASON_LENGTH} characters.`,
      422,
    );
  }
  // Strip control characters and newlines to keep audit metadata safe
  const sanitized = trimmed.replace(/[\x00-\x1f\x7f]/g, "");
  return sanitized;
}

/**
 * PATCH /api/messaging/conversations/:id/lock
 * Lock a conversation. Blocks ordinary member mutations.
 *
 * Sprint 11.3: requires messaging:delete (governance) permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId, role } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.DELETE);
    await applyMessagingRateLimit(request, orgId, "messagingGovernance");
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const reason = validateLockReason(body.reason);

    const conversation = await lockConversation({
      orgId,
      conversationId: id,
      lockedBy: userId,
      reason,
      actorOrgRole: role,
      isPlatformAdmin: isPlatformAdminUser(userId),
    });

    return messagingApiResponse(conversation);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
