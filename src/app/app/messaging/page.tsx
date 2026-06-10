import { requireOrgContext } from "@/lib/auth";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import { getMessagingAccessContext, hasMessagingPermission } from "@/lib/messaging/messaging-access-context";
import { MessagingWorkspace } from "./messaging-workspace";
import { MessagingAccessDenied } from "./messaging-access-denied";

export const metadata = {
  title: "Messaging — Slipwise",
};

/**
 * Messaging page — Sprint 11.3 workspace entry gating.
 *
 * Server-side permission check before rendering the workspace.
 * Uses custom-role-aware access context to properly evaluate permissions
 * for users with custom roles assigned.
 * Users without messaging:read permission see an access-denied state
 * instead of the workspace shell.
 */
export default async function MessagingPage() {
  const context = await requireOrgContext();
  const accessCtx = await getMessagingAccessContext(
    context.orgId,
    context.userId,
    context.role,
  );

  const hasMessagingAccess = hasMessagingPermission(
    accessCtx,
    MESSAGING_RESOURCE,
    MESSAGING_ACTIONS.READ,
  );

  if (!hasMessagingAccess) {
    return <MessagingAccessDenied />;
  }

  return <MessagingWorkspace />;
}
