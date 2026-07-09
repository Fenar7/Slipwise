/**
 * RBAC Permission Engine — Phase 28 Sprint 28.3
 *
 * Defines granular permissions and evaluates access based on
 * system roles (owner/admin/member) and custom roles.
 */

// ─── Permission Definitions ───────────────────────────────────────────────────

export const RESOURCE_ACTIONS = ["create", "read", "update", "delete"] as const;
export type ResourceAction = (typeof RESOURCE_ACTIONS)[number];

export const RESOURCES = [
  "invoices",
  "quotes",
  "bills",
  "payments",
  "payroll",
  "employees",
  "customers",
  "vendors",
  "templates",
  "reports",
  "settings",
  "billing",
  "integrations",
  "audit",
  "intel",
  "inventory",
  "procurement",
  "tags",
] as const;
export type Resource = (typeof RESOURCES)[number];

export type Permission = `${Resource}:${ResourceAction}`;

/**
 * Structured permission set stored as JSON in CustomRole.permissions.
 * Each key is a Resource, value is an array of allowed actions.
 */
export type PermissionSet = Partial<Record<Resource, ResourceAction[]>>;

// ─── System Role Hierarchy ────────────────────────────────────────────────────

export type SystemRole = "owner" | "admin" | "member";

const ROLE_HIERARCHY: Record<string, number> = {
  deactivated: -1,
  viewer: 10,
  owner: 100,
  co_owner: 90,
  admin: 80,
  finance_manager: 40,
  hr_manager: 40,
  invoice_operator: 20,
  voucher_operator: 20,
  member: 10,
};

/**
 * System roles inherit ALL permissions of lower roles.
 * Owner: full access to everything
 * Admin: full access except org deletion / ownership transfer
 * Member: read-only by default unless custom role grants more
 */
const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, PermissionSet> = {
  owner: Object.fromEntries(
    RESOURCES.map((r) => [r, [...RESOURCE_ACTIONS]])
  ) as PermissionSet,
  admin: Object.fromEntries(
    RESOURCES.map((r) => [r, [...RESOURCE_ACTIONS]])
  ) as PermissionSet,
  member: {
    invoices: ["read"],
    quotes: ["read"],
    bills: ["read"],
    payments: ["read"],
    customers: ["read"],
    vendors: ["read"],
    templates: ["read"],
    reports: ["read"],
    intel: ["read"],
    inventory: ["read"],
  },
};

// ─── Permission Checking ──────────────────────────────────────────────────────

export interface AccessContext {
  systemRole: string;
  customPermissions?: PermissionSet | null;
}

/**
 * Check if a user has a specific permission.
 *
 * Resolution order:
 * 1. Owner/Admin bypass — they have all permissions
 * 2. Custom role permissions override system member defaults
 * 3. System member defaults as fallback
 */
export function hasPermission(
  ctx: AccessContext,
  resource: Resource,
  action: ResourceAction
): boolean {
  const role = ctx.systemRole as SystemRole;

  // Owner and admin have full access
  if (role === "owner" || role === "admin") {
    return true;
  }

  // If custom role permissions are provided, use them exclusively
  if (ctx.customPermissions) {
    const allowed = ctx.customPermissions[resource];
    return Array.isArray(allowed) && allowed.includes(action);
  }

  // Fall back to system member defaults
  const defaults = SYSTEM_ROLE_PERMISSIONS[role] ?? SYSTEM_ROLE_PERMISSIONS.member;
  const allowed = defaults[resource];
  return Array.isArray(allowed) && allowed.includes(action);
}

/**
 * Check if a user has ALL of the specified permissions.
 */
export function hasAllPermissions(
  ctx: AccessContext,
  checks: Array<{ resource: Resource; action: ResourceAction }>
): boolean {
  return checks.every((c) => hasPermission(ctx, c.resource, c.action));
}

/**
 * Check if a user has ANY of the specified permissions.
 */
export function hasAnyPermission(
  ctx: AccessContext,
  checks: Array<{ resource: Resource; action: ResourceAction }>
): boolean {
  return checks.some((c) => hasPermission(ctx, c.resource, c.action));
}

/**
 * Get the effective permission set for a user, merging system + custom.
 */
export function getEffectivePermissions(ctx: AccessContext): PermissionSet {
  const role = ctx.systemRole as SystemRole;

  if (role === "owner" || role === "admin") {
    return SYSTEM_ROLE_PERMISSIONS[role];
  }

  if (ctx.customPermissions) {
    return ctx.customPermissions;
  }

  return SYSTEM_ROLE_PERMISSIONS.member;
}

/**
 * Validate that a permission set is well-formed.
 * Used when creating/updating custom roles.
 */
export function validatePermissionSet(
  permissions: unknown
): { valid: true; data: PermissionSet } | { valid: false; error: string } {
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
    return { valid: false, error: "Permissions must be an object" };
  }

  const result: PermissionSet = {};
  const resourceSet = new Set<string>(RESOURCES);
  const actionSet = new Set<string>(RESOURCE_ACTIONS);

  for (const [key, value] of Object.entries(permissions)) {
    if (!resourceSet.has(key)) {
      return { valid: false, error: `Unknown resource: ${key}` };
    }
    if (!Array.isArray(value)) {
      return { valid: false, error: `Actions for ${key} must be an array` };
    }
    for (const action of value) {
      if (!actionSet.has(action)) {
        return { valid: false, error: `Unknown action '${action}' on ${key}` };
      }
    }
    result[key as Resource] = [...new Set(value as ResourceAction[])];
  }

  return { valid: true, data: result };
}

/**
 * Compare role hierarchy for authorization decisions.
 * Returns true if actor's role is >= target's role.
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  const actorLevel = ROLE_HIERARCHY[actorRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
  return actorLevel > targetLevel;
}
