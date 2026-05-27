"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAuditTx } from "@/lib/audit";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import {
  ClientHubConfig,
  ClientHubConfigSchema,
  ClientHubOverride,
  ClientHubOverrideSchema,
  computeOverrideDiff,
} from "@/app/portal/[orgSlug]/client-hub/components/customization-contract";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import {
  safeValidateHubConfig,
  resolveEffectiveConfig,
} from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";
import { sendEmail, clientHubInviteEmailHtml } from "@/lib/email";

export type ClientHubReadinessStatus = "disabled" | "enabled_not_ready" | "enabled_ready";

export type ClientHubCustomerReadiness = {
  enabled: boolean;
  readinessStatus: ClientHubReadinessStatus;
  previewEligible: boolean;
  inviteEligible: boolean;
  portalReady: boolean;
  blockers: string[];
};

export type ClientHubInviteState = "never_sent" | "sent" | "resent" | "email_changed" | "disabled";

export type ClientHubCustomerAdminState = {
  enabled: boolean;
  readinessStatus: ClientHubReadinessStatus;
  previewEligible: boolean;
  inviteEligible: boolean;
  portalReady: boolean;
  latestInviteSentAt: string | null;
  latestInviteEmail: string | null;
  inviteState: ClientHubInviteState;
  inviteSentCount: number;
  publicAccessHandle: string | null;
  canonicalHubUrl: string | null;
  blockers: string[];
};

export type GetClientHubOrgConfigResult =
  | { success: true; config: ClientHubConfig; isNew: boolean }
  | { success: false; error: string };

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app";
}

function buildCanonicalHubUrl(orgSlug: string, publicAccessHandle?: string | null): string {
  const base = `${getBaseUrl()}/portal/${orgSlug}/client-hub`;
  if (publicAccessHandle) {
    return `${base}?c=${publicAccessHandle}`;
  }
  return base;
}

function generatePublicAccessHandle(): string {
  return randomBytes(16).toString("hex");
}

function computeInviteState(
  lifecycle: {
    enabled: boolean;
    latestInviteSentAt: Date | null;
    latestInviteEmail: string | null;
  } | null,
  currentEmail: string | null
): ClientHubInviteState {
  if (!lifecycle?.enabled) return "disabled";
  if (!lifecycle.latestInviteSentAt) return "never_sent";
  if (!currentEmail || currentEmail.trim().length === 0) return "email_changed";
  if (lifecycle.latestInviteEmail !== currentEmail) return "email_changed";
  return lifecycle.latestInviteEmail === currentEmail && lifecycle.inviteSentCount > 1 ? "resent" : "sent";
}

function computeClientHubAdminState(
  lifecycle: {
    enabled: boolean;
    latestInviteSentAt: Date | null;
    latestInviteEmail: string | null;
    inviteSentCount: number;
    publicAccessHandle: string | null;
  } | null,
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
  },
  orgSlug: string
): ClientHubCustomerAdminState {
  const readiness = computeClientHubReadiness(lifecycle, customer);
  const inviteState = computeInviteState(lifecycle, customer.email);

  return {
    ...readiness,
    latestInviteSentAt: lifecycle?.latestInviteSentAt?.toISOString() ?? null,
    latestInviteEmail: lifecycle?.latestInviteEmail ?? null,
    inviteState,
    inviteSentCount: lifecycle?.inviteSentCount ?? 0,
    publicAccessHandle: lifecycle?.publicAccessHandle ?? null,
    canonicalHubUrl: readiness.enabled ? buildCanonicalHubUrl(orgSlug, lifecycle?.publicAccessHandle ?? null) : null,
    blockers: readiness.blockers,
  };
}

/**
 * Fetch the organization's Client Hub configuration.
 * Resolves securely from authenticated org session context.
 * Returns seeded DEFAULT_CLIENT_HUB_CONFIG if no configuration has been stored yet (isNew: true).
 * Surfaces authentication or database failures truthfully instead of masking them.
 */
export async function getClientHubOrgConfig(): Promise<GetClientHubOrgConfigResult> {
  try {
    const { orgId } = await requireOrgContext();

    const record = await db.clientHubOrgConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!record || !record.config) {
      return { success: true, config: DEFAULT_CLIENT_HUB_CONFIG, isNew: true };
    }

    // Securely validate persisted config with resilient schema merging and fallbacks
    const validated = safeValidateHubConfig(record.config);
    return { success: true, config: validated, isNew: false };
  } catch (error) {
    console.error("getClientHubOrgConfig error:", error);
    return {
      success: false,
      error: "Failed to retrieve Client Hub configuration due to an internal server or database error.",
    };
  }
}

/**
 * Update the organization's Client Hub configuration.
 * Validates with Zod, checks org context securely, and restricts mutations
 * to admin/owner roles only.
 */
export async function updateClientHubOrgConfig(input: ClientHubConfig) {
  try {
    // 1. Authenticate and enforce organization context
    const { orgId, role } = await requireOrgContext();

    // 2. Authorize only admin and owner roles
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can update the Client Hub configuration." };
    }

    // 3. Validate user-controlled inputs with Zod
    const validationResult = ClientHubConfigSchema.safeParse(input);
    if (!validationResult.success) {
      const formattedErrors = validationResult.error.format();
      console.error("Validation failed for updateClientHubOrgConfig:", formattedErrors);
      return {
        success: false,
        error: "Invalid configuration values provided.",
        validationErrors: formattedErrors,
      };
    }

    const validatedConfig = validationResult.data;

    // 4. Perform truthful persistence using upsert (strictly org-scoped)
    await db.clientHubOrgConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        config: validatedConfig as any,
      },
      update: {
        config: validatedConfig as any,
      },
    });

    // 5. Revalidate cache on affected pages to reflect new defaults
    revalidatePath("/app/settings/portal/client-hub");
    revalidatePath(`/portal/[orgSlug]/client-hub`, "layout");

    return { success: true };
  } catch (error) {
    console.error("updateClientHubOrgConfig error:", error);
    return { success: false, error: "Failed to persist configuration." };
  }
}

/**
 * Fetch the list of customers (clients) belonging to the active organization.
 * Used by the customer picker dropdown in settings.
 */
export async function getClientHubCustomers() {
  try {
    const { orgId, role } = await requireOrgContext();

    // Enforce admin/owner authorization for admin settings data
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can access Client Hub customer settings." };
    }

    const customers = await db.customer.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    });

    return { success: true, customers };
  } catch (error) {
    console.error("getClientHubCustomers error:", error);
    return { success: false, error: "Failed to load customers." };
  }
}

/**
 * Securely loads organization default settings and the selected customer's sparse override,
 * returning the fully resolved effective configuration for the editor.
 */
export async function getClientOverrideEditorState(customerId: string) {
  try {
    const { orgId, role } = await requireOrgContext();

    // Enforce admin/owner authorization for admin settings data
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can access Client Hub override settings." };
    }

    // Securely verify that customer belongs to the active organization context
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    // Load org defaults
    const orgConfigResult = await getClientHubOrgConfig();
    if (!orgConfigResult.success) {
      return { success: false, error: orgConfigResult.error };
    }
    const orgDefault = orgConfigResult.config;

    // Load sparse customer override
    const record = await db.clientHubCustomerOverride.findUnique({
      where: { customerId },
      select: { overrideConfig: true },
    });

    const overrideConfig = record?.overrideConfig || {};

    // Compute effective configuration by deep-merging defaults and overrides
    const effectiveConfig = resolveEffectiveConfig(orgDefault, overrideConfig);

    return {
      success: true,
      customer,
      orgDefault,
      overrideConfig,
      effectiveConfig,
    };
  } catch (error) {
    console.error("getClientOverrideEditorState error:", error);
    return { success: false, error: "Failed to load client override editor state." };
  }
}

/**
 * Update a client's specific hub configuration override.
 * Submits the full edited effective configuration, computes the difference against org defaults
 * on the server, validates the sparse delta, and persists only the delta.
 * If the computed delta is empty, cleans up and deletes the database record.
 */
export async function updateClientHubCustomerOverride(customerId: string, effectiveConfig: ClientHubConfig) {
  try {
    // 1. Authenticate and enforce organization context and admin/owner role
    const { orgId, role } = await requireOrgContext();
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can update client overrides." };
    }

    // 2. Securely verify that customer belongs to the active organization context
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, error: "Customer context mismatch or not authorized." };
    }

    // 3. Validate entire effective configuration payload
    const effectiveValidation = ClientHubConfigSchema.safeParse(effectiveConfig);
    if (!effectiveValidation.success) {
      return {
        success: false,
        error: "Invalid configuration values provided.",
        validationErrors: effectiveValidation.error.format(),
      };
    }
    const validatedEffective = effectiveValidation.data;

    // 4. Load org defaults to perform server-side diffing
    const orgConfigResult = await getClientHubOrgConfig();
    if (!orgConfigResult.success) {
      return { success: false, error: orgConfigResult.error };
    }
    const orgDefault = orgConfigResult.config;

    // 5. Compute the sparse override delta
    const sparseDelta = computeOverrideDiff(orgDefault, validatedEffective);

    // 6. Validate the delta against sparse schema
    const deltaValidation = ClientHubOverrideSchema.safeParse(sparseDelta);
    if (!deltaValidation.success) {
      return {
        success: false,
        error: "Failed to validate override values.",
        validationErrors: deltaValidation.error.format(),
      };
    }
    const validatedDelta = deltaValidation.data;

    // 7. Persist or Clean up the record
    const isEmpty = Object.keys(validatedDelta || {}).length === 0;

    if (isEmpty) {
      // Delta is empty (identical to defaults), so cleanly delete to avoid database bloat
      await db.clientHubCustomerOverride.deleteMany({
        where: { customerId },
      });
      revalidatePath("/app/settings/portal/client-hub");
      return { success: true, isCleared: true };
    }

    // Persist only the delta/override payload (strictly org-scoped)
    await db.clientHubCustomerOverride.upsert({
      where: { customerId },
      create: {
        organizationId: orgId,
        customerId,
        overrideConfig: validatedDelta as any,
      },
      update: {
        overrideConfig: validatedDelta as any,
      },
    });

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true, isCleared: false };
  } catch (error) {
    console.error("updateClientHubCustomerOverride error:", error);
    return { success: false, error: "Failed to persist client override configuration." };
  }
}

/**
 * Remove/reset a client's hub overrides completely, returning them to organization default behavior.
 * Securely deletes the database record and verifies organization/role constraints.
 */
export async function clearClientHubCustomerOverride(customerId: string) {
  try {
    // 1. Authenticate and enforce organization context and admin/owner role
    const { orgId, role } = await requireOrgContext();
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can reset client overrides." };
    }

    // 2. Securely verify that customer belongs to the active organization context
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, error: "Customer context mismatch or not authorized." };
    }

    // 3. Delete the override record
    await db.clientHubCustomerOverride.deleteMany({
      where: { customerId },
    });

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true };
  } catch (error) {
    console.error("clearClientHubCustomerOverride error:", error);
    return { success: false, error: "Failed to reset client override configuration." };
  }
}

/**
 * Computes the deterministic readiness state for a customer given their lifecycle record.
 * Evaluates a coherent set of prerequisites aligned with the PRD readiness model:
 *   - legal/display name
 *   - primary email
 *   - primary phone
 *   - billing address
 *   - tax identifiers (taxId or gstin)
 *
 * Preview eligibility is independent (enabled => can preview).
 * Invite eligibility requires email.
 * Portal ready requires all core prerequisites.
 */
function computeClientHubReadiness(
  lifecycle: { enabled: boolean } | null,
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
  }
): ClientHubCustomerReadiness {
  const enabled = lifecycle?.enabled ?? false;
  const blockers: string[] = [];

  if (!enabled) {
    blockers.push("Client Hub is not enabled for this customer");
    return {
      enabled: false,
      readinessStatus: "disabled",
      previewEligible: false,
      inviteEligible: false,
      portalReady: false,
      blockers,
    };
  }

  // Enabled — evaluate readiness prerequisites
  if (!customer.name || customer.name.trim().length === 0) {
    blockers.push("Customer name is required for portal identity");
  }
  if (!customer.email || customer.email.trim().length === 0) {
    blockers.push("Customer email is required for portal invite");
  }
  if (!customer.phone || customer.phone.trim().length === 0) {
    blockers.push("Customer phone is required for portal contact");
  }
  if (!customer.address || customer.address.trim().length === 0) {
    blockers.push("Customer billing address is required for portal documents");
  }
  if (
    (!customer.taxId || customer.taxId.trim().length === 0) &&
    (!customer.gstin || customer.gstin.trim().length === 0)
  ) {
    blockers.push("Customer tax identifier (GSTIN or Tax ID) is required for portal compliance");
  }

  const hasBlockers = blockers.length > 0;

  return {
    enabled: true,
    readinessStatus: hasBlockers ? "enabled_not_ready" : "enabled_ready",
    previewEligible: true,
    inviteEligible: !(!customer.email || customer.email.trim().length === 0),
    portalReady: !hasBlockers,
    blockers,
  };
}

/**
 * Fetch the full Client Hub admin state for a specific customer.
 * Includes readiness, invite history, and canonical link.
 * Admin/owner restricted. Returns truthful access-denied for non-admin callers.
 */
export async function getClientHubCustomerAdminState(customerId: string) {
  try {
    const { orgId, role } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can access Client Hub admin state." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        taxId: true,
        gstin: true,
      },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });

    const lifecycle = await db.clientHubCustomerLifecycle.findUnique({
      where: { customerId },
    });

    const adminState = computeClientHubAdminState(lifecycle, customer, org?.slug ?? "");

    return {
      success: true,
      customer,
      adminState,
    };
  } catch (error) {
    console.error("getClientHubCustomerAdminState error:", error);
    return { success: false, error: "Failed to load client admin state." };
  }
}

/**
 * Legacy alias: returns lifecycle and readiness for a specific customer.
 * Internally delegates to the unified admin state resolver.
 */
export async function getClientHubCustomerLifecycle(customerId: string) {
  const result = await getClientHubCustomerAdminState(customerId);
  if (!result.success) {
    return result;
  }
  return {
    success: true as const,
    customer: result.customer,
    lifecycle: null, // kept for backward-compat in UI tests
    readiness: {
      enabled: result.adminState.enabled,
      readinessStatus: result.adminState.readinessStatus,
      previewEligible: result.adminState.previewEligible,
      inviteEligible: result.adminState.inviteEligible,
      portalReady: result.adminState.portalReady,
      blockers: result.adminState.blockers,
    } satisfies ClientHubCustomerReadiness,
  };
}

/**
 * Enable Client Hub for a specific customer.
 * Creates a lifecycle record if none exists, or updates the existing one.
 * Generates a stable public access handle on first enable.
 * Sends an initial invite email if the customer has a valid email and is invite-eligible.
 * Admin/owner restricted with org/customer scoping.
 */
export async function enableClientHubForCustomer(customerId: string) {
  try {
    const { orgId, role, userId } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can enable Client Hub for customers." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true, name: true },
    });

    const hdrs = await headers();
    const auditHeaders = {
      ipAddress: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip") || null,
      userAgent: hdrs.get("user-agent") || null,
    };

    let inviteSent = false;
    let inviteError: string | null = null;

    await db.$transaction(async (tx) => {
      const existing = await tx.clientHubCustomerLifecycle.findUnique({
        where: { customerId },
        select: { publicAccessHandle: true },
      });

      const publicAccessHandle = existing?.publicAccessHandle ?? generatePublicAccessHandle();

      await tx.clientHubCustomerLifecycle.upsert({
        where: { customerId },
        create: {
          organizationId: orgId,
          customerId,
          enabled: true,
          enabledAt: new Date(),
          enabledByUserId: userId,
          publicAccessHandle,
        },
        update: {
          enabled: true,
          enabledAt: new Date(),
          disabledAt: null,
          enabledByUserId: userId,
          publicAccessHandle,
        },
      });

      await logAuditTx(tx, {
        orgId,
        actorId: userId,
        action: "client_hub.enabled",
        entityType: "ClientHubCustomerLifecycle",
        entityId: customerId,
        metadata: { customerName: customer.name },
        ...auditHeaders,
      });
    });

    // Attempt initial invite delivery outside the transaction so email failures
    // do not roll back the enablement itself.
    const hasEmail = !!(customer.email && customer.email.trim().length > 0);
    if (hasEmail && org) {
      try {
        const lifecycleRecord = await db.clientHubCustomerLifecycle.findUnique({
          where: { customerId },
          select: { publicAccessHandle: true },
        });
        const url = buildCanonicalHubUrl(org.slug, lifecycleRecord?.publicAccessHandle);
        await sendEmail({
          to: customer.email,
          subject: `Welcome to ${org.name} Client Hub`,
          html: clientHubInviteEmailHtml({
            url,
            orgName: org.name,
            customerName: customer.name || "Valued Client",
          }),
        });
        inviteSent = true;

        await db.$transaction(async (tx) => {
          await tx.clientHubCustomerLifecycle.update({
            where: { customerId },
            data: {
              latestInviteSentAt: new Date(),
              latestInviteEmail: customer.email,
              inviteSentCount: { increment: 1 },
            },
          });

          await logAuditTx(tx, {
            orgId,
            actorId: userId,
            action: "client_hub.invite_sent",
            entityType: "ClientHubCustomerLifecycle",
            entityId: customerId,
            metadata: { customerName: customer.name, email: customer.email, type: "initial" },
            ...auditHeaders,
          });
        });
      } catch (emailError) {
        console.error("enableClientHubForCustomer: initial invite delivery failed:", emailError);
        inviteError = "Invite email could not be delivered. The client hub is enabled, but you may need to resend the invite manually.";
      }
    } else if (!hasEmail) {
      inviteError = "Customer does not have a valid email address. Invite was not sent.";
    }

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true, inviteSent, inviteError };
  } catch (error) {
    console.error("enableClientHubForCustomer error:", error);
    return { success: false, error: "Failed to enable Client Hub for customer." };
  }
}

/**
 * Disable Client Hub for a specific customer.
 * Updates the lifecycle record to mark the customer as disabled.
 * Admin/owner restricted with org/customer scoping.
 */
export async function disableClientHubForCustomer(customerId: string) {
  try {
    const { orgId, role, userId } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can disable Client Hub for customers." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const hdrs = await headers();
    const auditHeaders = {
      ipAddress: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip") || null,
      userAgent: hdrs.get("user-agent") || null,
    };

    await db.$transaction(async (tx) => {
      await tx.clientHubCustomerLifecycle.upsert({
        where: { customerId },
        create: {
          organizationId: orgId,
          customerId,
          enabled: false,
          disabledAt: new Date(),
        },
        update: {
          enabled: false,
          disabledAt: new Date(),
          enabledAt: null,
          enabledByUserId: null,
        },
      });

      await logAuditTx(tx, {
        orgId,
        actorId: userId,
        action: "client_hub.disabled",
        entityType: "ClientHubCustomerLifecycle",
        entityId: customerId,
        metadata: { customerName: customer.name },
        ...auditHeaders,
      });
    });

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true };
  } catch (error) {
    console.error("disableClientHubForCustomer error:", error);
    return { success: false, error: "Failed to disable Client Hub for customer." };
  }
}

/**
 * Preview the effective client-facing hub for a specific customer.
 * Returns the resolved effective configuration and preview metadata.
 * Respects per-client lifecycle gating: only enabled customers may be previewed.
 */
export async function previewClientHubForCustomer(customerId: string) {
  try {
    const { orgId, role } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can preview the Client Hub." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true, email: true, phone: true, address: true, taxId: true, gstin: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const lifecycle = await db.clientHubCustomerLifecycle.findUnique({
      where: { customerId },
    });

    const readiness = computeClientHubReadiness(lifecycle, customer);
    if (!readiness.enabled) {
      return { success: false, error: "Client Hub is not enabled for this customer. Enable it before previewing." };
    }

    const orgConfigResult = await getClientHubOrgConfig();
    if (!orgConfigResult.success) {
      return { success: false, error: orgConfigResult.error };
    }

    const overrideRecord = await db.clientHubCustomerOverride.findUnique({
      where: { customerId },
      select: { overrideConfig: true },
    });

    const effectiveConfig = resolveEffectiveConfig(orgConfigResult.config, overrideRecord?.overrideConfig);

    return {
      success: true,
      customer,
      effectiveConfig,
      readiness,
    };
  } catch (error) {
    console.error("previewClientHubForCustomer error:", error);
    return { success: false, error: "Failed to load preview." };
  }
}

/**
 * Return the canonical public hub link for a customer.
 * Only returns a link when the customer is enabled; otherwise surfaces a clear error.
 */
export async function copyClientHubLink(customerId: string) {
  try {
    const { orgId, role } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can copy the Client Hub link." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const lifecycle = await db.clientHubCustomerLifecycle.findUnique({
      where: { customerId },
      select: { enabled: true, publicAccessHandle: true },
    });

    if (!lifecycle?.enabled) {
      return {
        success: false,
        error: "Client Hub is not enabled for this customer. Enable it before copying the link.",
      };
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });

    if (!org?.slug) {
      return { success: false, error: "Organization slug not found." };
    }

    const url = buildCanonicalHubUrl(org.slug, lifecycle.publicAccessHandle);
    return { success: true, url };
  } catch (error) {
    console.error("copyClientHubLink error:", error);
    return { success: false, error: "Failed to generate hub link." };
  }
}

/**
 * Resend the Client Hub invite for a specific customer.
 * Eligibility:
 *   - admin/owner authorized
 *   - customer is enabled
 *   - customer has a valid email (inviteEligible)
 *   - customer belongs to the org
 *
 * If the customer's email has changed since the last invite, the new invite
 * targets the current email and updates persisted invite state.
 *
 * Audit logs invite sent/resent events transactionally.
 */
export async function resendClientHubInvite(customerId: string) {
  try {
    const { orgId, role, userId } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can resend Client Hub invites." };
    }

    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      return { success: false, error: "Customer not found or access denied." };
    }

    const lifecycle = await db.clientHubCustomerLifecycle.findUnique({
      where: { customerId },
    });

    if (!lifecycle?.enabled) {
      return { success: false, error: "Client Hub is not enabled for this customer." };
    }

    if (!customer.email || customer.email.trim().length === 0) {
      return { success: false, error: "Customer does not have a valid email address." };
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true, name: true },
    });

    if (!org) {
      return { success: false, error: "Organization not found." };
    }

    const hdrs = await headers();
    const auditHeaders = {
      ipAddress: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip") || null,
      userAgent: hdrs.get("user-agent") || null,
    };

    const url = buildCanonicalHubUrl(org.slug);

    // Attempt delivery before persisting sent-success state
    try {
      await sendEmail({
        to: customer.email,
        subject: `Your ${org.name} Client Hub Access`,
        html: clientHubInviteEmailHtml({
          url,
          orgName: org.name,
          customerName: customer.name || "Valued Client",
        }),
      });
    } catch (emailError) {
      console.error("resendClientHubInvite: email delivery failed:", emailError);
      return {
        success: false,
        error: "Invite email could not be delivered. Please check your email provider configuration and try again.",
      };
    }

    // Delivery succeeded — atomically update invite state and audit
    await db.$transaction(async (tx) => {
      await tx.clientHubCustomerLifecycle.update({
        where: { customerId },
        data: {
          latestInviteSentAt: new Date(),
          latestInviteEmail: customer.email,
          inviteSentCount: { increment: 1 },
        },
      });

      await logAuditTx(tx, {
        orgId,
        actorId: userId,
        action: lifecycle.latestInviteSentAt ? "client_hub.invite_resent" : "client_hub.invite_sent",
        entityType: "ClientHubCustomerLifecycle",
        entityId: customerId,
        metadata: {
          customerName: customer.name,
          email: customer.email,
          type: lifecycle.latestInviteSentAt ? "resent" : "initial",
          previousEmail: lifecycle.latestInviteEmail ?? null,
        },
        ...auditHeaders,
      });
    });

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true };
  } catch (error) {
    console.error("resendClientHubInvite error:", error);
    return { success: false, error: "Failed to resend invite." };
  }
}
