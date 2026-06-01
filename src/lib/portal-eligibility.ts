import { db } from "@/lib/db";
import { safeValidateHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";

export type PortalEligibilityResult =
  | { state: "ENABLED_AND_READY"; org: any; config: any }
  | { state: "ENABLED_BUT_NOT_READY"; org: any; config: any; missingRequirements: string[] }
  | { state: "DISABLED"; org: any }
  | { state: "NOT_FOUND" };

export async function checkPortalEligibility(orgSlug: string): Promise<PortalEligibilityResult> {
  const isDevPreview = orgSlug === "acme" && process.env.NODE_ENV === "development";

  let org: any = null;

  if (isDevPreview) {
    org = {
      id: "org_preview",
      name: "Acme Corporation",
      logo: null,
      branding: { logoUrl: null, accentColor: "#2563eb", fontFamily: null, fontColor: null },
      whiteLabel: { removeBranding: false },
      defaults: {
        portalEnabled: true,
        portalSupportEmail: "support@acme.com",
        portalSupportPhone: "+91 98765 43210",
        portalHeaderMessage: "Welcome to Acme Client Hub",
      },
      clientHubOrgConfig: null,
    };
  } else {
    org = await db.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        branding: {
          select: { logoUrl: true, accentColor: true, fontFamily: true, fontColor: true },
        },
        whiteLabel: {
          select: { removeBranding: true },
        },
        defaults: {
          select: {
            portalEnabled: true,
            portalSupportEmail: true,
            portalSupportPhone: true,
            portalHeaderMessage: true,
          },
        },
        clientHubOrgConfig: {
          select: { config: true },
        },
      },
    });
  }

  if (!org) {
    return { state: "NOT_FOUND" };
  }

  if (!org.defaults?.portalEnabled) {
    return { state: "DISABLED", org };
  }

  // Load and validate config
  const config = safeValidateHubConfig(org.clientHubOrgConfig?.config);

  // Check readiness requirements:
  // 1. Support contact (must have support email or support phone)
  const hasSupportContact = !!(
    org.clientHubOrgConfig?.config?.contact?.supportEmail ||
    org.defaults?.portalSupportEmail ||
    org.clientHubOrgConfig?.config?.contact?.supportPhone ||
    org.defaults?.portalSupportPhone
  );

  // 2. Branding configured (must have accent color or logo url)
  const hasBranding = !!(
    org.clientHubOrgConfig?.config?.branding?.accentColor ||
    org.branding?.accentColor ||
    org.clientHubOrgConfig?.config?.branding?.logoUrl ||
    org.branding?.logoUrl ||
    org.logo
  );

  const missingRequirements: string[] = [];
  if (!hasSupportContact) {
    missingRequirements.push("support-contact");
  }
  if (!hasBranding) {
    missingRequirements.push("branding");
  }

  if (missingRequirements.length > 0) {
    return {
      state: "ENABLED_BUT_NOT_READY",
      org,
      config,
      missingRequirements,
    };
  }

  return {
    state: "ENABLED_AND_READY",
    org,
    config,
  };
}
