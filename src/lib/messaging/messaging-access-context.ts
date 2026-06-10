import "server-only";

/**
 * Messaging Access Context — Sprint 11.3
 *
 * Builds a proper AccessContext with custom-role permissions by fetching
 * the Member's customRoleId → CustomRole.permissions from the database.
 *
 * This replaces the broken pattern of using { systemRole: context.role }
 * which ignores custom role permissions entirely.
 */

import { db } from "@/lib/db";
import { getOrgContext, type OrgContext } from "@/lib/auth";
import {
  hasPermission,
  type AccessContext,
  type PermissionSet,
  type Resource,
  type ResourceAction,
} from "@/lib/auth/rbac/permissions";

import { MessagingAccessContextError } from "./errors";

/**
 * Messaging-specific access context that carries both the org context
 * and a properly-built AccessContext including custom permissions.
 */
export interface MessagingAccessContext {
  orgCtx: OrgContext;
  accessCtx: AccessContext;
}

/**
 * Build an AccessContext for a user in an org, including their custom role permissions.
 *
 * Resolution:
 * 1. Get the basic OrgContext (userId, orgId, system role)
 * 2. Fetch the Member record with customRoleId → CustomRole.permissions
 * 3. Build AccessContext with systemRole + customPermissions
 *
 * Owner/Admin roles bypass custom permission checks (they have all permissions),
 * so we skip the DB fetch for them for performance.
 */
export async function getMessagingAccessContext(
  orgId: string,
  userId: string,
  systemRole: string,
): Promise<AccessContext> {
  // Owner and admin have full access — skip custom role lookup
  if (systemRole === "owner" || systemRole === "admin") {
    return { systemRole };
  }

  if (!db.member || typeof db.member.findUnique !== "function") {
    throw new MessagingAccessContextError("Messaging access context: membership database infrastructure unavailable");
  }

  const member = await db.member.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId },
    },
    select: {
      customRole: {
        select: { permissions: true },
      },
    },
  });

  if (!member) {
    throw new MessagingAccessContextError("Messaging access context: member not found");
  }

  const customPermissions = member.customRole?.permissions as PermissionSet | undefined;

  return {
    systemRole,
    customPermissions: customPermissions ?? null,
  };
}

/**
 * Require a messaging-specific access context (with auth + custom-role resolution).
 * Returns both the OrgContext and the AccessContext.
 *
 * Throws 401 if not authenticated, 403 if no org.
 */
export async function requireMessagingAccessContext(): Promise<MessagingAccessContext> {
  const orgCtx = await getOrgContext();

  if (!orgCtx) {
    throw new Error("Unauthorized");
  }

  const accessCtx = await getMessagingAccessContext(
    orgCtx.orgId,
    orgCtx.userId,
    orgCtx.role,
  );

  return { orgCtx, accessCtx };
}

/**
 * Check a messaging permission against the user's resolved access context
 * (including custom role permissions).
 */
export function hasMessagingPermission(
  accessCtx: AccessContext,
  resource: Resource,
  action: ResourceAction,
): boolean {
  return hasPermission(accessCtx, resource, action);
}
