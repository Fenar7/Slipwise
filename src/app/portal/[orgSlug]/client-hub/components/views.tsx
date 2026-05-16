import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ClientHubConfig } from "./customization-contract";
import { getMockInvoice, getMockQuote, MOCK_INVOICES, MOCK_PAYMENTS, MOCK_PRODUCTS, MOCK_QUOTES, OUTSTANDING_BALANCE, PENDING_INVOICES_COUNT, PENDING_QUOTES_COUNT, TOTAL_PAID } from "./mock-data";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";

export const DEFAULT_HUB_ACCENT = "#6ed5ab";

type NavItem = {
  href: string;
  label: string;
};

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 110, g: 213, b: 171 };
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function buildHubThemeStyle(accentColor: string): CSSProperties {
  const accent = accentColor || DEFAULT_HUB_ACCENT;
  const { r, g, b } = hexToRgb(accent);

  return {
    "--hub-accent": accent,
    "--hub-accent-rgb": `${r} ${g} ${b}`,
    "--hub-accent-soft": `rgba(${r}, ${g}, ${b}, 0.14)`,
    "--hub-accent-wash": `rgba(${r}, ${g}, ${b}, 0.08)`,
    "--hub-text-strong": "#172033",
    "--hub-text-soft": "#5f6b85",
    "--hub-border": "rgba(15, 23, 42, 0.08)",
    "--hub-surface": "#ffffff",
    "--hub-surface-muted": "rgba(255, 255, 255, 0.82)",
  } as CSSProperties;
}

export function getHubConfig(config?: ClientHubConfig) {
  return config ?? DEFAULT_CLIENT_HUB_CONFIG;
}

export function getHubNavItems(orgSlug: string, config?: ClientHubConfig): NavItem[] {
  const hubConfig = getHubConfig(config);
  const base = `/portal/${orgSlug}/client-hub`;
  const items: Array<{ visible: boolean; label: string; href: string }> = [
    { visible: hubConfig.navigation.showDashboard, label: "Home", href: base },
    { visible: hubConfig.navigation.showInvoices, label: "Invoices", href: `${base}/invoices` },
    { visible: hubConfig.navigation.showQuotes, label: "Quotes", href: `${base}/quotes` },
    { visible: hubConfig.navigation.showPayments, label: "Payments", href: `${base}/payments` },
    { visible: hubConfig.navigation.showAbout, label: "About Us", href: `${base}/about` },
    { visible: hubConfig.navigation.showContact, label: "Contact", href: `${base}/contact` },
    { visible: hubConfig.navigation.showProducts, label: "Products", href: `${base}/products` },
  ];

  return items.filter((item) => item.visible).map(({ href, label }) => ({ href, label }));
}

export function getHubStatusStyles(status: string) {
  switch (status) {
    case "PAID":
    case "ACCEPTED":
    case "SETTLED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "OVERDUE":
    case "DECLINED":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "SENT":
      return "bg-violet-50 text-violet-700 ring-violet-100";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function HubPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-[var(--hub-border)] bg-[var(--hub-surface)] shadow-[0_20px_60px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </section>
  );
}

function HubBadge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${className}`}>
      {children}
    </span>
  );
}

function HubAction({
  label,
  href,
  tone = "primary",
}: {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
}) {
  const classes = tone === "primary"
    ? "bg-[var(--hub-accent)] text-slate-950 shadow-[0_16px_30px_rgba(var(--hub-accent-rgb),0.28)]"
    : "border border-[var(--hub-border)] bg-white/85 text-[var(--hub-text-strong)]";

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${classes}`}
    >
      {label}
    </Link>
  );
}

function HubMetric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string | number;
  caption: string;
}) {
  return (
    <HubPanel className="p-5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--hub-text-soft)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--hub-text-strong)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--hub-text-soft)]">{caption}</p>
    </HubPanel>
  );
}

function HubSectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-base text-[var(--hub-text-soft)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ClientHubHeader({
  orgSlug,
  orgName,
  logoUrl,
  navItems,
}: {
  orgSlug: string;
  orgName: string;
  logoUrl: string | null;
  navItems: NavItem[];
}) {
  return (
    <div className="border-b border-[var(--hub-border)] bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 xl:px-8">
        <Link href={`/portal/${orgSlug}/client-hub`} className="flex items-center gap-3">
          {logoUrl ? (
            // Brand logo URLs are org-controlled and may come from arbitrary hosts,
            // so we keep a plain image here instead of coupling Phase 1 shell work
            // to remote-image configuration.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${orgName} logo`} className="h-11 w-auto max-w-[120px] rounded-2xl object-contain" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--hub-accent)] text-sm font-bold text-slate-950 shadow-[0_16px_30px_rgba(var(--hub-accent-rgb),0.22)]">
              {orgName.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[var(--hub-text-strong)]">{orgName}</p>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Client Hub</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Client hub navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--hub-text-soft)] transition-colors hover:bg-white hover:text-[var(--hub-text-strong)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--hub-text-soft)] md:inline-flex">
            Static preview
          </span>
          <details className="relative lg:hidden">
            <summary className="cursor-pointer list-none rounded-2xl border border-[var(--hub-border)] bg-white/90 p-2 text-[var(--hub-text-soft)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-3xl border border-[var(--hub-border)] bg-white p-2 shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-2xl px-4 py-2.5 text-sm font-medium text-[var(--hub-text-strong)] hover:bg-[var(--hub-accent-wash)]">
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export function ClientHubFooter({
  orgName,
  supportEmail,
  supportPhone,
  footerText,
  showPoweredBy,
}: {
  orgName: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerText: string;
  showPoweredBy: boolean;
}) {
  return (
    <footer className="border-t border-[var(--hub-border)] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-[var(--hub-text-soft)] sm:px-6 xl:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-medium text-[var(--hub-text-strong)]">{orgName}</p>
          <p className="mt-1 text-sm">{footerText}</p>
        </div>
        <div className="flex flex-col gap-1 text-sm lg:items-end">
          {supportEmail && <a href={`mailto:${supportEmail}`} className="font-medium text-[var(--hub-text-strong)] hover:text-[var(--hub-accent)]">{supportEmail}</a>}
          {supportPhone && <a href={`tel:${supportPhone}`} className="font-medium text-[var(--hub-text-strong)] hover:text-[var(--hub-accent)]">{supportPhone}</a>}
          {showPoweredBy && <p className="text-xs uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Powered by Slipwise</p>}
        </div>
      </div>
    </footer>
  );
}

export function ClientHubPreviewShell({
  orgSlug,
  orgName,
  logoUrl,
  config,
  activePath,
  children,
}: {
  orgSlug: string;
  orgName: string;
  logoUrl: string | null;
  config: ClientHubConfig;
  activePath: string;
  children: ReactNode;
}) {
  const navItems = getHubNavItems(orgSlug, config);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-[var(--hub-border)] bg-[#fbfaf6]">
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] bg-white/70 px-4 py-3 text-xs font-medium text-[var(--hub-text-soft)]">
        <span className="rounded-full bg-[var(--hub-accent-wash)] px-2.5 py-1 text-[var(--hub-text-strong)]">Preview</span>
        <span>{activePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.16),_transparent_44%),linear-gradient(180deg,#fff7ef_0%,#fbfaf6_48%,#f7f8fb_100%)]">
        <ClientHubHeader orgSlug={orgSlug} orgName={orgName} logoUrl={logoUrl} navItems={navItems} />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 xl:px-8">{children}</main>
        <ClientHubFooter
          orgName={orgName}
          supportEmail={config.contact.supportEmail}
          supportPhone={config.contact.supportPhone}
          footerText={config.navigation.footerText}
          showPoweredBy={!config.branding.removePoweredBy}
        />
      </div>
    </div>
  );
}

export function ClientHubDashboardView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const pendingQuotes = MOCK_QUOTES.filter((quote) => quote.status === "SENT");

  return (
    <div className="space-y-8">
      <HubPanel className="overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.18),_transparent_48%),linear-gradient(135deg,rgba(255,248,239,0.95),rgba(255,255,255,0.94)_42%,rgba(var(--hub-accent-rgb),0.08)_100%)] p-8 sm:p-10">
        <HubBadge className="bg-white/80 text-[var(--hub-text-strong)] ring-1 ring-[var(--hub-border)]">
          {hubConfig.homeDashboard.welcomeMessage}
        </HubBadge>
        <div className="mt-6 grid gap-8 xl:grid-cols-[1.7fr_1fr]">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)] sm:text-5xl">
              {hubConfig.homeDashboard.heroTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--hub-text-soft)]">
              {hubConfig.homeDashboard.heroSubtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HubAction label="View invoices" href={`/portal/${orgSlug}/client-hub/invoices`} />
              <HubAction label="Review quotes" href={`/portal/${orgSlug}/client-hub/quotes`} tone="secondary" />
              <HubAction label="Contact support" href={`/portal/${orgSlug}/client-hub/contact`} tone="secondary" />
            </div>
          </div>
          <HubPanel className="bg-white/80 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Take action</p>
            <div className="mt-4 space-y-3">
              {PENDING_INVOICES_COUNT > 0 && (
                <div className="rounded-2xl border border-[var(--hub-border)] bg-white/90 p-4">
                  <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Pay {PENDING_INVOICES_COUNT} open invoice{PENDING_INVOICES_COUNT > 1 ? "s" : ""}</p>
                  <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{formatCurrency(OUTSTANDING_BALANCE)} currently outstanding.</p>
                </div>
              )}
              {pendingQuotes.length > 0 && (
                <div className="rounded-2xl border border-[var(--hub-border)] bg-white/90 p-4">
                  <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{pendingQuotes.length} quote awaiting your response</p>
                  <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Keep proposals moving without losing context.</p>
                </div>
              )}
              <div className="rounded-2xl border border-dashed border-[var(--hub-border)] bg-white/60 p-4">
                <p className="text-sm font-medium text-[var(--hub-text-strong)]">Need help fast?</p>
                <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Support contact details stay one click away across the hub.</p>
              </div>
            </div>
          </HubPanel>
        </div>
      </HubPanel>

      <div className="grid gap-4 lg:grid-cols-4">
        {hubConfig.homeDashboard.showOutstandingBalance && (
          <HubMetric label="Outstanding" value={formatCurrency(OUTSTANDING_BALANCE)} caption={`${PENDING_INVOICES_COUNT} invoices currently need attention`} />
        )}
        {hubConfig.homeDashboard.showPendingInvoices && (
          <HubMetric label="Pending invoices" value={PENDING_INVOICES_COUNT} caption="Track due dates before they slip." />
        )}
        {hubConfig.homeDashboard.showPendingQuotes && (
          <HubMetric label="Quotes" value={PENDING_QUOTES_COUNT} caption="Review proposals and respond quickly." />
        )}
        {hubConfig.homeDashboard.showQuickActions && (
          <HubPanel className="p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--hub-text-soft)]">Quick actions</p>
            <div className="mt-4 flex flex-col gap-2">
              <HubAction label="Invoices" href={`/portal/${orgSlug}/client-hub/invoices`} tone="secondary" />
              <HubAction label="Quotes" href={`/portal/${orgSlug}/client-hub/quotes`} tone="secondary" />
            </div>
          </HubPanel>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <HubPanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hub-border)] px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-[var(--hub-text-strong)]">Recent invoices</h2>
              <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Your most recent billing activity.</p>
            </div>
            <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="text-sm font-semibold text-[var(--hub-accent)]">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hub-border)] text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Invoice</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Date</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Amount</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INVOICES.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[var(--hub-border)]/80 last:border-b-0">
                    <td className="px-6 py-4">
                      <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="font-semibold text-[var(--hub-text-strong)] hover:text-[var(--hub-accent)]">
                        #{invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                    <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <HubBadge className={`ring-1 ${getHubStatusStyles(invoice.status)}`}>{invoice.status.replace(/_/g, " ")}</HubBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HubPanel>

        <div className="space-y-6">
          <HubPanel className="overflow-hidden">
            <div className="h-44 bg-[linear-gradient(135deg,rgba(var(--hub-accent-rgb),0.34),rgba(255,248,239,0.98)_70%)]" />
            <div className="p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">About</p>
              <h3 className="mt-3 text-xl font-semibold text-[var(--hub-text-strong)]">A calmer way to work with your team</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
              <Link href={`/portal/${orgSlug}/client-hub/about`} className="mt-4 inline-flex text-sm font-semibold text-[var(--hub-accent)]">Learn more</Link>
            </div>
          </HubPanel>

          <HubPanel className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-[var(--hub-text-strong)]">Quotes awaiting response</h3>
                <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Stay ahead of approvals and next steps.</p>
              </div>
              <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="text-sm font-semibold text-[var(--hub-accent)]">Open</Link>
            </div>
            <div className="mt-5 space-y-3">
              {pendingQuotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--hub-border)] px-4 py-8 text-center text-sm text-[var(--hub-text-soft)]">
                  No pending quotes right now.
                </div>
              ) : (
                pendingQuotes.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--hub-border)] bg-white/90 p-4">
                    <div>
                      <p className="font-semibold text-[var(--hub-text-strong)]">{quote.title}</p>
                      <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Valid until {quote.validUntil}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
                      <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="mt-1 inline-flex text-sm font-semibold text-[var(--hub-accent)]">Review</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </HubPanel>
        </div>
      </div>
    </div>
  );
}

export function ClientHubInvoicesView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <HubSectionHeading
        title={hubConfig.invoices.pageTitle}
        subtitle={hubConfig.invoices.pageDescription}
        action={<HubAction label="Need help?" href={`/portal/${orgSlug}/client-hub/contact`} tone="secondary" />}
      />
      <HubPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="All invoices">
            <thead>
              <tr className="border-b border-[var(--hub-border)] bg-white/70 text-left">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Invoice #</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Date</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Due date</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Amount</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Status</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Remaining</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((invoice) => (
                <tr key={invoice.id} className="border-b border-[var(--hub-border)]/75 last:border-b-0">
                  <td className="px-6 py-4 font-semibold text-[var(--hub-accent)]">#{invoice.invoiceNumber}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                  <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</td>
                  <td className="px-6 py-4">
                    <HubBadge className={`ring-1 ${getHubStatusStyles(invoice.status)}`}>{invoice.status.replace(/_/g, " ")}</HubBadge>
                  </td>
                  <td className="px-6 py-4 text-[var(--hub-text-strong)]">{invoice.remainingAmount > 0 ? formatCurrency(invoice.remainingAmount) : "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="text-sm font-semibold text-[var(--hub-accent)]">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubPanel>
    </div>
  );
}

export function ClientHubInvoiceDetailView({
  orgSlug,
  invoiceId,
  config,
}: {
  orgSlug: string;
  invoiceId: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const invoice = getMockInvoice(invoiceId);
  if (!invoice) return null;

  const showPaymentMethods = hubConfig.payments.showPaymentMethods && invoice.status !== "PAID" && invoice.remainingAmount > 0;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="hover:text-[var(--hub-text-strong)]">Invoices</Link>
        <span>›</span>
        <span className="font-medium text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</span>
      </nav>

      <HubPanel className="overflow-hidden">
        <div className="bg-[linear-gradient(135deg,rgba(var(--hub-accent-rgb),0.92),rgba(var(--hub-accent-rgb),0.62))] px-8 py-12 text-slate-950">
          <HubBadge className="bg-white/80 text-slate-950 ring-1 ring-white/60">{invoice.status.replace(/_/g, " ")}</HubBadge>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em]">Invoice #{invoice.invoiceNumber}</h1>
          <p className="mt-3 max-w-2xl text-base text-slate-900/75">{invoice.description || "Professional services rendered."}</p>
          {invoice.remainingAmount > 0 && (
            <div className="mt-8 rounded-3xl bg-white/84 px-6 py-5 text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.1)]">
              <p className="text-sm font-medium text-slate-700">Amount due</p>
              <p className="mt-2 text-4xl font-semibold">{formatCurrency(invoice.remainingAmount)}</p>
            </div>
          )}
        </div>
        <div className="grid gap-4 border-t border-[var(--hub-border)] px-8 py-8 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Issued</p>
            <p className="mt-2 text-base font-semibold text-[var(--hub-text-strong)]">{invoice.invoiceDate}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Due date</p>
            <p className="mt-2 text-base font-semibold text-[var(--hub-text-strong)]">{invoice.dueDate ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-soft)]">Total amount</p>
            <p className="mt-2 text-base font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</p>
          </div>
        </div>
      </HubPanel>

      {invoice.status === "PAID" && (
        <HubPanel className="border-emerald-100 bg-emerald-50/80 p-6">
          <p className="text-lg font-semibold text-emerald-900">This invoice has been paid in full.</p>
          <p className="mt-2 text-sm text-emerald-800">Thank you. This static shell keeps the completion state visible without wiring live payment reconciliation yet.</p>
        </HubPanel>
      )}

      {showPaymentMethods && (
        <HubPanel className="p-8">
          <HubSectionHeading
            title="How would you like to pay?"
            subtitle="Choose a payment route. This remains a static selection shell in Phase 1."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {hubConfig.payments.acceptedMethods.map((method) => (
              <button
                key={method}
                type="button"
                disabled
                className="rounded-[28px] border border-[var(--hub-border)] bg-white/90 p-6 text-left opacity-80 transition hover:border-[var(--hub-accent)] disabled:cursor-not-allowed"
                title="Static payment selection shell"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold text-[var(--hub-text-strong)]">{method}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--hub-text-soft)]">
                      {method === "Payment Link"
                        ? "Secure online payment via your configured processor."
                        : method === "Bank Transfer"
                          ? "Transfer directly to our business banking account."
                          : "Use your preferred digital payment route."}
                    </p>
                  </div>
                  <span className="mt-1 h-5 w-5 rounded-full border border-[var(--hub-border)] bg-white" />
                </div>
              </button>
            ))}
          </div>
        </HubPanel>
      )}
    </div>
  );
}

export function ClientHubQuotesView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <HubSectionHeading title={hubConfig.quotes.pageTitle} subtitle={hubConfig.quotes.pageDescription} />
      <div className="grid gap-4">
        {MOCK_QUOTES.map((quote) => (
          <HubPanel key={quote.id} className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-[var(--hub-text-strong)]">{quote.title}</h2>
                  <HubBadge className={`ring-1 ${getHubStatusStyles(quote.status)}`}>{quote.status}</HubBadge>
                </div>
                <p className="mt-2 text-sm text-[var(--hub-text-soft)]">Quote #{quote.quoteNumber} · Valid until {quote.validUntil}</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
                <HubAction label="Review quote" href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} />
              </div>
            </div>
          </HubPanel>
        ))}
      </div>
    </div>
  );
}

export function ClientHubQuoteDetailView({
  quoteId,
  config,
}: {
  quoteId: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const quote = getMockQuote(quoteId);
  if (!quote) return null;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <span>Quotes</span>
        <span>›</span>
        <span className="font-medium text-[var(--hub-text-strong)]">#{quote.quoteNumber}</span>
      </nav>

      <HubPanel className="p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">{quote.title}</h1>
              <HubBadge className={`ring-1 ${getHubStatusStyles(quote.status)}`}>{quote.status}</HubBadge>
            </div>
            <p className="mt-3 max-w-2xl text-base text-[var(--hub-text-soft)]">Proposal issued {quote.issueDate}. Review pricing and let us know how you want to move forward before {quote.validUntil}.</p>
          </div>
          <div className="rounded-[24px] border border-[var(--hub-border)] bg-[var(--hub-accent-wash)] px-6 py-5">
            <p className="text-sm font-medium text-[var(--hub-text-soft)]">Quoted amount</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
          </div>
        </div>
      </HubPanel>

      {quote.status === "ACCEPTED" && (
        <HubPanel className="border-emerald-100 bg-emerald-50/80 p-6">
          <p className="text-lg font-semibold text-emerald-900">You accepted this quote.</p>
          <p className="mt-2 text-sm text-emerald-800">Future phases will connect this state to live project and document workflows.</p>
        </HubPanel>
      )}

      {quote.status === "DECLINED" && (
        <HubPanel className="border-rose-100 bg-rose-50/80 p-6">
          <p className="text-lg font-semibold text-rose-900">You declined this quote.</p>
          <p className="mt-2 text-sm text-rose-800">This remains a static representation of the future response timeline.</p>
        </HubPanel>
      )}

      {hubConfig.quotes.showAcceptReject && quote.canRespond && (
        <HubPanel className="p-8">
          <h2 className="text-2xl font-semibold text-[var(--hub-text-strong)]">Your response</h2>
          <p className="mt-2 text-base text-[var(--hub-text-soft)]">Response actions stay disabled in Phase 1, but the placement reflects the future approval flow.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" disabled className="rounded-2xl bg-[var(--hub-accent)] px-5 py-3 text-sm font-semibold text-slate-950 opacity-75">
              Accept quote
            </button>
            <button type="button" disabled className="rounded-2xl border border-[var(--hub-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--hub-text-strong)] opacity-75">
              Decline quote
            </button>
          </div>
        </HubPanel>
      )}
    </div>
  );
}

export function ClientHubPaymentsView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const openInvoices = MOCK_INVOICES.filter((invoice) => invoice.remainingAmount > 0);

  return (
    <div className="space-y-8">
      <HubSectionHeading title={hubConfig.payments.pageTitle} subtitle={hubConfig.payments.pageDescription} />
      <div className="grid gap-4 md:grid-cols-2">
        <HubMetric label="Total paid" value={formatCurrency(TOTAL_PAID)} caption="Completed payments recorded in this static shell." />
        <HubMetric label="Outstanding" value={formatCurrency(OUTSTANDING_BALANCE)} caption="Balance still awaiting settlement." />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <HubPanel className="p-6">
          <h2 className="text-xl font-semibold text-[var(--hub-text-strong)]">Outstanding invoices</h2>
          <div className="mt-5 space-y-3">
            {openInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--hub-border)] bg-white/90 p-4">
                <div>
                  <p className="font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</p>
                  <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Due {invoice.dueDate}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount || invoice.totalAmount)}</p>
                  <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="mt-1 inline-flex text-sm font-semibold text-[var(--hub-accent)]">Open invoice</Link>
                </div>
              </div>
            ))}
          </div>
        </HubPanel>
        <HubPanel className="p-6">
          <h2 className="text-xl font-semibold text-[var(--hub-text-strong)]">Payment methods</h2>
          <div className="mt-5 space-y-3">
            {hubConfig.payments.acceptedMethods.map((method) => (
              <div key={method} className="rounded-2xl border border-[var(--hub-border)] bg-white/90 p-4">
                <p className="font-semibold text-[var(--hub-text-strong)]">{method}</p>
                <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Display-only Phase 1 selection for future payment enablement.</p>
              </div>
            ))}
          </div>
        </HubPanel>
      </div>
      <HubPanel className="overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-5">
          <h2 className="text-xl font-semibold text-[var(--hub-text-strong)]">Payment history</h2>
        </div>
        <div className="divide-y divide-[var(--hub-border)]">
          {MOCK_PAYMENTS.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="font-semibold text-[var(--hub-text-strong)]">Invoice #{payment.invoiceNumber}</p>
                <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{payment.paidAt} · {payment.method}</p>
              </div>
              <HubBadge className={`ring-1 ${getHubStatusStyles(payment.status)}`}>{payment.status}</HubBadge>
            </div>
          ))}
        </div>
      </HubPanel>
    </div>
  );
}

export function ClientHubAboutView({
  config,
}: {
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <HubSectionHeading title={hubConfig.about.heading} subtitle="Everything clients need to understand how you work, what you value, and why they can trust the experience." />
      <HubPanel className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[linear-gradient(135deg,rgba(var(--hub-accent-rgb),0.2),rgba(255,248,239,0.96)_70%)] p-8">
            <HubBadge className="bg-white/80 text-[var(--hub-text-strong)] ring-1 ring-[var(--hub-border)]">About</HubBadge>
            <p className="mt-5 text-base leading-8 text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
          </div>
          <div className="grid gap-4 p-8 sm:grid-cols-2">
            <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Clarity</p>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">Every key client action is framed to feel simple and trustworthy.</p>
            </div>
            <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Reliability</p>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">Quotes, invoices, and support paths are presented with calm operational confidence.</p>
            </div>
            <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5 sm:col-span-2">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Relationship first</p>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">
                {hubConfig.about.showFoundedYear && hubConfig.about.foundedYear
                  ? `Serving clients since ${hubConfig.about.foundedYear}. `
                  : ""}
                The public hub should feel like a governed, premium extension of your team.
              </p>
            </div>
          </div>
        </div>
      </HubPanel>
    </div>
  );
}

export function ClientHubContactView({
  config,
}: {
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <HubSectionHeading title={hubConfig.contact.pageTitle} subtitle={hubConfig.contact.heading} />
      <HubPanel className="p-8">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5">
                <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Email</p>
                <p className="mt-3 text-lg font-semibold text-[var(--hub-text-strong)]">{hubConfig.contact.supportEmail}</p>
                <p className="mt-2 text-sm text-[var(--hub-text-soft)]">We usually respond within one business day.</p>
              </div>
              <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5">
                <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Phone</p>
                <p className="mt-3 text-lg font-semibold text-[var(--hub-text-strong)]">{hubConfig.contact.supportPhone}</p>
                <p className="mt-2 text-sm text-[var(--hub-text-soft)]">Call for urgent billing or delivery questions.</p>
              </div>
            </div>
            <div className="rounded-3xl border border-[var(--hub-border)] bg-white/90 p-5">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Business hours</p>
              <p className="mt-3 text-base font-medium text-[var(--hub-text-strong)]">{hubConfig.contact.businessHours}</p>
              <p className="mt-2 text-sm text-[var(--hub-text-soft)]">Outside business hours, your next best step is still clear and visible inside the hub.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl border border-[var(--hub-border)] bg-[linear-gradient(135deg,rgba(var(--hub-accent-rgb),0.16),rgba(255,248,239,0.92))] p-5">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Support framing</p>
              <p className="mt-3 text-sm leading-7 text-[var(--hub-text-soft)]">When clients contact you, the experience should feel routed, trustworthy, and easy to scan.</p>
            </div>
            {hubConfig.contact.showMapPlaceholder && (
              <div className="rounded-3xl border border-dashed border-[var(--hub-border)] bg-white/80 p-5 text-sm text-[var(--hub-text-soft)]">
                Office / location module placeholder for later branded content phases.
              </div>
            )}
          </div>
        </div>
      </HubPanel>
    </div>
  );
}

export function ClientHubProductsView({
  config,
}: {
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <HubSectionHeading title={hubConfig.products.heading} subtitle={hubConfig.products.description} />
      <div className="grid gap-4 lg:grid-cols-2">
        {MOCK_PRODUCTS.map((product) => (
          <HubPanel key={product.id} className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xl font-semibold text-[var(--hub-text-strong)]">{product.name}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">{product.description}</p>
              </div>
              {hubConfig.products.showPricing && (
                <div className="rounded-2xl bg-[var(--hub-accent-wash)] px-4 py-3 text-right">
                  <p className="text-lg font-semibold text-[var(--hub-text-strong)]">{formatCurrency(product.price)}</p>
                  {hubConfig.products.showUnit && <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">per {product.unit}</p>}
                </div>
              )}
            </div>
          </HubPanel>
        ))}
      </div>
    </div>
  );
}
