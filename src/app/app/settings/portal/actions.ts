"use server";

import { db } from "@/lib/db";
import { requireOrgContext, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getPortalAccessState, logPortalAccess } from "@/lib/portal-auth";


// ─── Portal settings (read/write) ────────────────────────────────────────────

export async function getPortalSettings(organizationId: string) {
  const { orgId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  return db.orgDefaults.findUnique({
    where: { organizationId },
    select: {
      portalEnabled: true,
      portalHeaderMessage: true,
      portalSupportEmail: true,
      portalSupportPhone: true,
    },
  });
}

export async function updatePortalSettings({
  organizationId,
  portalEnabled,
  portalHeaderMessage,
  portalSupportEmail,
  portalSupportPhone,
}: {
  organizationId: string;
  portalEnabled: boolean;
  portalHeaderMessage: string;
  portalSupportEmail: string;
  portalSupportPhone: string;
}) {
  const { orgId, userId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  await db.orgDefaults.upsert({
    where: { organizationId },
    create: {
      organizationId,
      portalEnabled,
      portalHeaderMessage: portalHeaderMessage || null,
      portalSupportEmail: portalSupportEmail || null,
      portalSupportPhone: portalSupportPhone || null,
    },
    update: {
      portalEnabled,
      portalHeaderMessage: portalHeaderMessage || null,
      portalSupportEmail: portalSupportEmail || null,
      portalSupportPhone: portalSupportPhone || null,
    },
  });

  if (!portalEnabled) {
    await revokeAllPortalTokens(orgId);
  }

  logAudit({
    orgId,
    actorId: userId,
    action: "portal.settings_updated",
    entityType: "Organization",
    entityId: orgId,
    metadata: { portalEnabled },
  }).catch(() => {});
}

// ─── Portal policies ──────────────────────────────────────────────────────────

export async function getPortalPolicies(organizationId: string) {
  const { orgId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  return db.orgDefaults.findUnique({
    where: { organizationId },
    select: {
      portalMagicLinkExpiryHours: true,
      portalSessionExpiryHours: true,
      portalProofUploadEnabled: true,
      portalTicketCreationEnabled: true,
      portalStatementEnabled: true,
      portalQuoteAcceptanceEnabled: true,
    },
  });
}

export async function updatePortalPolicies(
  organizationId: string,
  policies: {
    portalMagicLinkExpiryHours?: number;
    portalSessionExpiryHours?: number;
    portalProofUploadEnabled?: boolean;
    portalTicketCreationEnabled?: boolean;
    portalStatementEnabled?: boolean;
    portalQuoteAcceptanceEnabled?: boolean;
  },
) {
  const { orgId, userId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  // Clamp expiry hours to sensible bounds
  const magicExpiry = policies.portalMagicLinkExpiryHours
    ? Math.min(Math.max(policies.portalMagicLinkExpiryHours, 1), 168)
    : undefined;
  const sessionExpiry = policies.portalSessionExpiryHours
    ? Math.min(Math.max(policies.portalSessionExpiryHours, 1), 720)
    : undefined;

  await db.orgDefaults.upsert({
    where: { organizationId },
    create: { organizationId, ...policies, portalMagicLinkExpiryHours: magicExpiry ?? 24, portalSessionExpiryHours: sessionExpiry ?? 24 },
    update: {
      ...(magicExpiry !== undefined && { portalMagicLinkExpiryHours: magicExpiry }),
      ...(sessionExpiry !== undefined && { portalSessionExpiryHours: sessionExpiry }),
      ...(policies.portalProofUploadEnabled !== undefined && { portalProofUploadEnabled: policies.portalProofUploadEnabled }),
      ...(policies.portalTicketCreationEnabled !== undefined && { portalTicketCreationEnabled: policies.portalTicketCreationEnabled }),
      ...(policies.portalStatementEnabled !== undefined && { portalStatementEnabled: policies.portalStatementEnabled }),
      ...(policies.portalQuoteAcceptanceEnabled !== undefined && { portalQuoteAcceptanceEnabled: policies.portalQuoteAcceptanceEnabled }),
    },
  });

  logAudit({
    orgId,
    actorId: userId,
    action: "portal.policies_updated",
    entityType: "Organization",
    entityId: orgId,
    metadata: policies,
  }).catch(() => {});
}

// ─── Access logs ──────────────────────────────────────────────────────────────

export async function getPortalAccessLogs(
  organizationId: string,
  filters?: {
    customerId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
    path?: string;
    statusCode?: number;
  },
) {
  const { orgId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;

  let fromDateObj: Date | undefined;
  if (filters?.fromDate && !isNaN(Date.parse(filters.fromDate))) {
    fromDateObj = new Date(filters.fromDate);
  }

  let toDateObj: Date | undefined;
  if (filters?.toDate && !isNaN(Date.parse(filters.toDate))) {
    toDateObj = new Date(filters.toDate);
    toDateObj.setUTCHours(23, 59, 59, 999);
  }

  const where = {
    orgId: organizationId,
    ...(filters?.customerId && { customerId: filters.customerId }),
    ...(filters?.action && { action: filters.action }),
    ...(filters?.path && { path: { contains: filters.path, mode: "insensitive" as const } }),
    ...(filters?.statusCode !== undefined && { statusCode: filters.statusCode }),
    ...((fromDateObj || toDateObj) && {
      accessedAt: {
        ...(fromDateObj && { gte: fromDateObj }),
        ...(toDateObj && { lte: toDateObj }),
      },
    }),
  };

  const [logs, total] = await Promise.all([
    db.customerPortalAccessLog.findMany({
      where,
      orderBy: { accessedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    }),
    db.customerPortalAccessLog.count({ where }),
  ]);

  return { logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── Session management ───────────────────────────────────────────────────────

export async function getActivePortalSessions(organizationId: string) {
  const { orgId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  const sessions = await db.customerPortalSession.findMany({
    where: {
      orgId: organizationId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  return sessions;
}

export async function revokeCustomerPortalAccess(
  organizationId: string,
  customerId: string,
) {
  const { orgId, userId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  // Verify customer belongs to org (anti-IDOR)
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, name: true },
  });
  if (!customer) throw new Error("Customer not found");

  const now = new Date();
  const [revokedTokens, revokedSessions] = await Promise.all([
    db.customerPortalToken.updateMany({
      where: { customerId, orgId: organizationId, isRevoked: false },
      data: { isRevoked: true },
    }),
    db.customerPortalSession.updateMany({
      where: { customerId, orgId: organizationId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  logPortalAccess({
    orgId: organizationId,
    customerId,
    path: "/app/settings/portal",
    action: "access_revoked",
  });

  logAudit({
    orgId,
    actorId: userId,
    action: "portal.customer_access_revoked",
    entityType: "Customer",
    entityId: customerId,
    metadata: {
      customerName: customer.name,
      revokedTokens: revokedTokens.count,
      revokedSessions: revokedSessions.count,
    },
  }).catch(() => {});

  return {
    customerId,
    revokedTokens: revokedTokens.count,
    revokedSessions: revokedSessions.count,
  };
}

export async function revokeAllPortalTokens(organizationId: string) {
  const { orgId, userId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  const now = new Date();
  const [revokedTokens, revokedSessions] = await Promise.all([
    db.customerPortalToken.updateMany({
      where: { orgId: organizationId, isRevoked: false },
      data: { isRevoked: true },
    }),
    db.customerPortalSession.updateMany({
      where: { orgId: organizationId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  logAudit({
    orgId,
    actorId: userId,
    action: "portal.all_access_revoked",
    entityType: "Organization",
    entityId: orgId,
    metadata: {
      revokedTokens: revokedTokens.count,
      revokedSessions: revokedSessions.count,
    },
  }).catch(() => {});

  return {
    revokedCount: revokedTokens.count + revokedSessions.count,
    revokedTokens: revokedTokens.count,
    revokedSessions: revokedSessions.count,
  };
}

// ─── Customer Portal Access / Onboarding Lifecycle Status Action ─────────────

export async function getPortalCustomersWithAccessState(organizationId: string) {
  const { orgId } = await requireOrgContext();
  await requireRole("admin");
  if (orgId !== organizationId) throw new Error("Unauthorized");

  // Retrieve organization default settings
  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId },
    select: { portalEnabled: true },
  });
  const portalEnabled = orgDefaults?.portalEnabled ?? false;

  const customers = await db.customer.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      taxId: true,
      gstin: true,
      lifecycleStage: true,
      clientHubLifecycle: {
        select: {
          enabled: true,
          latestInviteSentAt: true,
          latestInviteEmail: true,
          inviteSentCount: true,
          publicAccessHandle: true,
        },
      },
      portalTokens: {
        select: {
          createdAt: true,
          expiresAt: true,
          isRevoked: true,
          lastUsedAt: true,
        },
      },
      portalSessions: {
        select: {
          revokedAt: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return customers.map((c) => {
    // compute access state
    const accessState = getPortalAccessState({
      portalEnabled,
      lifecycleEnabled: c.clientHubLifecycle?.enabled ?? false,
      latestInviteSentAt: c.clientHubLifecycle?.latestInviteSentAt ?? null,
      inviteSentCount: c.clientHubLifecycle?.inviteSentCount ?? 0,
      tokens: c.portalTokens,
      sessions: c.portalSessions,
    });

    const blockers: string[] = [];
    if (!portalEnabled) {
      blockers.push("Portal is disabled for organization");
    }
    if (!c.name || c.name.trim().length === 0) {
      blockers.push("Customer name is required");
    }
    if (!c.email || c.email.trim().length === 0) {
      blockers.push("Customer email is required");
    }
    if (!c.phone || c.phone.trim().length === 0) {
      blockers.push("Customer phone is required");
    }
    if (!c.address || c.address.trim().length === 0) {
      blockers.push("Customer address is required");
    }
    if ((!c.taxId || c.taxId.trim().length === 0) && (!c.gstin || c.gstin.trim().length === 0)) {
      blockers.push("Customer tax/GSTIN identifier is required");
    }
    const inviteEligible = portalEnabled && blockers.length === 0;

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      accessState,
      clientHubLifecycle: c.clientHubLifecycle,
      inviteEligible,
      blockers,
    };
  });
}

