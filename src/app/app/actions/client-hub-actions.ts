"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
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
