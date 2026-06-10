"use server";

/**
 * Messaging permission server actions — Sprint 11.3
 *
 * Provides server-side permission evaluation that the UI can consume
 * to gate actions appropriately. Backend enforcement remains the source
 * of truth; these actions are for UI shaping only.
 *
 * Uses custom-role-aware access context to properly evaluate permissions
 * for users with custom roles assigned.
 */

import { requireOrgContext } from "@/lib/auth";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import { getMessagingAccessContext, hasMessagingPermission } from "@/lib/messaging/messaging-access-context";

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
  const accessCtx = await getMessagingAccessContext(
    context.orgId,
    context.userId,
    context.role,
  );

  return {
    canAccessWorkspace: hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ),
    canRead: hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ),
    canSend: hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE),
    canManage: hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE),
    canGovern: hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.DELETE),
  };
}
