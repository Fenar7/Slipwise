import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ClientHubConfig } from "./customization-contract";
import {
  getMockInvoice,
  getMockQuote,
  MOCK_INVOICES,
  MOCK_PAYMENTS,
  MOCK_PRODUCTS,
  MOCK_QUOTES,
  OUTSTANDING_BALANCE,
  TOTAL_PAID,
  PENDING_INVOICES_COUNT,
  PENDING_QUOTES_COUNT,
} from "./mock-data";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import { PaymentMethodSelector } from "./payment-method-selector";

export const DEFAULT_HUB_ACCENT = "#7bdcb5";

type NavItem = {
  href: string;
  label: string;
};

type SidebarItem = {
  href: string;
  label: string;
  shortLabel: string;
};

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 123, g: 220, b: 181 };
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
    "--hub-accent-faint": `rgba(${r}, ${g}, ${b}, 0.07)`,
    "--hub-accent-wash": `rgba(${r}, ${g}, ${b}, 0.04)`,
    "--hub-text-strong": "#162033",
    "--hub-text-soft": "#62708a",
    "--hub-text-muted": "#97a3b8",
    "--hub-border": "rgba(21, 32, 51, 0.1)",
    "--hub-card-shadow": "none",
    "--hub-hero-gradient": `radial-gradient(circle at 50% 0%, rgba(${r},${g},${b},0.18) 0%, rgba(232,196,180,0.55) 34%, rgba(255,248,241,0.98) 70%)`,
  } as CSSProperties;
}

export function getHubConfig(config?: ClientHubConfig) {
  return config ?? DEFAULT_CLIENT_HUB_CONFIG;
}

export function getHubNavItems(orgSlug: string, config?: ClientHubConfig): NavItem[] {
  const hubConfig = getHubConfig(config);
  const base = `/portal/${orgSlug}/client-hub`;
  const items: Array<{ visible: boolean; href: string; label: string }> = [
    { visible: hubConfig.navigation.showDashboard, href: base, label: "Home" },
    { visible: hubConfig.navigation.showAbout, href: `${base}/about`, label: "About Us" },
    { visible: hubConfig.navigation.showContact, href: `${base}/contact`, label: "Contact" },
  ];
  return items.filter((item) => item.visible).map(({ href, label }) => ({ href, label }));
}

function getSidebarItems(orgSlug: string, config?: ClientHubConfig): SidebarItem[] {
  const hubConfig = getHubConfig(config);
  const base = `/portal/${orgSlug}/client-hub`;
  const items: Array<{ visible: boolean; href: string; label: string; shortLabel: string }> = [
    { visible: hubConfig.navigation.showDashboard, href: base, label: "Home", shortLabel: "H" },
    { visible: hubConfig.navigation.showInvoices, href: `${base}/invoices`, label: "Invoices", shortLabel: "I" },
    { visible: hubConfig.navigation.showQuotes, href: `${base}/quotes`, label: "Quotes", shortLabel: "Q" },
    { visible: hubConfig.navigation.showPayments, href: `${base}/payments`, label: "Payments", shortLabel: "P" },
    { visible: hubConfig.navigation.showProducts, href: `${base}/products`, label: "Products & Services", shortLabel: "S" },
  ];
  return items.filter((item) => item.visible).map(({ href, label, shortLabel }) => ({ href, label, shortLabel }));
}

function getStatusStyles(status: string) {
  switch (status) {
    case "PAID":
    case "ACCEPTED":
    case "SETTLED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "UNPAID":
    case "SENT":
      return "bg-sky-50 text-sky-700 ring-sky-100";
    case "DECLINED":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function ShellCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-[22px] border border-[var(--hub-border)] bg-white ${className}`}>{children}</section>;
}

function StatusPill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${className}`}>{children}</span>;
}

function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-lg text-[var(--hub-text-soft)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function TopNav({
  orgName,
  logoUrl,
  navItems,
}: {
  orgName: string;
  logoUrl: string | null;
  navItems: NavItem[];
}) {
  return (
    <header className="border-b border-[var(--hub-border)] bg-white">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-6 px-6 py-3.5 lg:px-10">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${orgName} logo`} className="h-10 w-10 rounded-xl object-cover ring-1 ring-[var(--hub-border)]" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-sm font-bold text-[var(--hub-accent)]">
              {orgName.charAt(0)}
            </span>
          )}
          <div>
            <p className="text-base font-semibold tracking-[-0.02em] text-[var(--hub-text-strong)]">{orgName}</p>
            <p className="text-xs font-medium text-[var(--hub-text-soft)]">Client Hub</p>
          </div>
        </div>

        <nav className="hidden items-center gap-10 md:flex" aria-label="Client hub top navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-semibold text-[var(--hub-text-strong)] transition-colors hover:text-[var(--hub-accent)]">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full border border-[var(--hub-border)] bg-white px-3 py-1.5 md:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] text-xs font-bold text-[var(--hub-text-strong)]">HA</span>
            <span className="text-sm font-semibold text-[var(--hub-text-strong)]">Hadi Azeez</span>
          </div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172036] text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  orgSlug,
  config,
  activePath,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
  activePath: string;
}) {
  const items = getSidebarItems(orgSlug, config);

  return (
    <ShellCard className="sticky top-8 h-fit p-4">
      <nav className="space-y-2" aria-label="Client hub sidebar">
        {items.map((item) => {
          const isActive = activePath === item.href || activePath.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-[var(--hub-accent-soft)] bg-[var(--hub-accent-wash)] text-[var(--hub-text-strong)]"
                  : "border-transparent text-[var(--hub-text-soft)] hover:border-[var(--hub-border)] hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isActive ? "border-[var(--hub-accent-soft)] bg-[var(--hub-accent-faint)] text-[var(--hub-accent)]" : "border-[var(--hub-border)] bg-white text-[var(--hub-text-muted)]"}`}>
                {item.shortLabel}
              </span>
              <span className="truncate">{item.label}</span>
              {isActive && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--hub-accent)]" />}
            </Link>
          );
        })}
      </nav>
    </ShellCard>
  );
}

function DashboardHero({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  const actions = [
    { href: `/portal/${orgSlug}/client-hub/invoices`, label: "View Invoices" },
    { href: `/portal/${orgSlug}/client-hub/quotes`, label: "Review Quotes" },
    { href: `/portal/${orgSlug}/client-hub/products`, label: "Browse Services" },
  ];

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-[var(--hub-border)] px-6 py-12 text-center sm:px-10 sm:py-16" style={{ background: "var(--hub-hero-gradient)" }}>
      <StatusPill className="bg-white text-[var(--hub-text-strong)] ring-[var(--hub-border)]">{config.homeDashboard.welcomeMessage}</StatusPill>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl lg:text-6xl">{config.homeDashboard.heroTitle}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[var(--hub-text-soft)] sm:text-xl">{config.homeDashboard.heroSubtitle}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--hub-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardActionBoard({ orgSlug }: { orgSlug: string }) {
  const pendingInvoice = MOCK_INVOICES.find((inv) => inv.remainingAmount > 0);
  const pendingQuote = MOCK_QUOTES.find((qt) => qt.canRespond);

  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--hub-text-strong)]">Take Actions</h2>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-faint)] px-2 text-xs font-bold text-[var(--hub-accent)]">
          {PENDING_INVOICES_COUNT + PENDING_QUOTES_COUNT}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {pendingInvoice && (
          <div className="flex items-center gap-4 rounded-[18px] border border-[var(--hub-border)] p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">I</span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--hub-text-strong)]">Pay {PENDING_INVOICES_COUNT} invoice{PENDING_INVOICES_COUNT !== 1 ? "s" : ""}</p>
              <p className="text-sm text-[var(--hub-text-soft)]">{formatCurrency(pendingInvoice.remainingAmount)} pending</p>
            </div>
            <Link href={`/portal/${orgSlug}/client-hub/invoices/${pendingInvoice.id}`} className="rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
              View Invoice
            </Link>
          </div>
        )}

        {pendingQuote && (
          <div className="flex items-center gap-4 rounded-[18px] border border-[var(--hub-border)] p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600">Q</span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--hub-text-strong)]">Respond to {PENDING_QUOTES_COUNT} quote{PENDING_QUOTES_COUNT !== 1 ? "s" : ""}</p>
              <p className="text-sm text-[var(--hub-text-soft)]">Awaiting your response</p>
            </div>
            <Link href={`/portal/${orgSlug}/client-hub/quotes/${pendingQuote.id}`} className="rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
              Review Quote
            </Link>
          </div>
        )}
      </div>
    </ShellCard>
  );
}

function SupportCard({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  return (
    <ShellCard className="overflow-hidden">
      <div className="h-40 border-b border-[var(--hub-border)] bg-cover bg-center" style={{ backgroundImage: "linear-gradient(135deg, rgba(var(--hub-accent-rgb), 0.14), rgba(21, 32, 51, 0.08)), url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80')" }} />
      <div className="p-6">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">About Us</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--hub-text-soft)]">{config.about.body}</p>
        <Link href={`/portal/${orgSlug}/client-hub/about`} className="mt-4 inline-flex text-sm font-semibold text-[var(--hub-accent)]">Learn More →</Link>
      </div>
    </ShellCard>
  );
}

function PendingInvoicesCard({ orgSlug }: { orgSlug: string }) {
  const pending = MOCK_INVOICES.filter((invoice) => invoice.remainingAmount > 0);

  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Pending Invoices</h3>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-faint)] px-2 text-xs font-bold text-[var(--hub-accent)]">{pending.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {pending.map((invoice) => (
          <div key={invoice.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-[var(--hub-border)] p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</p>
              <p className="text-xs text-[var(--hub-text-soft)]">Due {invoice.dueDate}</p>
            </div>
            <p className="shrink-0 text-base font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount)}</p>
          </div>
        ))}
      </div>
      <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
        View All
      </Link>
    </ShellCard>
  );
}

function PendingQuotesCard({ orgSlug }: { orgSlug: string }) {
  const pending = MOCK_QUOTES.filter((quote) => quote.canRespond);

  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Pending Quotes</h3>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-faint)] px-2 text-xs font-bold text-[var(--hub-accent)]">{pending.length}</span>
      </div>
      {pending.length > 0 ? (
        <div className="mt-4 space-y-3">
          {pending.map((quote) => (
            <div key={quote.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-[var(--hub-border)] p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--hub-text-strong)]">{quote.title}</p>
                <p className="text-xs text-[var(--hub-text-soft)]">Valid until {quote.validUntil}</p>
              </div>
              <p className="shrink-0 text-base font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-[132px] items-center justify-center rounded-[18px] border border-dashed border-[var(--hub-border)] text-sm text-[var(--hub-text-soft)]">
          No pending quotes
        </div>
      )}
      <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
        View All
      </Link>
    </ShellCard>
  );
}

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--hub-border)] bg-[var(--hub-accent-wash)] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hub-text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{hint}</p>
    </div>
  );
}

function WorkspacePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <ShellCard className="p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </ShellCard>
  );
}

function WorkspaceAlertItem({
  title,
  detail,
  tone = "default",
}: {
  title: string;
  detail: string;
  tone?: "default" | "accent" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[var(--hub-accent-soft)] bg-[var(--hub-accent-wash)]"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50/60"
        : "border-[var(--hub-border)] bg-white";

  return (
    <div className={`rounded-[16px] border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{detail}</p>
    </div>
  );
}

function WorkspaceSupportRail({
  orgSlug,
  config,
  primaryLabel,
  primaryHref,
}: {
  orgSlug: string;
  config: ClientHubConfig;
  primaryLabel: string;
  primaryHref: string;
}) {
  return (
    <div className="space-y-4">
      <WorkspacePanel title="Notification Overview">
        <WorkspaceAlertItem title="1 quote awaiting response" detail="Review before 12 Nov 2025 to keep pricing locked." tone="accent" />
        <WorkspaceAlertItem title="2 invoices need attention" detail="One invoice is overdue and one is partially paid." tone="warning" />
        <WorkspaceAlertItem title="Support team available" detail="Email replies typically land within one business day." />
      </WorkspacePanel>

      <WorkspacePanel title="Quick Access">
        <Link
          href={primaryHref}
          className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
        >
          {primaryLabel}
        </Link>
        <Link
          href={`/portal/${orgSlug}/client-hub/contact`}
          className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
        >
          Contact Support
        </Link>
      </WorkspacePanel>

      <WorkspacePanel title="Support Desk">
        <div className="rounded-[16px] border border-[var(--hub-border)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{config.contact.supportEmail}</p>
          <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{config.contact.supportPhone}</p>
          <p className="mt-3 text-sm text-[var(--hub-text-soft)]">Mon–Fri, 9:00 AM – 6:00 PM GST</p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

export function ClientHubHeader({
  orgName,
  logoUrl,
  navItems,
}: {
  orgName: string;
  logoUrl: string | null;
  navItems: NavItem[];
}) {
  return <TopNav orgName={orgName} logoUrl={logoUrl} navItems={navItems} />;
}

export function ClientHubFooter({
  showPoweredBy,
  footerText,
  orgName,
  supportEmail,
  supportPhone,
}: {
  orgName: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerText: string;
  showPoweredBy: boolean;
}) {
  return (
    <footer className="border-t border-[var(--hub-border)] bg-white py-8 text-center">
      <p className="text-sm font-medium text-[var(--hub-text-strong)]">{orgName}</p>
      <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{footerText}</p>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-[var(--hub-text-muted)]">
        {supportEmail && <span>{supportEmail}</span>}
        {supportEmail && supportPhone && <span>·</span>}
        {supportPhone && <span>{supportPhone}</span>}
      </div>
      {showPoweredBy && <p className="mt-4 text-xs text-[var(--hub-text-muted)]">Powered by <span className="font-semibold text-[var(--hub-accent)]">Slipwise</span></p>}
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
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-[var(--hub-border)] bg-[#fbfbf8]" style={buildHubThemeStyle(config.branding.accentColor)}>
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] bg-white px-4 py-2.5 text-xs font-medium text-[var(--hub-text-soft)]">
        <span className="rounded-full border border-[var(--hub-border)] bg-white px-2.5 py-1 text-[var(--hub-text-strong)]">Preview</span>
        <span className="truncate">{activePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#fbfbf8]">
        <TopNav orgName={orgName} logoUrl={logoUrl} navItems={getHubNavItems(orgSlug, config)} />
        <main className="mx-auto w-full max-w-[1480px] px-6 py-8 lg:px-10">{children}</main>
        <ClientHubFooter orgName={orgName} footerText={config.navigation.footerText} showPoweredBy={!config.branding.removePoweredBy} supportEmail={config.contact.supportEmail} supportPhone={config.contact.supportPhone} />
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
  const basePath = `/portal/${orgSlug}/client-hub`;

  return (
    <div className="space-y-8">
      <DashboardHero orgSlug={orgSlug} config={hubConfig} />
      <div className="grid gap-6 xl:grid-cols-[260px_1fr_340px]">
        <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
        <DashboardActionBoard orgSlug={orgSlug} />
        <SupportCard orgSlug={orgSlug} config={hubConfig} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <PendingInvoicesCard orgSlug={orgSlug} />
        <PendingQuotesCard orgSlug={orgSlug} />
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
  const basePath = `/portal/${orgSlug}/client-hub/invoices`;
  const dueSoon = MOCK_INVOICES.filter((invoice) => invoice.remainingAmount > 0).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] bg-[var(--hub-accent-wash)] px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">{hubConfig.invoices.pageTitle}</h1>
                <p className="mt-2 max-w-2xl text-lg text-[var(--hub-text-soft)]">{hubConfig.invoices.pageDescription}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="inline-flex items-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
                  Review Quotes
                </Link>
                <Link href={`/portal/${orgSlug}/client-hub/contact`} className="inline-flex items-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
                  Need help?
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-3">
            <SummaryMetric label="Outstanding" value={formatCurrency(OUTSTANDING_BALANCE)} hint="Across open invoices" />
            <SummaryMetric label="Invoices Open" value={`${dueSoon}`} hint="Ready for review or payment" />
            <SummaryMetric label="Payment Options" value="3 methods" hint="Payment link, bank transfer, UPI" />
          </div>
        </ShellCard>

        <ShellCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hub-border)] px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-[var(--hub-text-strong)]">Invoice List</h2>
              <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Track payment status, due dates, and what still needs action.</p>
            </div>
            <div className="rounded-full border border-[var(--hub-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
              {MOCK_INVOICES.length} records
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hub-border)] text-left">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Invoice #</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Date</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Due</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Amount</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Remaining</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">Action</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INVOICES.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[var(--hub-border)] last:border-b-0">
                    <td className="px-6 py-5 font-semibold text-[var(--hub-accent)]">#{invoice.invoiceNumber}</td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                    <td className="px-6 py-5 font-medium text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="px-6 py-5"><StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill></td>
                    <td className="px-6 py-5 text-[var(--hub-text-strong)]">{invoice.remainingAmount > 0 ? formatCurrency(invoice.remainingAmount) : "—"}</td>
                    <td className="px-6 py-5 text-right">
                      <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ShellCard>
      </div>

      <WorkspaceSupportRail
        orgSlug={orgSlug}
        config={hubConfig}
        primaryHref={`/portal/${orgSlug}/client-hub/payments`}
        primaryLabel="View Payment Methods"
      />
    </div>
  );
}

export function ClientHubInvoiceDetailView({
  orgSlug,
  invoiceId,
}: {
  orgSlug: string;
  invoiceId: string;
  config?: ClientHubConfig;
}) {
  const invoice = getMockInvoice(invoiceId);
  if (!invoice) return null;

  const amountDue = invoice.remainingAmount || invoice.totalAmount;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">Invoices</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</span>
      </nav>

      <section className="overflow-hidden border border-[var(--hub-border)] px-6 py-12 text-center text-white sm:px-10 sm:py-16" style={{ background: `linear-gradient(135deg, var(--hub-accent), rgba(var(--hub-accent-rgb), 0.85))` }}>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-white ring-1 ring-white/50">
          <span className="text-lg font-bold text-[var(--hub-accent)]">{invoice.fromName.charAt(0)}</span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">{invoice.fromName}</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hi {invoice.clientName},</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/90">Your payment of {formatCurrency(amountDue)} is due on {invoice.dueDate}.</p>
      </section>

      <div className="-mt-16 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[920px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-3xl">Invoice #{invoice.invoiceNumber}</h2>
              <StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill>
            </div>
            <div className="flex items-center gap-2 text-[var(--hub-text-muted)]">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50" aria-label="Print invoice">🖨</button>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50" aria-label="Download invoice">↓</button>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:px-8 sm:py-8 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">From</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{invoice.fromName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">To</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{invoice.clientName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Issue Date</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{invoice.invoiceDate}</p>
            </div>
          </div>

          {invoice.remainingAmount > 0 && (
            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}/payment`} className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--hub-accent)] px-6 py-4 text-base font-semibold text-[#152033] transition hover:brightness-[0.98]">
                PAY NOW
              </Link>
            </div>
          )}
        </ShellCard>
      </div>

      <ShellCard className="mx-auto max-w-[920px] overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
          <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--hub-accent-soft)] text-left">
              <tr>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">No</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Item</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Quantity</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Price</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, index) => (
                <tr key={item.id} className="border-b border-[var(--hub-border)] last:border-b-0">
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{index + 1}</td>
                  <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{item.name}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{item.quantity}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{formatCurrency(item.price)}</td>
                  <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(item.quantity * item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <div className="ml-auto max-w-xs space-y-3 text-base">
            <div className="flex items-center justify-between">
              <span className="text-[var(--hub-text-soft)]">Subtotal</span>
              <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--hub-border)] pt-3">
              <span className="text-lg font-semibold text-[var(--hub-text-strong)]">Total</span>
              <span className="text-lg font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>
      </ShellCard>
    </div>
  );
}

export function ClientHubPaymentSelectionView({
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

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">Invoices</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="transition hover:text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">Payment</span>
      </nav>

      <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hub-text-soft)] transition hover:text-[var(--hub-text-strong)]">
        ← Invoice #{invoice.invoiceNumber}
      </Link>

      <PaymentMethodSelector invoice={invoice} acceptedMethods={hubConfig.payments.acceptedMethods} />
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
  const basePath = `/portal/${orgSlug}/client-hub/quotes`;
  const openQuotes = MOCK_QUOTES.filter((quote) => quote.canRespond).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] bg-[var(--hub-accent-wash)] px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">{hubConfig.quotes.pageTitle}</h1>
                <p className="mt-2 max-w-2xl text-lg text-[var(--hub-text-soft)]">{hubConfig.quotes.pageDescription}</p>
              </div>
              <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="inline-flex items-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
                Go to Invoices
              </Link>
            </div>
          </div>
          <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-3">
            <SummaryMetric label="Awaiting Reply" value={`${openQuotes}`} hint="Quotations still awaiting your decision" />
            <SummaryMetric label="Accepted" value={`${MOCK_QUOTES.length - openQuotes}`} hint="Already confirmed this cycle" />
            <SummaryMetric label="Avg. Quote Value" value={formatCurrency(Math.round(MOCK_QUOTES.reduce((sum, quote) => sum + quote.totalAmount, 0) / MOCK_QUOTES.length))} hint="Based on current mock proposals" />
          </div>
        </ShellCard>
        <div className="space-y-4">
          {MOCK_QUOTES.map((quote) => (
            <ShellCard key={quote.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-[var(--hub-text-strong)] sm:text-xl">{quote.title}</h2>
                    <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--hub-text-soft)]">Quote #{quote.quoteNumber} · Valid until {quote.validUntil}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 sm:text-right">
                  <p className="text-xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
                  <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50">
                    Review
                  </Link>
                </div>
              </div>
            </ShellCard>
          ))}
        </div>
      </div>

      <WorkspaceSupportRail
        orgSlug={orgSlug}
        config={hubConfig}
        primaryHref={`/portal/${orgSlug}/client-hub/quotes/${MOCK_QUOTES[0]?.id ?? "qt-001"}`}
        primaryLabel="Open Pending Quote"
      />
    </div>
  );
}

export function ClientHubQuoteDetailView({
  quoteId,
  orgSlug = "acme",
  config,
}: {
  quoteId: string;
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const quote = getMockQuote(quoteId);
  if (!quote) return null;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="transition hover:text-[var(--hub-text-strong)]">Quotes</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">#{quote.quoteNumber}</span>
      </nav>

      <section className="overflow-hidden border border-[var(--hub-border)] px-6 py-12 text-center text-white sm:px-10 sm:py-16" style={{ background: `linear-gradient(135deg, var(--hub-accent), rgba(var(--hub-accent-rgb), 0.85))` }}>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-white ring-1 ring-white/50">
          <span className="text-lg font-bold text-[var(--hub-accent)]">Q</span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Quotation</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hi Hadi Azeez,</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/90">Please review the quotation details below.</p>
        <p className="mx-auto mt-3 max-w-xl text-base font-medium text-white/80">{quote.title}</p>
      </section>

      <div className="-mt-16 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[920px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-3xl">Quotation #{quote.quoteNumber}</h2>
              <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
            </div>
            <div className="flex items-center gap-2 text-[var(--hub-text-muted)]">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50" aria-label="Print quote">🖨</button>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50" aria-label="Download quote">↓</button>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:px-8 sm:py-8 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">From</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{hubConfig.branding.organizationName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">To</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">Hadi Azeez</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Issue Date</p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{quote.issueDate}</p>
            </div>
          </div>

          {quote.canRespond ? (
            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Your Response</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled className="inline-flex items-center justify-center rounded-xl bg-[var(--hub-accent)] px-6 py-3.5 text-sm font-semibold text-[#152033] disabled:cursor-not-allowed disabled:opacity-80">
                  Accept Quote
                </button>
                <button type="button" disabled className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-3.5 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-80">
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-sm font-semibold text-emerald-800">You accepted this quote.</div>
            </div>
          )}
        </ShellCard>
      </div>

      <ShellCard className="mx-auto max-w-[920px] overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
          <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--hub-accent-soft)] text-left">
              <tr>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">No</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Item</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">User</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Price</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-strong)]">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--hub-border)]">
                <td className="px-6 py-4 text-[var(--hub-text-soft)]">1</td>
                <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">LinkedIn inbox yearly</td>
                <td className="px-6 py-4 text-[var(--hub-text-soft)]">-</td>
                <td className="px-6 py-4 text-[var(--hub-text-soft)]">{formatCurrency(quote.totalAmount)}</td>
                <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <div className="ml-auto max-w-xs space-y-3 text-base">
            <div className="flex items-center justify-between">
              <span className="text-[var(--hub-text-soft)]">Subtotal</span>
              <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--hub-border)] pt-3">
              <span className="text-lg font-semibold text-[var(--hub-text-strong)]">Total</span>
              <span className="text-lg font-semibold text-[var(--hub-accent)]">{formatCurrency(quote.totalAmount)}</span>
            </div>
          </div>
        </div>
      </ShellCard>
    </div>
  );
}

export function ClientHubPaymentsView({
  orgSlug = "acme",
  config,
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/payments`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <PageHeader title={hubConfig.payments.pageTitle} subtitle={hubConfig.payments.pageDescription} />

        <div className="grid gap-4 sm:grid-cols-2">
          <ShellCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Total Paid</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{formatCurrency(TOTAL_PAID)}</p>
          </ShellCard>
          <ShellCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Outstanding</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{formatCurrency(OUTSTANDING_BALANCE)}</p>
          </ShellCard>
        </div>

        <ShellCard className="p-6">
          <h2 className="text-lg font-semibold text-[var(--hub-text-strong)]">Payment Methods</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hubConfig.payments.acceptedMethods.map((method) => (
              <div key={method} className="rounded-[18px] border border-[var(--hub-border)] p-5 text-center">
                <p className="text-base font-semibold text-[var(--hub-text-strong)]">{method}</p>
                <p className="mt-1 text-xs text-[var(--hub-text-soft)]">Available</p>
              </div>
            ))}
          </div>
        </ShellCard>

        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] px-6 py-5">
            <h2 className="text-lg font-semibold text-[var(--hub-text-strong)]">Payment History</h2>
          </div>
          <div className="divide-y divide-[var(--hub-border)]">
            {MOCK_PAYMENTS.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Invoice #{payment.invoiceNumber}</p>
                  <p className="text-xs text-[var(--hub-text-soft)]">{payment.paidAt} · {payment.method}</p>
                </div>
                <StatusPill className={getStatusStyles(payment.status)}>{payment.status}</StatusPill>
              </div>
            ))}
          </div>
        </ShellCard>
      </div>

      <WorkspaceSupportRail
        orgSlug={orgSlug}
        config={hubConfig}
        primaryHref={`/portal/${orgSlug}/client-hub/invoices`}
        primaryLabel="Review Open Invoices"
      />
    </div>
  );
}

export function ClientHubAboutView({
  orgSlug = "acme",
  config,
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/about`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <ShellCard className="p-6 sm:p-10">
        <div className="h-48 border border-[var(--hub-border)] bg-cover bg-center sm:h-56" style={{ backgroundImage: "linear-gradient(135deg, rgba(var(--hub-accent-rgb), 0.14), rgba(21, 32, 51, 0.08)), url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80')" }} />
        <div className="mt-8">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-4xl">{hubConfig.about.pageTitle}</h1>
          <p className="mt-3 text-lg text-[var(--hub-text-soft)]">{hubConfig.about.heading}</p>
          <div className="mt-6 rounded-[18px] border border-[var(--hub-border)] p-6 sm:p-8">
            <p className="text-base leading-8 text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
          </div>
        </div>
      </ShellCard>
    </div>
  );
}

export function ClientHubContactView({
  orgSlug = "acme",
  config,
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/contact`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <ShellCard className="p-6 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-4xl">{hubConfig.contact.pageTitle}</h1>
        <p className="mt-3 text-lg text-[var(--hub-text-soft)]">{hubConfig.contact.heading}</p>

        <div className="mt-8 rounded-[18px] border border-[var(--hub-border)] p-6 sm:p-8">
          <h2 className="text-base font-semibold text-[var(--hub-text-strong)]">Contact Information</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Email</p>
              <p className="mt-2 text-base font-medium text-[var(--hub-text-strong)]">{hubConfig.contact.supportEmail}</p>
              <p className="mt-1 text-sm text-[var(--hub-text-soft)]">We&apos;ll respond within 24 hours</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Phone</p>
              <p className="mt-2 text-base font-medium text-[var(--hub-text-strong)]">{hubConfig.contact.supportPhone}</p>
              <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Mon–Fri, 9:00 AM – 6:00 PM GST</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Office</p>
              <p className="mt-2 text-base font-medium text-[var(--hub-text-strong)]">123 Business Street</p>
              <p className="mt-1 text-sm text-[var(--hub-text-soft)]">Dubai, United Arab Emirates</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Business Hours</p>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">Monday – Friday: 9:00 AM – 6:00 PM<br />Saturday: 10:00 AM – 2:00 PM<br />Sunday: Closed</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-rose-100 bg-rose-50/70 px-6 py-5 sm:px-8">
          <p className="text-sm font-semibold text-rose-900">Emergency Support</p>
          <p className="mt-1 text-sm text-rose-800">For urgent matters outside business hours, please call our emergency line: +971 XX XXX XXXX</p>
        </div>
      </ShellCard>
    </div>
  );
}

export function ClientHubProductsView({
  orgSlug = "acme",
  config,
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/products`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <PageHeader title={hubConfig.products.pageTitle} subtitle={hubConfig.products.heading} />
        <div className="grid gap-4">
          {MOCK_PRODUCTS.map((product) => (
            <ShellCard key={product.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[var(--hub-text-strong)] sm:text-xl">{product.name}</h2>
                  <p className="mt-2 text-sm text-[var(--hub-text-soft)]">{product.description}</p>
                </div>
                {hubConfig.products.showPricing && (
                  <div className="shrink-0 rounded-[18px] border border-[var(--hub-border)] px-5 py-4 text-right">
                    <p className="text-xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(product.price)}</p>
                    {hubConfig.products.showUnit && <p className="mt-1 text-xs text-[var(--hub-text-soft)]">/{product.unit}</p>}
                  </div>
                )}
              </div>
            </ShellCard>
          ))}
        </div>
      </div>
    </div>
  );
}
