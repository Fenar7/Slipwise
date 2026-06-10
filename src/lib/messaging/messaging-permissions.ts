import "server-only";

/**
 * Messaging Permission Layer — Sprint 11.3
 *
 * Maps RBAC permissions to messaging-specific capabilities.
 * This is the single source of truth for whether a user can perform
 * a messaging action based on their org role and custom permissions.
 *
 * Permission model:
 * - messaging:read    → workspace access + list/read conversations
 * - messaging:create  → send messages + create conversations
 * - messaging:update  → manage conversations (rename, add/remove participants, etc.)
 * - messaging:delete  → governance actions (archive, lock, etc.)
 *
 * Portal-visible actions require stricter checks than internal-only actions.
 * Custom roles can grant/granularly control these permissions.
 */

import {
  hasPermission,
  type AccessContext,
  type Resource,
  type ResourceAction,
} from "@/lib/auth/rbac/permissions";

// ─── Messaging capability types ──────────────────────────────────────────────

export type MessagingCapability =
  | "workspace_access"
  | "read"
  | "send"
  | "portal_send"
  | "manage"
  | "governance";

/**
 * Result of a messaging permission evaluation.
 */
export interface MessagingPermissionResult {
  allowed: boolean;
  reason: string;
}

// ─── Permission → Capability mapping ─────────────────────────────────────────

/**
 * Map a messaging capability to the RBAC permission required.
 * Each capability maps to a single resource:action pair.
 */
const CAPABILITY_TO_PERMISSION: Record<MessagingCapability, { resource: Resource; action: ResourceAction }> = {
  workspace_access: { resource: "messaging", action: "read" },
  read: { resource: "messaging", action: "read" },
  send: { resource: "messaging", action: "create" },
  portal_send: { resource: "messaging", action: "create" },
  manage: { resource: "messaging", action: "update" },
  governance: { resource: "messaging", action: "delete" },
};

// ─── Core evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a user has a specific messaging capability.
 *
 * This checks the RBAC permission system, not conversation-level participation.
 * Conversation-level authorization is handled by the existing authorization.ts module.
 */
export function evaluateMessagingCapability(
  ctx: AccessContext,
  capability: MessagingCapability,
): MessagingPermissionResult {
  const { resource, action } = CAPABILITY_TO_PERMISSION[capability];

  if (hasPermission(ctx, resource, action)) {
    return { allowed: true, reason: "permission granted" };
  }

  return {
    allowed: false,
    reason: `missing messaging permission: ${resource}:${action}`,
  };
}

/**
 * Check if a user has workspace access (can enter the messaging workspace).
 */
export function canAccessMessagingWorkspace(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "workspace_access").allowed;
}

/**
 * Check if a user can read conversations (list, view detail, view messages).
 */
export function canReadMessaging(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "read").allowed;
}

/**
 * Check if a user can send messages (create messages, reply to threads).
 */
export function canSendMessage(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "send").allowed;
}

/**
 * Check if a user can send portal-visible replies.
 * Currently requires the same permission as internal send,
 * but separated for future stricter portal-specific gating.
 */
export function canSendPortalReply(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "portal_send").allowed;
}

/**
 * Check if a user can manage conversations (rename, add/remove participants, etc.).
 */
export function canManageMessaging(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "manage").allowed;
}

/**
 * Check if a user can perform governance actions (archive, lock, etc.).
 */
export function canGovernMessaging(ctx: AccessContext): boolean {
  return evaluateMessagingCapability(ctx, "governance").allowed;
}

// ─── Convenience: evaluate all capabilities at once ──────────────────────────

/**
 * Evaluate all messaging capabilities for a user.
 * Useful for UI gating where multiple capabilities need to be checked.
 */
export function evaluateAllMessagingCapabilities(
  ctx: AccessContext,
): Record<MessagingCapability, boolean> {
  const result: Record<string, boolean> = {};
  for (const cap of Object.keys(CAPABILITY_TO_PERMISSION) as MessagingCapability[]) {
    result[cap] = evaluateMessagingCapability(ctx, cap).allowed;
  }
  return result as Record<MessagingCapability, boolean>;
}

// ─── Messaging RBAC resource constants ───────────────────────────────────────

/**
 * The RBAC resource name for messaging.
 * Use this when checking messaging permissions via the RBAC system.
 */
export const MESSAGING_RESOURCE = "messaging" as const;

/**
 * Messaging-specific RBAC actions.
 */
export const MESSAGING_ACTIONS = {
  READ: "read" as const,
  CREATE: "create" as const,
  UPDATE: "update" as const,
  DELETE: "delete" as const,
} as const;
