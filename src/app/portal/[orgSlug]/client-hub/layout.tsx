import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { buildHubThemeStyle, ClientHubFooter, ClientHubHeader, DEFAULT_HUB_ACCENT, getHubNavItems } from "./components/views";

export default async function ClientHubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  let org = await db.organization.findUnique({
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
    },
  });

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
    } as typeof org;
  }

  if (!isDevPreview && (!org || !org.defaults?.portalEnabled)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-900">Client Hub Not Available</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            The client hub for this organization is not currently available.
          </p>
        </div>
      </div>
    );
  }

  const accentColor = org.branding?.accentColor ?? DEFAULT_HUB_ACCENT;
  const logoUrl = org.branding?.logoUrl ?? org.logo;
  const navItems = getHubNavItems(orgSlug);

  return (
    <div
      data-client-hub-root
      className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.16),_transparent_40%),linear-gradient(180deg,#fff7ef_0%,#fbfaf6_44%,#f7f8fb_100%)]"
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 xl:px-8">{children}</main>
      <ClientHubFooter
        orgName={org.name}
        supportEmail={org.defaults?.portalSupportEmail}
        supportPhone={org.defaults?.portalSupportPhone}
        footerText="A calmer, clearer place to work with us."
        showPoweredBy={!org.whiteLabel?.removeBranding}
      />
    </div>
  );
}
