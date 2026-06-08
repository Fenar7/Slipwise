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
 * - Governance actions require OWNER or ADMIN role.
 * - Archived conversations block governance except UNARCHIVE.
 * - Locked conversations block ordinary mutations but not governance.
 * - Org admin / platform admin have narrow operational override for specific actions.
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
  | "UNARCHIVE"
  | "RENAME"
  | "CHANGE_VISIBILITY"
  | "LOCK"
  | "UNLOCK"
  | "ADD_PARTICIPANT"
  | "REMOVE_PARTICIPANT"
  | "CHANGE_PARTICIPANT_ROLE";

// ─── Authorization result ─────────────────────────────────────────────────────

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

// ─── Governance actor ─────────────────────────────────────────────────────────

/**
 * Narrow governance actor descriptor for Sprint 3.2.
 *
 * The policy layer evaluates both conversation-level role and org-level
 * role to determine whether a governance action is permitted.
 */
export interface GovernanceActor {
  /** Conversation participant record, or null if not a member. */
  participant: ConversationParticipantRecord | null;
  /** Org-level role from OrgContext (e.g. "owner", "admin", "member"). */
  orgRole: string;
  /** True if the actor is a platform-level admin. */
  isPlatformAdmin: boolean;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

/**
 * Return true if the role is considered an elevated governance role.
 */
export function roleCanGovern(role: ConversationParticipantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function orgRoleCanGovern(orgRole: string): boolean {
  return orgRole === "owner" || orgRole === "admin";
}

// ─── Action categorization ────────────────────────────────────────────────────

/** Actions that modify conversation state and require governance role. */
const GOVERNANCE_ACTIONS: readonly ConversationAction[] = [
  "ARCHIVE",
  "UNARCHIVE",
  "RENAME",
  "CHANGE_VISIBILITY",
  "LOCK",
  "UNLOCK",
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

/**
 * Governance actions that org admins / platform admins may perform
 * as an operational override.  Narrow by design.
 */
const ADMIN_OVERRIDABLE_ACTIONS: readonly ConversationAction[] = [
  "ARCHIVE",
  "UNARCHIVE",
  "LOCK",
  "UNLOCK",
  "REMOVE_PARTICIPANT",
];

// ─── Governance matrix ────────────────────────────────────────────────────────

/**
 * Formal governance action matrix.
 *
 * Returns who may perform a governance action under normal circumstances
 * (ignoring lifecycle state).  Lifecycle checks are applied separately.
 */
export function governanceMatrix(
  action: ConversationAction,
): { requiresConversationGovernanceRole: boolean; adminOverridable: boolean } {
  const isGovernance = GOVERNANCE_ACTIONS.includes(action);
  const adminOverridable = ADMIN_OVERRIDABLE_ACTIONS.includes(action);
  return {
    requiresConversationGovernanceRole: isGovernance,
    adminOverridable,
  };
}

// ─── Policy evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a participant may perform an action on a conversation.
 *
 * This is the single source of truth for authorization decisions.
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
      reason: "active participant access required",
    };
  }

  if (!participantIsActive(participant)) {
    return {
      allowed: false,
      reason: "active participant access required",
    };
  }

  // 2. Org isolation.
  if (participant.orgId !== conversation.orgId) {
    return {
      allowed: false,
      reason: "org boundary violation",
    };
  }

  // ─── Phase 10 Portal boundaries & validation ───
  if (conversation.type === "PORTAL") {
    // Portal conversations require a customerId scoping.
    if (!conversation.customerId) {
      return {
        allowed: false,
        reason: "portal conversation missing customer identity scoping",
      };
    }

    if (participant.kind === "PORTAL_CLIENT") {
      if (!participant.customerId) {
        return {
          allowed: false,
          reason: "portal client participant missing customer identifier",
        };
      }
      if (conversation.customerId !== participant.customerId) {
        return {
          allowed: false,
          reason: "customer boundary violation for portal client",
        };
      }

      // Restrict actions allowed for external clients
      const allowedClientActions: ConversationAction[] = [
        "READ",
        "SEND_MESSAGE",
        "UPDATE_READ_STATE",
        "ADD_REACTION",
        "REMOVE_REACTION",
      ];
      if (!allowedClientActions.includes(action)) {
        return {
          allowed: false,
          reason: `action ${action} not permitted for portal clients`,
        };
      }

      // CLOSED portal conversation cannot receive new replies from client
      if (action === "SEND_MESSAGE" && conversation.portalState === "CLOSED") {
        return {
          allowed: false,
          reason: "cannot send messages to a closed portal conversation",
        };
      }
    } else if (participant.kind === "INTERNAL_MEMBER") {
      if (!participant.userId) {
        return {
          allowed: false,
          reason: "internal member participant missing user identifier",
        };
      }
    } else {
      return {
        allowed: false,
        reason: "unknown participant kind",
      };
    }
  } else {
    // INTERNAL conversations (CHANNEL, DM, GROUP) must never allow PORTAL_CLIENT participants.
    if (participant.kind === "PORTAL_CLIENT") {
      return {
        allowed: false,
        reason: "portal clients are not allowed in internal conversations",
      };
    }
  }

  // 3. DM-specific constraints.
  if (conversationIsDM(conversation) && NON_DM_ACTIONS.includes(action)) {
    return {
      allowed: false,
      reason: "not allowed on DM conversations",
    };
  }

  // 4. Ordinary mutations blocked when archived or locked.
  if (ORDINARY_MUTATIONS.includes(action)) {
    if (conversationIsArchived(conversation)) {
      return {
        allowed: false,
        reason: "conversation is archived",
      };
    }
    if (conversationIsLocked(conversation)) {
      return {
        allowed: false,
        reason: "conversation is locked",
      };
    }
  }

  // 5. Governance actions require OWNER or ADMIN role.
  if (GOVERNANCE_ACTIONS.includes(action)) {
    if (!roleCanGovern(participant.role)) {
      return {
        allowed: false,
        reason: "governance action requires OWNER or ADMIN role",
      };
    }

    // Archived conversations block governance EXCEPT unarchive.
    // Unarchive is only allowed when the conversation IS archived.
    if (conversationIsArchived(conversation) && action !== "UNARCHIVE") {
      return {
        allowed: false,
        reason: "conversation is archived",
      };
    }
    if (action === "UNARCHIVE" && !conversationIsArchived(conversation)) {
      if (!(conversation.type === "PORTAL" && conversation.portalState === "CLOSED")) {
        return {
          allowed: false,
          reason: "conversation is not archived",
        };
      }
    }

    // Locked conversations block governance EXCEPT unlock.
    // Unlock is only allowed when the conversation IS locked.
    if (conversationIsLocked(conversation) && action !== "UNLOCK") {
      return {
        allowed: false,
        reason: "conversation is locked",
      };
    }
    if (action === "UNLOCK" && !conversationIsLocked(conversation)) {
      return {
        allowed: false,
        reason: "conversation is not locked",
      };
    }
  }

  return {
    allowed: true,
    reason: "access granted",
  };
}

// ─── Governance evaluator with admin/support override ─────────────────────────

/**
 * Evaluate governance access with support for org admin / platform admin
 * operational override.
 *
 * This is the Sprint 3.2 policy evaluator.  It extends
 * evaluateConversationAccess with a narrow override path for
 * admin/support actors.
 *
 * Rules:
 * - Conversation OWNER/ADMIN can perform all governance actions.
 * - Org admin / platform admin can perform a narrow set of operational
 *   actions (archive, unarchive, lock, unlock, remove participant).
 * - All other actors are denied.
 * - Admin override actions are still subject to lifecycle constraints
 *   (e.g. cannot archive an already-archived conversation).
 */
export function evaluateGovernanceAccess(
  conversation: ConversationRecord,
  actor: GovernanceActor,
  action: ConversationAction,
): AuthorizationResult {
  const { participant, orgRole, isPlatformAdmin } = actor;

  if (participant && participant.kind === "PORTAL_CLIENT") {
    return {
      allowed: false,
      reason: "portal clients cannot perform governance actions",
    };
  }

  // First: check conversation-level governance role.
  const participantResult = evaluateConversationAccess(
    conversation,
    participant,
    action,
  );

  if (participantResult.allowed) {
    return participantResult;
  }

  // If denied due to role, check admin override.
  const matrix = governanceMatrix(action);
  if (!matrix.adminOverridable) {
    return participantResult;
  }

  // Admin override requires org-level admin or platform admin.
  const hasAdminAuthority = orgRoleCanGovern(orgRole) || isPlatformAdmin;
  if (!hasAdminAuthority) {
    return participantResult;
  }

  // Admin override still requires org boundary.
  if (participant && participant.orgId !== conversation.orgId) {
    return {
      allowed: false,
      reason: "org boundary violation",
    };
  }

  // Admin override still respects lifecycle constraints.
  if (action === "ARCHIVE" || action === "LOCK") {
    if (conversationIsArchived(conversation)) {
      return {
        allowed: false,
        reason: "conversation is archived",
      };
    }
  }

  if (action === "UNARCHIVE") {
    if (!conversationIsArchived(conversation)) {
      return {
        allowed: false,
        reason: "conversation is not archived",
      };
    }
  }

  if (action === "UNLOCK") {
    if (!conversationIsLocked(conversation)) {
      return {
        allowed: false,
        reason: "conversation is not locked",
      };
    }
  }

  if (action === "LOCK") {
    if (conversationIsLocked(conversation)) {
      return {
        allowed: false,
        reason: "conversation is already locked",
      };
    }
  }

  return {
    allowed: true,
    reason: "access granted via admin override",
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

/**
 * Throw a deterministic error if governance access is not allowed,
 * including admin override evaluation.
 */
export function requireGovernanceAccess(
  conversation: ConversationRecord,
  actor: GovernanceActor,
  action: ConversationAction,
  context: string,
): void {
  const result = evaluateGovernanceAccess(conversation, actor, action);
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
