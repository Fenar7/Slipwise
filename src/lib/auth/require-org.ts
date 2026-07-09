import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSsoLoginPathForUser } from "@/lib/sso";

export interface OrgContext {
  userId: string;
  orgId: string;
  role: string;
  representedId: string | null;
  proxyGrantId: string | null;
  proxyScope: string[];
}

export interface MarketplaceModeratorContext {
  userId: string;
  orgId: string | null;
  role: string | null;
}

export interface MarketplaceFinanceContext {
  userId: string;
  orgId: string | null;
  role: string | null;
}

export type AuthRoutingContext =
  | { isAuthenticated: false; loginPath?: string }
  | {
      isAuthenticated: true;
      userId: string;
      hasOrg: false;
      userName?: string | null;
      userEmail?: string | null;
      avatarUrl?: string | null;
    }
  | {
      isAuthenticated: true;
      userId: string;
      hasOrg: true;
      orgId: string;
      orgName: string;
      orgSlug: string;
      role: string;
      representedId: string | null;
      proxyGrantId: string | null;
      proxyScope: string[];
      userName?: string | null;
      userEmail?: string | null;
      avatarUrl?: string | null;
    };

const ROLE_LEVELS: Record<string, number> = {
  deactivated: -1,
  viewer: 10,
  member: 10,
  voucher_operator: 20,
  invoice_operator: 20,
  hr_manager: 40,
  finance_manager: 40,
  admin: 80,
  co_owner: 90,
  owner: 100,
};

function isActiveMemberRole(role: string): boolean {
  return (ROLE_LEVELS[role] ?? -1) >= 0;
}

export async function getAuthContext(req?: any): Promise<any> {
  return getAuthRoutingContext();
}

export async function getAuthRoutingContext(): Promise<AuthRoutingContext> {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { isAuthenticated: false };
  }

  const [preference, members] = await Promise.all([
    db.userOrgPreference.findUnique({
      where: { userId: user.id },
      select: { activeOrgId: true },
    }),
    db.member.findMany({
      where: { userId: user.id },
      select: {
        organizationId: true,
        role: true,
        organization: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const preferredMember = preference
    ? members.find((member) => member.organizationId === preference.activeOrgId) ?? null
    : null;

  const member = preferredMember ?? members[0];

  if (!member) {
    return {
      isAuthenticated: true,
      userId: user.id,
      hasOrg: false,
      userName:
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null,
      userEmail: user.email ?? null,
      avatarUrl:
        typeof user.user_metadata?.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : null,
    };
  }

  if (!isActiveMemberRole(member.role)) {
    return {
      isAuthenticated: false,
      loginPath: "/auth/login?error=membership_inactive",
    };
  }

  const loginPath = await getSsoLoginPathForUser(
    member.organizationId,
    member.organization.slug,
    user.id,
    member.role,
  );

  if (loginPath) {
    return {
      isAuthenticated: false,
      loginPath,
    };
  }

  const activeProxyGrant = await db.proxyGrant.findFirst({
    where: {
      orgId: member.organizationId,
      actorId: user.id,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      representedId: true,
      scope: true,
    },
  });

  return {
    isAuthenticated: true,
    userId: user.id,
    hasOrg: true,
    orgId: member.organizationId,
    orgName: member.organization.name,
    orgSlug: member.organization.slug,
    role: member.role,
    representedId: activeProxyGrant?.representedId ?? null,
    proxyGrantId: activeProxyGrant?.id ?? null,
    proxyScope: activeProxyGrant?.scope ?? [],
    userName:
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null,
    userEmail: user.email ?? null,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null,
  };
}

/**
 * Get the current user's organization context.
 * Throws if user is not authenticated or not a member of any organization.
 * 
 * Use in server actions:
 * ```
 * const { userId, orgId } = await requireOrgContext();
 * ```
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getAuthRoutingContext();

  if (!context.isAuthenticated) {
    redirect(context.loginPath ?? "/auth/login");
  }

  if (!context.hasOrg) {
    redirect("/onboarding");
  }

  return {
    userId: context.userId,
    orgId: context.orgId,
    role: context.role,
    representedId: context.representedId,
    proxyGrantId: context.proxyGrantId,
    proxyScope: context.proxyScope,
  };
}

/**
 * Get organization context without redirecting.
 * Returns null if user is not authenticated or has no org.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  try {
    const context = await getAuthRoutingContext();

    if (!context.isAuthenticated || !context.hasOrg) {
      return null;
    }

    return {
      userId: context.userId,
      orgId: context.orgId,
      role: context.role,
      representedId: context.representedId,
      proxyGrantId: context.proxyGrantId,
      proxyScope: context.proxyScope,
    };
  } catch (e) {
    console.error("Error in getOrgContext:", e);
    return null;
  }
}

/**
 * Check if user has required role.
 * Roles: owner > admin > member
 */
export function hasRole(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_LEVELS[userRole] ?? -1;
  const requiredLevel = ROLE_LEVELS[requiredRole] ?? Number.MAX_SAFE_INTEGER;
  return userLevel >= requiredLevel;
}

function getMarketplaceModeratorUserIds(): string[] {
  return (process.env.MARKETPLACE_MODERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getMarketplaceFinanceUserIds(): string[] {
  return (process.env.MARKETPLACE_FINANCE_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isMarketplaceModeratorUser(userId: string): boolean {
  return getMarketplaceModeratorUserIds().includes(userId);
}

export function isMarketplaceFinanceUser(userId: string): boolean {
  return getMarketplaceFinanceUserIds().includes(userId);
}

/**
 * Require a specific role, throw if insufficient permissions.
 */
export async function requireRole(requiredRole: string): Promise<OrgContext> {
  const context = await requireOrgContext();
  
  if (!hasRole(context.role, requiredRole)) {
    throw new Error(`Insufficient permissions. Required: ${requiredRole}, Have: ${context.role}`);
  }
  
  return context;
}

export async function requireMarketplaceModerator(): Promise<MarketplaceModeratorContext> {
  const context = await getAuthRoutingContext();

  if (!context.isAuthenticated) {
    redirect(context.loginPath ?? "/auth/login");
  }

  if (!isMarketplaceModeratorUser(context.userId)) {
    throw new Error("Marketplace moderation access denied");
  }

  return {
    userId: context.userId,
    orgId: context.hasOrg ? context.orgId : null,
    role: context.hasOrg ? context.role : null,
  };
}

export async function requireMarketplaceFinance(): Promise<MarketplaceFinanceContext> {
  const context = await getAuthRoutingContext();

  if (!context.isAuthenticated) {
    redirect("/auth/login");
  }

  if (!isMarketplaceFinanceUser(context.userId)) {
    throw new Error("Marketplace finance access denied");
  }

  return {
    userId: context.userId,
    orgId: context.hasOrg ? context.orgId : null,
    role: context.hasOrg ? context.role : null,
  };
}

export async function requireMarketplacePublisherAdmin(): Promise<OrgContext> {
  return requireRole("admin");
}

export async function requireMarketplaceFinanceOrModerator(): Promise<MarketplaceFinanceContext> {
  const context = await getAuthRoutingContext();

  if (!context.isAuthenticated) {
    redirect("/auth/login");
  }

  if (
    !isMarketplaceFinanceUser(context.userId) &&
    !isMarketplaceModeratorUser(context.userId)
  ) {
    throw new Error("Marketplace payout operator access denied");
  }

  return {
    userId: context.userId,
    orgId: context.hasOrg ? context.orgId : null,
    role: context.hasOrg ? context.role : null,
  };
}

function getPlatformAdminUserIds(): string[] {
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isPlatformAdminUser(userId: string): boolean {
  return getPlatformAdminUserIds().includes(userId);
}

/**
 * Require the caller to be a platform admin (not a tenant org admin).
 * Used for partner governance, global admin surfaces, and cross-org operations.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const context = await getAuthRoutingContext();

  if (!context.isAuthenticated) {
    redirect("/auth/login");
  }

  if (!isPlatformAdminUser(context.userId)) {
    throw new Error("Platform admin access required");
  }

  return { userId: context.userId };
}
