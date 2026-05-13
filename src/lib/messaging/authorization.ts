import "server-only";

/**
 * Centralized authorization policy for the internal messaging platform.
 *
 * Rules:
 * - Default deny: no active membership means no access.
 * - Org boundary: participant orgId must match conversation orgId.
 * - DM constraints: governance actions (rename, visibility, participant management) are disallowed.
 * - Archived conversations: ordinary mutations blocked; reads allowed.
 * - Locked conversations: ordinary mutations blocked; reads allowed.
 * - Governance actions (archive, rename, visibility, participant management) require OWNER or ADMIN.
 * - Archived conversations also block governance (unarchive is not yet implemented).
 *
 * This module is pure: it does not call the database.
 * Callers are responsible for fetching the conversation and participant records.
 */

import type {
  ConversationRecord,
  ConversationParticipantRecord,
  ConversationParticipantRole,
} from "./domain-types";
import {
  participantIsActive,
  conversationIsDM,
  conversationIsArchived,
  conversationIsLocked,
} from "./domain-types";

// ─── Access action types ──────────────────────────────────────────────────────

export type ConversationAction =
  | "READ"
  | "SEND_MESSAGE"
  | "EDIT_MESSAGE"
  | "DELETE_MESSAGE"
  | "ADD_REACTION"
  | "REMOVE_REACTION"
  | "CREATE_THREAD"
  | "REPLY_TO_THREAD"
  | "RESOLVE_THREAD"
  | "UPDATE_READ_STATE"
  | "ACKNOWLEDGE_MENTION"
  | "LIST_PARTICIPANTS"
  | "ARCHIVE"
  | "RENAME"
  | "CHANGE_VISIBILITY"
  | "ADD_PARTICIPANT"
  | "REMOVE_PARTICIPANT"
  | "CHANGE_PARTICIPANT_ROLE";

// ─── Authorization result ─────────────────────────────────────────────────────

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * Return true if the role is considered an elevated governance role.
 */
export function roleCanGovern(role: ConversationParticipantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

// ─── Action categorization ────────────────────────────────────────────────────

/** Actions that modify conversation state and require governance role. */
const GOVERNANCE_ACTIONS: readonly ConversationAction[] = [
  "ARCHIVE",
  "RENAME",
  "CHANGE_VISIBILITY",
  "ADD_PARTICIPANT",
  "REMOVE_PARTICIPANT",
  "CHANGE_PARTICIPANT_ROLE",
];

/** Actions that are ordinary member mutations blocked by archived/locked. */
const ORDINARY_MUTATIONS: readonly ConversationAction[] = [
  "SEND_MESSAGE",
  "EDIT_MESSAGE",
  "DELETE_MESSAGE",
  "ADD_REACTION",
  "REMOVE_REACTION",
  "CREATE_THREAD",
  "REPLY_TO_THREAD",
  "RESOLVE_THREAD",
];

/** Actions disallowed on DM conversations. */
const NON_DM_ACTIONS: readonly ConversationAction[] = [
  "RENAME",
  "CHANGE_VISIBILITY",
  "ADD_PARTICIPANT",
  "REMOVE_PARTICIPANT",
  "CHANGE_PARTICIPANT_ROLE",
];

// ─── Policy evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a participant may perform an action on a conversation.
 *
 * This is the single source of truth for Sprint 3.1 authorization decisions.
 */
export function evaluateConversationAccess(
  conversation: ConversationRecord,
  participant: ConversationParticipantRecord | null,
  action: ConversationAction,
): AuthorizationResult {
  // 1. Default deny: active participation is the normal content boundary.
  if (!participant) {
    return {
      allowed: false,
      reason: "Active participant access required",
    };
  }

  if (!participantIsActive(participant)) {
    return {
      allowed: false,
      reason: "Active participant access required",
    };
  }

  // 2. Org isolation.
  if (participant.orgId !== conversation.orgId) {
    return {
      allowed: false,
      reason: "Org boundary violation",
    };
  }

  // 3. DM-specific constraints.
  if (conversationIsDM(conversation) && NON_DM_ACTIONS.includes(action)) {
    return {
      allowed: false,
      reason: "Not allowed on DM conversations",
    };
  }

  // 4. Ordinary mutations blocked when archived or locked.
  if (ORDINARY_MUTATIONS.includes(action)) {
    if (conversationIsArchived(conversation)) {
      return {
        allowed: false,
        reason: "Conversation is archived",
      };
    }
    if (conversationIsLocked(conversation)) {
      return {
        allowed: false,
        reason: "Conversation is locked",
      };
    }
  }

  // 5. Governance actions require OWNER or ADMIN role.
  if (GOVERNANCE_ACTIONS.includes(action)) {
    if (!roleCanGovern(participant.role)) {
      return {
        allowed: false,
        reason: "Governance action requires OWNER or ADMIN role",
      };
    }

    // Archived conversations block governance (unarchive not yet implemented).
    if (conversationIsArchived(conversation)) {
      return {
        allowed: false,
        reason: "Conversation is archived",
      };
    }
  }

  return {
    allowed: true,
    reason: "Access granted",
  };
}

// ─── Convenience assertions ───────────────────────────────────────────────────

/**
 * Throw a deterministic error if access is not allowed.
 */
export function requireConversationAccess(
  conversation: ConversationRecord,
  participant: ConversationParticipantRecord | null,
  action: ConversationAction,
  context: string,
): void {
  const result = evaluateConversationAccess(conversation, participant, action);
  if (!result.allowed) {
    throw new Error(`${context}: ${result.reason}`);
  }
}

// ─── Read-access helper ───────────────────────────────────────────────────────

/**
 * Determine whether a user may read a conversation.
 * This covers list, detail, message list, participant list, and thread list.
 */
export function canReadConversation(
  conversation: ConversationRecord,
  participant: ConversationParticipantRecord | null,
): boolean {
  return evaluateConversationAccess(conversation, participant, "READ").allowed;
}
