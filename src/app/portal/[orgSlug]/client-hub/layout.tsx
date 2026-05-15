import Link from "next/link";
import { db } from "@/lib/db";

export default async function ClientHubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
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

  if (!org || !org.defaults?.portalEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Client Hub Not Available</h1>
          <p className="mt-2 text-sm text-slate-500">
            The client hub for this organization is not currently available.
          </p>
        </div>
      </div>
    );
  }

  const { defaults, branding, whiteLabel } = org;
  const accentColor = branding?.accentColor ?? "#2563eb";
  const logoUrl = branding?.logoUrl ?? org.logo;
  const showPoweredBy = !whiteLabel?.removeBranding;

  const navLinks = [
    { href: `/portal/${orgSlug}/client-hub`, label: "Dashboard" },
    { href: `/portal/${orgSlug}/client-hub/invoices`, label: "Invoices" },
    { href: `/portal/${orgSlug}/client-hub/quotes`, label: "Quotes" },
    { href: `/portal/${orgSlug}/client-hub/payments`, label: "Payments" },
    { href: `/portal/${orgSlug}/client-hub/about`, label: "About" },
    { href: `/portal/${orgSlug}/client-hub/contact`, label: "Contact" },
    { href: `/portal/${orgSlug}/client-hub/products`, label: "Products" },
  ];

  return (
    <div
      className="flex min-h-screen flex-col bg-slate-50"
      style={{ "--hub-accent": accentColor } as React.CSSProperties}
    >
      <style>{`
        .hub-accent-bg { background-color: var(--hub-accent); }
        .hub-accent-text { color: var(--hub-accent); }
        .hub-accent-border { border-color: var(--hub-accent); }
      `}</style>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href={`/portal/${orgSlug}/client-hub`} className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${org.name} logo`}
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            ) : (
              <span className="hub-accent-bg flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white">
                {org.name.charAt(0)}
              </span>
            )}
            <span className="text-lg font-semibold text-slate-900">{org.name}</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Client hub navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Nav */}
          <details className="relative lg:hidden">
            <summary className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} {org.name}. All rights reserved.</p>
            {(defaults.portalSupportEmail || defaults.portalSupportPhone) && (
              <div className="flex items-center gap-4">
                <span className="text-slate-400">Need help?</span>
                {defaults.portalSupportEmail && (
                  <a href={`mailto:${defaults.portalSupportEmail}`} className="hub-accent-text hover:underline font-medium">
                    {defaults.portalSupportEmail}
                  </a>
                )}
                {defaults.portalSupportPhone && (
                  <a href={`tel:${defaults.portalSupportPhone}`} className="hub-accent-text hover:underline font-medium">
                    {defaults.portalSupportPhone}
                  </a>
                )}
              </div>
            )}
            {showPoweredBy && (
              <p className="text-xs text-slate-400">
                Powered by{" "}
                <a href="https://slipwise.in" target="_blank" rel="noopener noreferrer" className="hub-accent-text hover:underline font-medium">
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
