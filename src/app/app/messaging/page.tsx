import { requireOrgContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/rbac/permissions";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import { MessagingWorkspace } from "./messaging-workspace";
import { MessagingAccessDenied } from "./messaging-access-denied";

export const metadata = {
  title: "Messaging — Slipwise",
};

/**
 * Messaging page — Sprint 11.3 workspace entry gating.
 *
 * Server-side permission check before rendering the workspace.
 * Users without messaging:read permission see an access-denied state
 * instead of the workspace shell.
 */
export default async function MessagingPage() {
  const context = await requireOrgContext();

  const hasMessagingAccess = hasPermission(
    { systemRole: context.role },
    MESSAGING_RESOURCE,
    MESSAGING_ACTIONS.READ,
  );

  if (!hasMessagingAccess) {
    return <MessagingAccessDenied />;
  }

  return <MessagingWorkspace />;
}
