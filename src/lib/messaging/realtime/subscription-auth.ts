import "server-only";

import { db } from "@/lib/db";
import { toConversationRecord, toParticipantRecord } from "../mappers";
import { evaluateConversationAccess } from "../authorization";
import type { RealtimeSession } from "./session";

/**
 * Subscription authorization adapter.
 *
 * The WebSocket layer must reuse the existing Phase 3 access model.
 * This adapter bridges realtime session claims to the centralized
 * authorization policy by looking up the conversation and participant
 * records, then delegating to `evaluateConversationAccess`.
 *
 * Default-deny: any lookup failure, org mismatch, or inactive membership
 * results in a denied subscription.
 */

export type SubscriptionAuthResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: "auth_required" | "subscription_denied" | "org_mismatch" | "server_error" };

export async function authorizeConversationSubscription(
  session: RealtimeSession,
  conversationId: string,
): Promise<SubscriptionAuthResult> {
  try {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId },
    });

    if (!conversation) {
      return {
        allowed: false,
        reason: "conversation not found or access denied",
        code: "subscription_denied",
      };
    }

    // Org boundary enforcement: session org must match conversation org.
    if (conversation.orgId !== session.orgId) {
      return {
        allowed: false,
        reason: "org boundary violation",
        code: "org_mismatch",
      };
    }

    const participant = await db.conversationParticipant.findFirst({
      where: {
        orgId: session.orgId,
        conversationId,
        userId: session.userId,
        leftAt: null,
      },
    });

    const result = evaluateConversationAccess(
      toConversationRecord(conversation),
      participant ? toParticipantRecord(participant) : null,
      "READ",
    );

    if (!result.allowed) {
      return {
        allowed: false,
        reason: result.reason,
        code: "subscription_denied",
      };
    }

    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "authorization check failed",
      code: "server_error",
    };
  }
}

/**
 * Lightweight check for whether a session may remain subscribed to a
 * conversation after membership or org state may have changed.
 *
 * Used during reconnect/resume validation and periodic re-authorization.
 */
export async function reauthorizeConversationSubscription(
  session: RealtimeSession,
  conversationId: string,
): Promise<SubscriptionAuthResult> {
  return authorizeConversationSubscription(session, conversationId);
}
