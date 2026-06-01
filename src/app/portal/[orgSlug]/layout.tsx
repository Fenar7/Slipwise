import Link from "next/link";
import { checkPortalEligibility } from "@/lib/portal-eligibility";
import { PortalErrorState } from "@/components/portal/portal-error-states";

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const { org } = eligibility;
  const { defaults, branding, whiteLabel } = org;

  // Build dynamic brand CSS variables — fall back to sensible defaults
  const accentColor = branding?.accentColor ?? "#2563eb";
  const fontFamily = branding?.fontFamily ? `'${branding.fontFamily}', sans-serif` : "inherit";
  const fontColor = branding?.fontColor ?? "#0f172a";
  const logoUrl = branding?.logoUrl ?? org.logo;
  const showPoweredBy = !whiteLabel?.removeBranding;

  const brandStyle = `
    :root {
      --portal-accent: ${accentColor};
      --portal-font: ${fontFamily};
      --portal-text: ${fontColor};
    }
    .portal-accent-bg { background-color: var(--portal-accent); }
    .portal-accent-text { color: var(--portal-accent); }
    .portal-font { font-family: var(--portal-font); color: var(--portal-text); }
  `;

  return (
    <div className="portal-font flex min-h-screen flex-col bg-slate-50">
      <style dangerouslySetInnerHTML={{ __html: brandStyle }} />

      {/* Header */}
      <header className="portal-shell-header border-b border-slate-200 bg-white">
        {defaults.portalHeaderMessage && (
          <div className="portal-accent-bg px-4 py-2 text-center text-xs font-medium text-white">
            {defaults.portalHeaderMessage}
          </div>
        )}
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href={`/portal/${orgSlug}/dashboard`}
            className="flex items-center gap-3"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${org.name} logo`}
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            ) : (
              <span className="portal-accent-bg flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white">
                {org.name.charAt(0)}
              </span>
            )}
            <span className="text-lg font-semibold text-slate-900">
              {org.name}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Portal navigation">
            <Link
              href={`/portal/${orgSlug}/dashboard`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href={`/portal/${orgSlug}/invoices`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Invoices
            </Link>
            <Link
              href={`/portal/${orgSlug}/statements`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Statements
            </Link>
            <Link
              href={`/portal/${orgSlug}/payments`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Payments
            </Link>
            {defaults.portalQuoteAcceptanceEnabled && (
              <Link
                href={`/portal/${orgSlug}/quotes`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                Quotes
              </Link>
            )}
            <Link
              href={`/portal/${orgSlug}/tickets`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Support
            </Link>
            <Link
              href={`/portal/${orgSlug}/profile`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Profile
            </Link>
            <Link
              href={`/portal/${orgSlug}/auth/logout`}
              className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Logout
            </Link>
          </nav>

          {/* Mobile nav toggle — simple dropdown */}
          <details className="relative sm:hidden">
            <summary className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <Link href={`/portal/${orgSlug}/dashboard`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Dashboard</Link>
              <Link href={`/portal/${orgSlug}/invoices`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Invoices</Link>
              <Link href={`/portal/${orgSlug}/statements`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Statements</Link>
              <Link href={`/portal/${orgSlug}/payments`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Payments</Link>
              {defaults.portalQuoteAcceptanceEnabled && (
                <Link href={`/portal/${orgSlug}/quotes`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Quotes</Link>
              )}
              <Link href={`/portal/${orgSlug}/tickets`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Support</Link>
              <Link href={`/portal/${orgSlug}/profile`} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
              <hr className="my-1 border-slate-100" />
              <Link href={`/portal/${orgSlug}/auth/logout`} className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">Logout</Link>
            </div>
          </details>
        </div>
      </header>

      {/* Main */}
      <main className="portal-shell-main mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="portal-shell-footer border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} {org.name}. All rights reserved.</p>
            {(defaults.portalSupportEmail || defaults.portalSupportPhone) && (
              <div className="flex items-center gap-4">
                <span className="text-slate-400">Need help?</span>
                {defaults.portalSupportEmail && (
                  <a
                    href={`mailto:${defaults.portalSupportEmail}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {defaults.portalSupportEmail}
                  </a>
                )}
                {defaults.portalSupportPhone && (
                  <a
                    href={`tel:${defaults.portalSupportPhone}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {defaults.portalSupportPhone}
                  </a>
                )}
              </div>
            )}
            {showPoweredBy && (
              <p className="text-xs text-slate-400">
                Powered by{" "}
                <a href="https://slipwise.in" target="_blank" rel="noopener noreferrer" className="portal-accent-text hover:underline font-medium">
                  Slipwise
                </a>
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
