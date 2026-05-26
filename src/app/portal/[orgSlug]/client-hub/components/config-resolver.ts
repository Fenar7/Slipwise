import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import { ClientHubConfig, ClientHubConfigSchema } from "./customization-contract";

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
