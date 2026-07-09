import { requireOrgContext } from "@/lib/auth";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import { getMessagingAccessContext, hasMessagingPermission } from "@/lib/messaging/messaging-access-context";
import { MessagingAccessContextError } from "@/lib/messaging/errors";
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

  let hasMessagingAccess = false;
  try {
    const accessCtx = await getMessagingAccessContext(
      context.orgId,
      context.userId,
      context.role,
    );
    hasMessagingAccess = hasMessagingPermission(
      accessCtx,
      MESSAGING_RESOURCE,
      MESSAGING_ACTIONS.READ,
    );
  } catch (err) {
    if (err instanceof MessagingAccessContextError) {
      hasMessagingAccess = false;
    } else {
      throw err;
    }
  }

  if (!hasMessagingAccess) {
    return <MessagingAccessDenied />;
  }

  return <MessagingWorkspace />;
}
