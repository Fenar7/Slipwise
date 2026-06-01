import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { buildHubThemeStyle, ClientHubFooter, ClientHubHeader, DEFAULT_HUB_ACCENT, getHubNavItems } from "./components/views";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import type { ClientHubConfig } from "./components/customization-contract";
import { safeValidateHubConfig } from "./components/config-resolver";

import { checkPortalEligibility } from "@/lib/portal-eligibility";
import { PortalErrorState } from "@/components/portal/portal-error-states";

export default async function ClientHubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const eligibility = await checkPortalEligibility(orgSlug);

  if (eligibility.state === "NOT_FOUND") {
    return <PortalErrorState type="NOT_FOUND" />;
  }

  if (eligibility.state === "DISABLED") {
    return (
      <PortalErrorState
        type="DISABLED"
        orgName={eligibility.org?.name}
        showPoweredBy={!eligibility.org?.whiteLabel?.removeBranding}
      />
    );
  }

  if (eligibility.state === "ENABLED_BUT_NOT_READY") {
    return (
      <PortalErrorState
        type="NOT_READY"
        orgName={eligibility.org?.name}
        showPoweredBy={!eligibility.org?.whiteLabel?.removeBranding}
      />
    );
  }

  const { org, config } = eligibility;

  const accentColor = config.branding?.accentColor ?? org.branding?.accentColor ?? DEFAULT_HUB_ACCENT;
  const logoUrl = config.branding?.logoUrl ?? org.branding?.logoUrl ?? org.logo;
  const navItems = getHubNavItems(orgSlug, config);

  return (
    <div
      data-client-hub-root
      className="flex min-h-screen flex-col bg-[var(--hub-surface-soft)]"
      style={buildHubThemeStyle(accentColor)}
    >
      <style>{`
        body:has([data-client-hub-root]) .portal-shell-header,
        body:has([data-client-hub-root]) .portal-shell-footer {
          display: none;
        }

        body:has([data-client-hub-root]) .portal-shell-main {
          max-width: none;
          width: 100%;
          margin: 0;
          padding: 0;
        }
      `}</style>
      <ClientHubHeader orgName={org.name} logoUrl={logoUrl} navItems={navItems} />
      <main className="mx-auto w-full max-w-[1480px] flex-1 px-5 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</main>
      <ClientHubFooter
        orgName={org.name}
        supportEmail={config.contact?.supportEmail || org.defaults?.portalSupportEmail}
        supportPhone={config.contact?.supportPhone || org.defaults?.portalSupportPhone}
        footerText={config.navigation?.footerText || "A calmer, clearer place to work with us."}
        showPoweredBy={!config.branding?.removePoweredBy && !org.whiteLabel?.removeBranding}
      />
    </div>
  );
}
