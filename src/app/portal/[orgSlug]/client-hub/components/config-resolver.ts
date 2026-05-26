import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import type { ClientHubConfig } from "./customization-contract";

/**
 * Resolves the stored default Client Hub configuration for a given organization slug.
 * Safely falls back to DEFAULT_CLIENT_HUB_CONFIG if no configuration has been persisted yet.
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

  return org.clientHubOrgConfig?.config
    ? (org.clientHubOrgConfig.config as unknown as ClientHubConfig)
    : DEFAULT_CLIENT_HUB_CONFIG;
}
