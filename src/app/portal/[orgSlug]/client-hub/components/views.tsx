import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ClientHubConfig } from "./customization-contract";
import { getMockInvoice, getMockQuote, MOCK_INVOICES, MOCK_PAYMENTS, MOCK_PRODUCTS, MOCK_QUOTES, OUTSTANDING_BALANCE, TOTAL_PAID } from "./mock-data";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";

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
    "--hub-accent-soft": `rgba(${r}, ${g}, ${b}, 0.16)`,
    "--hub-accent-faint": `rgba(${r}, ${g}, ${b}, 0.08)`,
    "--hub-text-strong": "#152033",
    "--hub-text-soft": "#667085",
    "--hub-border": "rgba(15, 23, 42, 0.08)",
    "--hub-card-shadow": "0 18px 60px rgba(15, 23, 42, 0.08)",
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
    { visible: hubConfig.navigation.showQuotes, href: `${base}/quotes`, label: "Quotes", shortLabel: "Q" },
    { visible: hubConfig.navigation.showInvoices, href: `${base}/invoices`, label: "Invoices", shortLabel: "I" },
    { visible: hubConfig.navigation.showPayments, href: `${base}/payments`, label: "Payments", shortLabel: "P" },
    { visible: hubConfig.navigation.showProducts, href: `${base}/products`, label: "Products/Services", shortLabel: "S" },
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
      return "bg-blue-50 text-blue-700 ring-blue-100";
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
  return <section className={`rounded-[30px] border border-[var(--hub-border)] bg-white shadow-[var(--hub-card-shadow)] ${className}`}>{children}</section>;
}

function StatusPill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${className}`}>{children}</span>;
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
    <header className="border-b border-[var(--hub-border)] bg-white/40 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-6 px-8 py-4">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${orgName} logo`} className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[var(--hub-accent)] shadow-sm">
              {orgName.charAt(0)}
            </span>
          )}
          <div>
            <p className="text-lg font-semibold text-[var(--hub-text-strong)]">{orgName}</p>
          </div>
        </div>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Client hub top navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-base font-semibold text-[var(--hub-text-strong)] hover:text-[var(--hub-accent)]">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full bg-white/70 px-3 py-2 md:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--hub-accent)] text-sm font-bold text-white">HA</span>
            <span className="text-base font-semibold text-[var(--hub-text-strong)]">Hadi Azeez</span>
          </div>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/55 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
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
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const items = getSidebarItems(orgSlug, config);

  return (
    <ShellCard className="sticky top-8 p-5">
      <div className="space-y-2">
        {items.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-lg font-medium ${index === 0 ? "bg-[var(--hub-accent-faint)] text-[var(--hub-text-strong)]" : "text-[var(--hub-text-soft)] hover:bg-slate-50"}`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] text-xs font-semibold text-[var(--hub-accent)]">
              {item.shortLabel}
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    </ShellCard>
  );
}

function DashboardHeroActions({ orgSlug }: { orgSlug: string }) {
  const actions = [
    { href: `/portal/${orgSlug}/client-hub/invoices`, label: "View Invoices" },
    { href: `/portal/${orgSlug}/client-hub/quotes`, label: "Review Quotes" },
    { href: `/portal/${orgSlug}/client-hub/products`, label: "View Products/Services" },
  ];

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center rounded-2xl border border-white/70 bg-white/88 px-6 py-3 text-lg font-semibold text-[var(--hub-text-strong)] shadow-sm"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function DashboardActionBoard({ orgSlug }: { orgSlug: string }) {
  return (
    <ShellCard className="p-6">
      <h2 className="text-2xl font-semibold text-[var(--hub-text-strong)]">Take Actions</h2>
      <div className="mt-6 flex items-center justify-between gap-4 rounded-3xl border border-[var(--hub-border)] bg-[#fbfcfb] p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-xl font-semibold text-emerald-600">I</span>
          <div>
            <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Pay 1 invoice</p>
            <p className="mt-1 text-lg text-[var(--hub-text-soft)]">AED 1,200.00 pending</p>
          </div>
        </div>
        <Link href={`/portal/${orgSlug}/client-hub/invoices/inv-001`} className="rounded-2xl border border-[var(--hub-border)] bg-white px-5 py-3 text-lg font-semibold text-[var(--hub-text-strong)]">
          View Invoice
        </Link>
      </div>
    </ShellCard>
  );
}

function AboutFeatureCard({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  return (
    <ShellCard className="overflow-hidden">
      <div className="h-52 bg-[linear-gradient(135deg,rgba(var(--hub-accent-rgb),0.18),rgba(15,23,42,0.08)),url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center" />
      <div className="p-6">
        <h3 className="text-2xl font-semibold text-[var(--hub-text-strong)]">About Us</h3>
        <p className="mt-4 text-lg leading-8 text-[var(--hub-text-soft)]">
          {config.about.body}
        </p>
        <Link href={`/portal/${orgSlug}/client-hub/about`} className="mt-5 inline-flex text-lg font-semibold text-[var(--hub-accent)]">
          Learn More →
        </Link>
      </div>
    </ShellCard>
  );
}

function PendingInvoicesCard({ orgSlug }: { orgSlug: string }) {
  const invoice = MOCK_INVOICES[0];
  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-[var(--hub-text-strong)]">Pending Invoices</h3>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] px-2 text-sm font-semibold text-[var(--hub-accent)]">1</span>
      </div>
      <div className="mt-5 rounded-3xl border border-[var(--hub-border)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</p>
            <p className="mt-2 text-lg text-[var(--hub-text-soft)]">Due {invoice.dueDate}</p>
          </div>
          <p className="text-3xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount)}</p>
        </div>
      </div>
      <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-[var(--hub-border)] bg-white px-5 py-3 text-lg font-semibold text-[var(--hub-text-strong)]">
        View All
      </Link>
    </ShellCard>
  );
}

function PendingQuotesCard() {
  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-[var(--hub-text-strong)]">Pending Quotes</h3>
        <span className="text-lg text-[var(--hub-text-soft)]">No pending quotes</span>
      </div>
      <div className="mt-10 flex min-h-[170px] items-center justify-center rounded-3xl border border-dashed border-[var(--hub-border)] bg-[#fcfcfd] text-center text-lg text-[var(--hub-text-soft)]">
        Everything is up to date.
      </div>
    </ShellCard>
  );
}

function ViewAllLink({ href = "#", label = "View All" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center rounded-2xl border border-[var(--hub-border)] bg-white px-5 py-3 text-lg font-semibold text-[var(--hub-text-strong)]">
      {label}
    </Link>
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
}: {
  orgName: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerText: string;
  showPoweredBy: boolean;
}) {
  if (!showPoweredBy) return null;

  return (
    <footer className="space-y-2 py-8 text-center text-base text-[var(--hub-text-soft)]">
      <p>{footerText}</p>
      <p>
        Powered by <span className="font-semibold text-[var(--hub-accent)]">Slipwise</span>
      </p>
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-[var(--hub-border)] bg-[#fffaf4]">
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] bg-white/70 px-4 py-3 text-xs font-medium text-[var(--hub-text-soft)]">
        <span className="rounded-full bg-[var(--hub-accent-faint)] px-2.5 py-1 text-[var(--hub-text-strong)]">Preview</span>
        <span>{activePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.24),_transparent_44%),linear-gradient(180deg,#ffe7d5_0%,#fff8f2_42%,#ffffff_100%)]">
        <TopNav orgName={orgName} logoUrl={logoUrl} navItems={getHubNavItems(orgSlug, config)} />
        <main className="mx-auto w-full max-w-[1480px] px-8 py-8">{children}</main>
        <ClientHubFooter orgName="" footerText={config.navigation.footerText} showPoweredBy={!config.branding.removePoweredBy} />
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

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.25),_rgba(250,208,196,0.68)_38%,_rgba(255,246,236,0.98)_100%)] px-8 py-10 text-center">
        <StatusPill className="bg-white/75 text-[var(--hub-text-strong)] ring-white/70">{hubConfig.homeDashboard.welcomeMessage}</StatusPill>
        <h1 className="mx-auto mt-6 max-w-4xl text-6xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">
          {hubConfig.homeDashboard.heroTitle}
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-2xl leading-10 text-[var(--hub-text-soft)]">
          {hubConfig.homeDashboard.heroSubtitle}
        </p>
        <DashboardHeroActions orgSlug={orgSlug} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr_430px]">
        <Sidebar orgSlug={orgSlug} config={hubConfig} />
        <DashboardActionBoard orgSlug={orgSlug} />
        <AboutFeatureCard orgSlug={orgSlug} config={hubConfig} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <PendingInvoicesCard orgSlug={orgSlug} />
        <PendingQuotesCard />
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
    <div className="mx-auto max-w-[1040px] space-y-8 pt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">{hubConfig.invoices.pageTitle}</h1>
          <p className="mt-3 text-2xl text-[var(--hub-text-soft)]">{hubConfig.invoices.pageDescription}</p>
        </div>
        <ViewAllLink href={`/portal/${orgSlug}/client-hub/contact`} label="Need help?" />
      </div>

      <ShellCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-lg">
            <thead>
              <tr className="border-b border-[var(--hub-border)] text-left">
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Invoice #</th>
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Date</th>
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Due Date</th>
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Amount</th>
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Status</th>
                <th className="px-7 py-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Remaining</th>
                <th className="px-7 py-5 text-right text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((invoice) => (
                <tr key={invoice.id} className="border-b border-[var(--hub-border)] last:border-b-0">
                  <td className="px-7 py-6 font-semibold text-[var(--hub-accent)]">#{invoice.invoiceNumber}</td>
                  <td className="px-7 py-6 text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                  <td className="px-7 py-6 text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                  <td className="px-7 py-6 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</td>
                  <td className="px-7 py-6">
                    <StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill>
                  </td>
                  <td className="px-7 py-6 text-[var(--hub-text-strong)]">{invoice.remainingAmount > 0 ? formatCurrency(invoice.remainingAmount) : "—"}</td>
                  <td className="px-7 py-6 text-right">
                    <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="font-semibold text-[var(--hub-accent)]">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ShellCard>
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

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-3 text-lg font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`}>Invoices</Link>
        <span>›</span>
        <span className="text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</span>
      </nav>

      <section className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,var(--hub-accent),rgba(var(--hub-accent-rgb),0.86))] px-8 pb-16 pt-12 text-center text-white">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] bg-white shadow-lg">
          <span className="text-xl font-bold text-[var(--hub-accent)]">H</span>
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-white/80">{invoice.fromName}</p>
        <h1 className="mt-8 text-6xl font-semibold tracking-[-0.05em]">Hi {invoice.clientName},</h1>
        <p className="mx-auto mt-5 max-w-3xl text-3xl leading-[3rem] text-white/88">
          Your payment of {formatCurrency(invoice.remainingAmount || invoice.totalAmount)} is due on {invoice.dueDate}.
        </p>
      </section>

      <div className="-mt-32 px-4">
        <ShellCard className="mx-auto max-w-[980px] overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--hub-border)] px-8 py-6">
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">Invoice #{invoice.invoiceNumber}</h2>
              <StatusPill className={getStatusStyles(invoice.status)}>{invoice.status}</StatusPill>
            </div>
            <div className="flex items-center gap-4 text-[var(--hub-text-soft)]">
              <span>🖨️</span>
              <span>⬇️</span>
            </div>
          </div>

          <div className="grid gap-6 px-8 py-8 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">From</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--hub-text-strong)]">{invoice.fromName}</p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">To</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--hub-text-strong)]">{invoice.clientName}</p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Issue Date</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--hub-text-strong)]">{invoice.invoiceDate}</p>
            </div>
          </div>

          {invoice.remainingAmount > 0 && (
            <div className="px-8 pb-8">
              <Link
                href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}/payment`}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--hub-accent)] px-6 py-4 text-2xl font-semibold text-white shadow-[0_16px_40px_rgba(var(--hub-accent-rgb),0.25)]"
              >
                PAY NOW
              </Link>
            </div>
          )}
        </ShellCard>

        <ShellCard className="mx-auto mt-8 max-w-[980px] overflow-hidden">
          <div className="px-8 py-6">
            <h3 className="text-3xl font-semibold text-[var(--hub-text-strong)]">Items</h3>
          </div>
          <div className="overflow-x-auto border-t border-[var(--hub-border)]">
            <table className="w-full text-lg">
              <thead className="bg-[var(--hub-accent)] text-white">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em]">No</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em]">Item</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em]">Quantity</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em]">Price</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-[0.18em]">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-[var(--hub-border)] last:border-b-0">
                    <td className="px-6 py-5 text-[var(--hub-text-strong)]">{index + 1}</td>
                    <td className="px-6 py-5 font-semibold text-[var(--hub-text-strong)]">{item.name}</td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{item.quantity}</td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{formatCurrency(item.price)}</td>
                    <td className="px-6 py-5 font-semibold text-[var(--hub-text-strong)]">{formatCurrency(item.quantity * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-8 py-6">
            <div className="ml-auto max-w-xs space-y-4 text-xl">
              <div className="flex items-center justify-between">
                <span className="text-[var(--hub-text-soft)]">Subtotal</span>
                <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--hub-border)] pt-4">
                <span className="text-2xl font-semibold text-[var(--hub-text-strong)]">Total</span>
                <span className="text-2xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>
        </ShellCard>
      </div>
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
    <div className="space-y-12">
      <nav className="flex items-center gap-3 text-lg font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`}>Invoices</Link>
        <span>›</span>
        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`}>#{invoice.invoiceNumber}</Link>
        <span>›</span>
        <span className="text-[var(--hub-text-strong)]">Payment</span>
      </nav>

      <div className="text-center">
        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--hub-text-soft)]">
          ← Invoice #{invoice.invoiceNumber}
        </Link>
        <p className="mt-10 text-2xl text-[var(--hub-text-soft)]">Amount Due</p>
        <h1 className="mt-4 text-7xl font-semibold tracking-[-0.06em] text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount || invoice.totalAmount)}</h1>
      </div>

      <section className="mx-auto max-w-[980px]">
        <h2 className="text-center text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)]">How would you like to pay?</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {hubConfig.payments.acceptedMethods.slice(0, 2).map((method) => (
            <button
              key={method}
              type="button"
              disabled
              className="flex items-start justify-between rounded-[28px] border border-[var(--hub-border)] bg-white px-8 py-7 text-left shadow-[var(--hub-card-shadow)]"
            >
              <div>
                <p className="text-3xl font-semibold text-[var(--hub-text-strong)]">{method}</p>
                <p className="mt-3 text-lg text-[var(--hub-text-soft)]">
                  {method === "Payment Link" ? "Secure online payment via Stripe or Telr" : "Transfer directly to our bank account"}
                </p>
              </div>
              <span className="mt-1 h-6 w-6 rounded-full border border-[var(--hub-border)] bg-white" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ClientHubQuotesView({
  orgSlug,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Sidebar orgSlug={orgSlug} />
      <div className="space-y-5">
        {MOCK_QUOTES.map((quote) => (
          <ShellCard key={quote.id} className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">{quote.title}</h2>
                  <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
                </div>
                <p className="mt-3 text-lg text-[var(--hub-text-soft)]">Valid until {quote.validUntil}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
                <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="mt-2 inline-flex text-lg font-semibold text-[var(--hub-accent)]">
                  Review
                </Link>
              </div>
            </div>
          </ShellCard>
        ))}
      </div>
    </div>
  );
}

export function ClientHubQuoteDetailView({
  quoteId,
}: {
  quoteId: string;
  config?: ClientHubConfig;
}) {
  const quote = getMockQuote(quoteId);
  if (!quote) return null;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-3 text-lg font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <span>Quotes</span>
        <span>›</span>
        <span className="text-[var(--hub-text-strong)]">#{quote.quoteNumber}</span>
      </nav>

      <ShellCard className="p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-5xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">{quote.title}</h1>
              <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
            </div>
            <p className="mt-4 text-xl text-[var(--hub-text-soft)]">Quote #{quote.quoteNumber} · Valid until {quote.validUntil}</p>
          </div>
          <p className="text-4xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
        </div>
      </ShellCard>

      {quote.canRespond ? (
        <ShellCard className="p-8">
          <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">Your Response</h2>
          <div className="mt-6 flex gap-4">
            <button type="button" disabled className="rounded-2xl bg-[var(--hub-accent)] px-6 py-4 text-xl font-semibold text-white opacity-80">Accept Quote</button>
            <button type="button" disabled className="rounded-2xl border border-[var(--hub-border)] bg-white px-6 py-4 text-xl font-semibold text-[var(--hub-text-strong)] opacity-80">Decline</button>
          </div>
        </ShellCard>
      ) : (
        <ShellCard className="border-emerald-100 bg-emerald-50/80 p-6">
          <p className="text-2xl font-semibold text-emerald-900">You accepted this quote.</p>
        </ShellCard>
      )}
    </div>
  );
}

export function ClientHubPaymentsView({
  config,
}: {
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        <ShellCard className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Total Paid</p>
          <p className="mt-4 text-5xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(TOTAL_PAID)}</p>
        </ShellCard>
        <ShellCard className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--hub-text-soft)]">Outstanding</p>
          <p className="mt-4 text-5xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(OUTSTANDING_BALANCE)}</p>
        </ShellCard>
      </div>

      <ShellCard className="p-6">
        <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">How would you like to pay?</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {hubConfig.payments.acceptedMethods.slice(0, 2).map((method) => (
            <div key={method} className="rounded-3xl border border-[var(--hub-border)] p-5">
              <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">{method}</p>
              <p className="mt-2 text-lg text-[var(--hub-text-soft)]">Preview-only payment option for the client portal shell.</p>
            </div>
          ))}
        </div>
      </ShellCard>

      <ShellCard className="overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-5">
          <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">Payment History</h2>
        </div>
        <div className="divide-y divide-[var(--hub-border)]">
          {MOCK_PAYMENTS.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-4 px-6 py-5">
              <div>
                <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Invoice #{payment.invoiceNumber}</p>
                <p className="mt-2 text-lg text-[var(--hub-text-soft)]">{payment.paidAt} · {payment.method}</p>
              </div>
              <StatusPill className={getStatusStyles(payment.status)}>{payment.status}</StatusPill>
            </div>
          ))}
        </div>
      </ShellCard>
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
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Sidebar orgSlug="acme" config={hubConfig} />
      <ShellCard className="p-8">
        <h1 className="text-5xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">About Us</h1>
        <p className="mt-4 text-2xl text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
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

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} />
      <ShellCard className="p-8">
        <h1 className="text-5xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)]">{hubConfig.contact.pageTitle}</h1>
        <p className="mt-4 text-2xl text-[var(--hub-text-soft)]">{hubConfig.contact.heading}</p>

        <div className="mt-8 rounded-[26px] border border-[var(--hub-border)] p-8">
          <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">Contact Information</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Email</p>
              <p className="mt-3 text-xl text-[var(--hub-text-soft)]">{hubConfig.contact.supportEmail}</p>
              <p className="mt-2 text-lg text-[var(--hub-text-soft)]">We&apos;ll respond within 24 hours</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Phone</p>
              <p className="mt-3 text-xl text-[var(--hub-text-soft)]">{hubConfig.contact.supportPhone}</p>
              <p className="mt-2 text-lg text-[var(--hub-text-soft)]">Mon-Fri, 9:00 AM - 6:00 PM GST</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Office</p>
              <p className="mt-3 text-xl text-[var(--hub-text-soft)]">123 Business Street</p>
              <p className="mt-2 text-lg text-[var(--hub-text-soft)]">Dubai, United Arab Emirates</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">Business Hours</p>
              <p className="mt-3 text-xl leading-9 text-[var(--hub-text-soft)]">Monday - Friday: 9:00 AM - 6:00 PM</p>
              <p className="text-xl leading-9 text-[var(--hub-text-soft)]">Saturday: 10:00 AM - 2:00 PM</p>
              <p className="text-xl leading-9 text-[var(--hub-text-soft)]">Sunday: Closed</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-rose-100 bg-rose-50/70 px-8 py-6">
          <p className="text-2xl font-semibold text-rose-900">Emergency Support</p>
          <p className="mt-2 text-lg text-rose-800">For urgent matters outside business hours, please call our emergency line: +971 XX XXX XXXX</p>
        </div>
      </ShellCard>
    </div>
  );
}

export function ClientHubProductsView({
  orgSlug,
  config,
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Sidebar orgSlug={orgSlug ?? "acme"} config={hubConfig} />
      <div className="grid gap-5">
        {MOCK_PRODUCTS.map((product) => (
          <ShellCard key={product.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold text-[var(--hub-text-strong)]">{product.name}</h2>
                <p className="mt-3 text-xl text-[var(--hub-text-soft)]">{product.description}</p>
              </div>
              {hubConfig.products.showPricing && (
                <div className="rounded-2xl bg-[var(--hub-accent-faint)] px-5 py-4 text-right">
                  <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(product.price)}</p>
                  {hubConfig.products.showUnit && <p className="mt-1 text-lg text-[var(--hub-text-soft)]">/{product.unit}</p>}
                </div>
              )}
            </div>
          </ShellCard>
        ))}
      </div>
    </div>
  );
}
