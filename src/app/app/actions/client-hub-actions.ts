"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAuditTx } from "@/lib/audit";
import { headers } from "next/headers";
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

export type ClientHubReadinessStatus = "disabled" | "enabled_not_ready" | "enabled_ready";

export type ClientHubCustomerReadiness = {
  enabled: boolean;
  readinessStatus: ClientHubReadinessStatus;
  previewEligible: boolean;
  inviteEligible: boolean;
  portalReady: boolean;
  blockers: string[];
};

export type GetClientHubOrgConfigResult =
  | { success: true; config: ClientHubConfig; isNew: boolean }
  | { success: false; error: string };

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
 * Fetch the Client Hub lifecycle and computed readiness state for a specific customer.
 * Admin/owner restricted. Returns truthful access-denied for non-admin callers.
 */
export async function getClientHubCustomerLifecycle(customerId: string) {
  try {
    const { orgId, role } = await requireOrgContext();

    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only administrators can access Client Hub lifecycle settings." };
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

    const lifecycle = await db.clientHubCustomerLifecycle.findUnique({
      where: { customerId },
    });

    const readiness = computeClientHubReadiness(lifecycle, customer);

    return {
      success: true,
      customer,
      lifecycle: lifecycle
        ? {
            enabled: lifecycle.enabled,
            enabledAt: lifecycle.enabledAt,
            disabledAt: lifecycle.disabledAt,
            enabledByUserId: lifecycle.enabledByUserId,
            createdAt: lifecycle.createdAt,
            updatedAt: lifecycle.updatedAt,
          }
        : null,
      readiness,
    };
  } catch (error) {
    console.error("getClientHubCustomerLifecycle error:", error);
    return { success: false, error: "Failed to load client lifecycle state." };
  }
}

/**
 * Enable Client Hub for a specific customer.
 * Creates a lifecycle record if none exists, or updates the existing one.
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
          enabled: true,
          enabledAt: new Date(),
          enabledByUserId: userId,
        },
        update: {
          enabled: true,
          enabledAt: new Date(),
          disabledAt: null,
          enabledByUserId: userId,
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

    revalidatePath("/app/settings/portal/client-hub");
    return { success: true };
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
