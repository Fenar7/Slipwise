import { db } from "@/lib/db";
import { safeValidateHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";

export type PortalEligibilityResult =
  | { state: "ENABLED_AND_READY"; org: any; config: any }
  | { state: "ENABLED_BUT_NOT_READY"; org: any; config: any; missingRequirements: string[] }
  | { state: "DISABLED"; org: any }
  | { state: "NOT_FOUND" };

export async function checkPortalEligibility(orgSlug: string): Promise<PortalEligibilityResult> {
  // Always query the real DB first so a real org's state (disabled, not-ready) is
  // reflected truthfully — even in development. The dev-preview stub is only used
  // when the slug is "acme", the environment is development, and no real record exists.
  let org: any = await db.organization.findUnique({
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
          portalQuoteAcceptanceEnabled: true,
        },
      },
      clientHubOrgConfig: {
        select: { config: true },
      },
    },
  });

  // Dev-preview fallback: only when no real org exists for "acme" in development.
  if (!org && orgSlug === "acme" && process.env.NODE_ENV === "development") {
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
        portalQuoteAcceptanceEnabled: true,
      },
      clientHubOrgConfig: null,
    };
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

export async function checkLegacyRouteRedirect(orgSlug: string, targetPath: string): Promise<void> {
  const eligibility = await checkPortalEligibility(orgSlug);
  if (eligibility.state === "ENABLED_AND_READY" || eligibility.state === "ENABLED_BUT_NOT_READY") {
    const { redirect } = await import("next/navigation");
    redirect(`/portal/${orgSlug}/client-hub${targetPath}`);
  }
}

