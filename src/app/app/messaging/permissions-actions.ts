"use server";

/**
 * Messaging permission server actions — Sprint 11.3
 *
 * Provides server-side permission evaluation that the UI can consume
 * to gate actions appropriately. Backend enforcement remains the source
 * of truth; these actions are for UI shaping only.
 */

import { requireOrgContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/rbac/permissions";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";

export type MessagingPermissions = {
  canAccessWorkspace: boolean;
  canRead: boolean;
  canSend: boolean;
  canManage: boolean;
  canGovern: boolean;
};

/**
 * Get the current user's messaging permissions.
 * Used by the UI to shape action availability.
 */
export async function getMessagingPermissions(): Promise<MessagingPermissions> {
  const context = await requireOrgContext();

  const ctx = { systemRole: context.role };

  return {
    canAccessWorkspace: hasPermission(ctx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ),
    canRead: hasPermission(ctx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ),
    canSend: hasPermission(ctx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE),
    canManage: hasPermission(ctx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE),
    canGovern: hasPermission(ctx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.DELETE),
  };
}
