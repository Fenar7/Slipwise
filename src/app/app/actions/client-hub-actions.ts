"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  ClientHubConfig,
  ClientHubConfigSchema,
} from "@/app/portal/[orgSlug]/client-hub/components/customization-contract";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import { safeValidateHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";

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
