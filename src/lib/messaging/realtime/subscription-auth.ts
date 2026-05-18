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
 *
 * Safety rule: the client-facing denial is always uniform. A conversation
 * that does not exist, exists in another org, or is otherwise inaccessible
 * produces the identical public response to prevent existence leakage.
 */

export type SubscriptionAuthResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: "subscription_denied" | "server_error" };

/** Internal-only diagnostic detail for supportability. Never sent to clients. */
export type SubscriptionAuthDiagnostic =
  | "allowed"
  | "not_found"
  | "org_mismatch"
  | "not_member"
  | "removed"
  | "policy_denied"
  | "server_error";

export interface SubscriptionAuthDetail {
  result: SubscriptionAuthResult;
  /** Server-side diagnostic category for logs/support. */
  diagnostic: SubscriptionAuthDiagnostic;
}

export async function authorizeConversationSubscription(
  session: RealtimeSession,
  conversationId: string,
): Promise<SubscriptionAuthDetail> {
  try {
    // Org-safe lookup: only find conversations within the session's org.
    // This prevents cross-org existence leakage because a foreign-org row
    // is indistinguishable from a nonexistent row.
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, orgId: session.orgId },
    });

    if (!conversation) {
      return {
        result: {
          allowed: false,
          reason: "conversation not found or access denied",
          code: "subscription_denied",
        },
        diagnostic: "not_found",
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
      let diagnostic: SubscriptionAuthDiagnostic = "policy_denied";
      if (!participant) {
        diagnostic = "not_member";
      } else if (participant.leftAt !== null) {
        diagnostic = "removed";
      }

      return {
        result: {
          allowed: false,
          reason: result.reason,
          code: "subscription_denied",
        },
        diagnostic,
      };
    }

    return { result: { allowed: true }, diagnostic: "allowed" };
  } catch (error) {
    return {
      result: {
        allowed: false,
        reason: error instanceof Error ? error.message : "authorization check failed",
        code: "server_error",
      },
      diagnostic: "server_error",
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
): Promise<SubscriptionAuthDetail> {
  return authorizeConversationSubscription(session, conversationId);
}
