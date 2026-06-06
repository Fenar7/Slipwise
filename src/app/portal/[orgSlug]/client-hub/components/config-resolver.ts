import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import {
  ClientHubConfig,
  ClientHubConfigSchema,
  ClientHubOverrideSchema,
  deepMerge,
} from "./customization-contract";

/**
 * Safely parses and validates a configuration payload against the schema,
 * performing a resilient fallback to DEFAULT_CLIENT_HUB_CONFIG if parsing fails.
 * To handle future partial/stale config updates, it merges with defaults.
 */
export function safeValidateHubConfig(rawConfig: any): ClientHubConfig {
  if (!rawConfig) {
    return DEFAULT_CLIENT_HUB_CONFIG;
  }

  try {
    // Resilient deep-merge to populate any missing or newly added schema fields
    const merged = {
      ...DEFAULT_CLIENT_HUB_CONFIG,
      ...rawConfig,
      branding: { ...DEFAULT_CLIENT_HUB_CONFIG.branding, ...rawConfig.branding },
      homeDashboard: { ...DEFAULT_CLIENT_HUB_CONFIG.homeDashboard, ...rawConfig.homeDashboard },
      invoices: { ...DEFAULT_CLIENT_HUB_CONFIG.invoices, ...rawConfig.invoices },
      quotes: { ...DEFAULT_CLIENT_HUB_CONFIG.quotes, ...rawConfig.quotes },
      payments: { ...DEFAULT_CLIENT_HUB_CONFIG.payments, ...rawConfig.payments },
      about: { ...DEFAULT_CLIENT_HUB_CONFIG.about, ...rawConfig.about },
      contact: { ...DEFAULT_CLIENT_HUB_CONFIG.contact, ...rawConfig.contact },
      products: { ...DEFAULT_CLIENT_HUB_CONFIG.products, ...rawConfig.products },
      jobs: { ...DEFAULT_CLIENT_HUB_CONFIG.jobs, ...rawConfig.jobs },
      navigation: { ...DEFAULT_CLIENT_HUB_CONFIG.navigation, ...rawConfig.navigation },
    };

    // Validate merged result against Zod schema
    const parsed = ClientHubConfigSchema.safeParse(merged);
    if (parsed.success) {
      return parsed.data;
    }

    console.warn("Client Hub config validation failed, falling back to standard defaults:", parsed.error);
    return DEFAULT_CLIENT_HUB_CONFIG;
  } catch (error) {
    console.error("Error in safeValidateHubConfig, falling back to standard defaults:", error);
    return DEFAULT_CLIENT_HUB_CONFIG;
  }
}

/**
 * Resolves the stored default Client Hub configuration for a given organization slug.
 * Safely validates the database records to prevent public rendering crashes.
 */
export async function getPersistedHubConfig(orgSlug: string): Promise<ClientHubConfig> {
  if (
    (orgSlug === "acme" && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")) ||
    orgSlug === "org_preview"
  ) {
    return DEFAULT_CLIENT_HUB_CONFIG;
  }

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      clientHubOrgConfig: {
        select: { config: true },
      },
    },
  });

  if (!org) {
    notFound();
  }

  return safeValidateHubConfig(org.clientHubOrgConfig?.config);
}

/**
 * Shared internal utility to merge stored sparse customer overrides into the
 * resolved organization-level defaults, validating the final effective schema.
 */
export function resolveEffectiveConfig(orgDefault: ClientHubConfig, overridePayload: any): ClientHubConfig {
  if (!overridePayload) {
    return orgDefault;
  }

  try {
    const parsed = ClientHubOverrideSchema.safeParse(overridePayload);
    if (!parsed.success) {
      console.warn("Client Hub partial override validation failed, using org defaults:", parsed.error);
      return orgDefault;
    }

    const merged = deepMerge(orgDefault, parsed.data);
    return safeValidateHubConfig(merged);
  } catch (error) {
    console.error("Error in resolveEffectiveConfig:", error);
    return orgDefault;
  }
}

/**
 * Internal helper resolver to securely compute effective configuration for a given org + customer
 * when both contexts are available. Checks customer membership to prevent cross-org leaks.
 */
export async function getEffectiveClientHubConfig(orgSlug: string, customerId: string): Promise<ClientHubConfig> {
  const orgDefault = await getPersistedHubConfig(orgSlug);

  if (
    (orgSlug === "acme" && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")) ||
    orgSlug === "org_preview"
  ) {
    return orgDefault;
  }

  try {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { organization: { select: { slug: true } } },
    });

    if (!customer || customer.organization.slug !== orgSlug) {
      console.warn("getEffectiveClientHubConfig: customer org mismatch, returning defaults");
      return orgDefault;
    }

    const overrideRecord = await db.clientHubCustomerOverride.findUnique({
      where: { customerId },
      select: { overrideConfig: true },
    });

    if (!overrideRecord || !overrideRecord.overrideConfig) {
      return orgDefault;
    }

    return resolveEffectiveConfig(orgDefault, overrideRecord.overrideConfig);
  } catch (error) {
    console.error("Error in getEffectiveClientHubConfig:", error);
    return orgDefault;
  }
}

