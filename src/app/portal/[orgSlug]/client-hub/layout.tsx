import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { buildHubThemeStyle, ClientHubFooter, ClientHubHeader, DEFAULT_HUB_ACCENT, getHubNavItems } from "./components/views";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import type { ClientHubConfig } from "./components/customization-contract";

type OrgLayoutData = {
  id: string;
  name: string;
  logo: string | null;
  branding: {
    logoUrl: string | null;
    accentColor: string;
    fontFamily: string | null;
    fontColor: string | null;
  } | null;
  whiteLabel: {
    removeBranding: boolean;
  } | null;
  defaults: {
    portalEnabled: boolean;
    portalSupportEmail: string | null;
    portalSupportPhone: string | null;
  } | null;
  clientHubOrgConfig: {
    config: any;
  } | null;
};

export default async function ClientHubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const orgData = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true,
      name: true,
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
        },
      },
      clientHubOrgConfig: {
        select: { config: true },
      },
    },
  });

  let org: OrgLayoutData | null = orgData;

  const isDevPreview = orgSlug === "acme" && process.env.NODE_ENV === "development";

  if (isDevPreview && !org) {
    org = {
      id: "org_preview",
      name: "Acme Corporation",
      logo: null,
      branding: { logoUrl: null, accentColor: DEFAULT_HUB_ACCENT, fontFamily: null, fontColor: null },
      whiteLabel: { removeBranding: false },
      defaults: {
        portalEnabled: true,
        portalSupportEmail: "support@acme.com",
        portalSupportPhone: "+91 98765 43210",
      },
      clientHubOrgConfig: null,
    };
  }

  if (!org || !org.defaults?.portalEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--hub-surface-soft)] px-4" style={buildHubThemeStyle(DEFAULT_HUB_ACCENT)}>
        <div className="w-full max-w-lg rounded-2xl border border-[var(--hub-border)] bg-white p-10 text-center shadow-[var(--hub-card-shadow)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--hub-surface-soft)] ring-1 ring-[var(--hub-border)]">
            <svg className="h-6 w-6 text-[var(--hub-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">Client Hub Not Available</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--hub-text-soft)]">
            The client hub for this organization is not currently available.
          </p>
        </div>
      </div>
    );
  }

  // Load client hub organization configuration from database or fallback to static seeds
  const config: ClientHubConfig = org.clientHubOrgConfig?.config
    ? (org.clientHubOrgConfig.config as unknown as ClientHubConfig)
    : DEFAULT_CLIENT_HUB_CONFIG;

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
