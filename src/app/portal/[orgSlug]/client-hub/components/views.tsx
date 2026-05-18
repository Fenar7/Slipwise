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

export const DEFAULT_HUB_ACCENT = "#7bdcb5";

type NavItem = {
  href: string;
  label: string;
};

type SidebarItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
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
    "--hub-accent-wash": `rgba(${r}, ${g}, ${b}, 0.06)`,
    "--hub-text-strong": "#152033",
    "--hub-text-soft": "#667085",
    "--hub-text-muted": "#94a3b8",
    "--hub-border": "rgba(15, 23, 42, 0.08)",
    "--hub-card-shadow": "0 18px 60px rgba(15, 23, 42, 0.08)",
    "--hub-hero-gradient": `radial-gradient(circle at 50% 0%, rgba(${r},${g},${b},0.22) 0%, rgba(250,208,196,0.55) 35%, rgba(255,246,236,0.98) 70%)`,
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
  const items: Array<{ visible: boolean; href: string; label: string; shortLabel: string; icon: ReactNode }> = [
    { visible: hubConfig.navigation.showDashboard, href: base, label: "Home", shortLabel: "H", icon: <HomeIcon /> },
    { visible: hubConfig.navigation.showInvoices, href: `${base}/invoices`, label: "Invoices", shortLabel: "I", icon: <InvoiceIcon /> },
    { visible: hubConfig.navigation.showQuotes, href: `${base}/quotes`, label: "Quotes", shortLabel: "Q", icon: <QuoteIcon /> },
    { visible: hubConfig.navigation.showPayments, href: `${base}/payments`, label: "Payments", shortLabel: "P", icon: <PaymentIcon /> },
    { visible: hubConfig.navigation.showProducts, href: `${base}/products`, label: "Products & Services", shortLabel: "S", icon: <ProductIcon /> },
  ];
  return items.filter((item) => item.visible).map(({ href, label, shortLabel, icon }) => ({ href, label, shortLabel, icon }));
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

/* ------------------------------------------------------------------ */
/*  Shared primitives                                                 */
/* ------------------------------------------------------------------ */

function ShellCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-[var(--hub-border)] bg-white shadow-[var(--hub-card-shadow)] ${className}`}
    >
      {children}
    </section>
  );
}

function StatusPill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${className}`}
    >
      {children}
    </span>
  );
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-lg text-[var(--hub-text-soft)]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                             */
/* ------------------------------------------------------------------ */

function HomeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav / Chrome                                                      */
/* ------------------------------------------------------------------ */

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
    <header className="border-b border-[var(--hub-border)] bg-white/50 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-6 px-6 py-3.5 lg:px-10">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${orgName} logo`} className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[var(--hub-accent)] shadow-sm ring-1 ring-[var(--hub-border)]">
              {orgName.charAt(0)}
            </span>
          )}
          <div>
            <p className="text-base font-semibold tracking-[-0.02em] text-[var(--hub-text-strong)]">{orgName}</p>
            <p className="text-xs font-medium text-[var(--hub-text-muted)]">Client Hub</p>
          </div>
        </div>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Client hub top navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-[var(--hub-text-strong)] transition-colors hover:text-[var(--hub-accent)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-[var(--hub-border)] md:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hub-accent)] text-xs font-bold text-[#152033]">
              HA
            </span>
            <span className="text-sm font-semibold text-[var(--hub-text-strong)]">Hadi Azeez</span>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hub-text-strong)] text-white transition hover:bg-[var(--hub-text-strong)]/90"
          >
            <ChevronDownIcon />
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
      <nav className="space-y-1" aria-label="Client hub sidebar">
        {items.map((item) => {
          const isActive = activePath === item.href || activePath.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--hub-accent-faint)] text-[var(--hub-text-strong)]"
                  : "text-[var(--hub-text-soft)] hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-[var(--hub-accent-soft)] text-[var(--hub-accent)]"
                    : "bg-slate-100 text-[var(--hub-text-muted)]"
                }`}
              >
                {item.shortLabel}
              </span>
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--hub-accent)]" />
              )}
            </Link>
          );
        })}
      </nav>
    </ShellCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard primitives                                              */
/* ------------------------------------------------------------------ */

function DashboardHero({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  const actions = [
    { href: `/portal/${orgSlug}/client-hub/invoices`, label: "View Invoices" },
    { href: `/portal/${orgSlug}/client-hub/quotes`, label: "Review Quotes" },
    { href: `/portal/${orgSlug}/client-hub/products`, label: "Browse Services" },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-[36px] px-6 py-12 text-center sm:px-10 sm:py-16"
      style={{ background: "var(--hub-hero-gradient)" }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <StatusPill className="bg-white/70 text-[var(--hub-text-strong)] ring-white/60 backdrop-blur-sm">
        {config.homeDashboard.welcomeMessage}
      </StatusPill>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl lg:text-6xl">
        {config.homeDashboard.heroTitle}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[var(--hub-text-soft)] sm:text-xl">
        {config.homeDashboard.heroSubtitle}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/80 px-5 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] shadow-sm backdrop-blur-sm transition hover:bg-white"
          >
            {action.label}
            <ArrowRightIcon />
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
        {(PENDING_INVOICES_COUNT > 0 || PENDING_QUOTES_COUNT > 0) && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] px-2 text-xs font-bold text-[var(--hub-accent)]">
            {PENDING_INVOICES_COUNT + PENDING_QUOTES_COUNT}
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {pendingInvoice && (
          <div className="flex items-center gap-4 rounded-3xl border border-[var(--hub-border)] bg-[#fbfcfb] p-4 sm:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <InvoiceIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--hub-text-strong)]">
                Pay {PENDING_INVOICES_COUNT} invoice{PENDING_INVOICES_COUNT !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-[var(--hub-text-soft)]">
                {formatCurrency(pendingInvoice.remainingAmount)} pending · Due {pendingInvoice.dueDate}
              </p>
            </div>
            <Link
              href={`/portal/${orgSlug}/client-hub/invoices/${pendingInvoice.id}`}
              className="shrink-0 rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
            >
              View
            </Link>
          </div>
        )}

        {pendingQuote && (
          <div className="flex items-center gap-4 rounded-3xl border border-[var(--hub-border)] bg-[#fbfcfb] p-4 sm:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <QuoteIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--hub-text-strong)]">
                Respond to {PENDING_QUOTES_COUNT} quote{PENDING_QUOTES_COUNT !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-[var(--hub-text-soft)]">
                {pendingQuote.title} · Valid until {pendingQuote.validUntil}
              </p>
            </div>
            <Link
              href={`/portal/${orgSlug}/client-hub/quotes/${pendingQuote.id}`}
              className="shrink-0 rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
            >
              Review
            </Link>
          </div>
        )}

        {!pendingInvoice && !pendingQuote && (
          <div className="flex min-h-[140px] items-center justify-center rounded-3xl border border-dashed border-[var(--hub-border)] bg-[#fcfcfd] text-sm text-[var(--hub-text-soft)]">
            Everything is up to date.
          </div>
        )}
      </div>
    </ShellCard>
  );
}

function SupportCard({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  return (
    <ShellCard className="overflow-hidden">
      <div
        className="h-40 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(var(--hub-accent-rgb), 0.22), rgba(21, 32, 51, 0.12)), url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80')",
        }}
      />
      <div className="p-6">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">About Us</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--hub-text-soft)] line-clamp-4">{config.about.body}</p>
        <Link
          href={`/portal/${orgSlug}/client-hub/about`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--hub-accent)]"
        >
          Learn More <ArrowRightIcon />
        </Link>
      </div>
    </ShellCard>
  );
}

function PendingInvoicesCard({ orgSlug }: { orgSlug: string }) {
  const pending = MOCK_INVOICES.filter((inv) => inv.remainingAmount > 0);

  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Pending Invoices</h3>
        {pending.length > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] px-2 text-xs font-bold text-[var(--hub-accent)]">
            {pending.length}
          </span>
        )}
      </div>

      {pending.length > 0 ? (
        <div className="mt-4 space-y-3">
          {pending.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--hub-border)] p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</p>
                <p className="text-xs text-[var(--hub-text-soft)]">Due {invoice.dueDate}</p>
              </div>
              <p className="shrink-0 text-base font-semibold text-[var(--hub-text-strong)]">
                {formatCurrency(invoice.remainingAmount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-[var(--hub-border)] bg-[#fcfcfd] text-sm text-[var(--hub-text-soft)]">
          No pending invoices
        </div>
      )}

      <Link
        href={`/portal/${orgSlug}/client-hub/invoices`}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
      >
        View All
      </Link>
    </ShellCard>
  );
}

function PendingQuotesCard({ orgSlug }: { orgSlug: string }) {
  const pending = MOCK_QUOTES.filter((qt) => qt.canRespond);

  return (
    <ShellCard className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Pending Quotes</h3>
        {pending.length > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--hub-accent-soft)] px-2 text-xs font-bold text-[var(--hub-accent)]">
            {pending.length}
          </span>
        )}
      </div>

      {pending.length > 0 ? (
        <div className="mt-4 space-y-3">
          {pending.map((quote) => (
            <div
              key={quote.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--hub-border)] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--hub-text-strong)]">{quote.title}</p>
                <p className="text-xs text-[var(--hub-text-soft)]">Valid until {quote.validUntil}</p>
              </div>
              <p className="shrink-0 text-base font-semibold text-[var(--hub-text-strong)]">
                {formatCurrency(quote.totalAmount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-[var(--hub-border)] bg-[#fcfcfd] text-sm text-[var(--hub-text-soft)]">
          No pending quotes
        </div>
      )}

      <Link
        href={`/portal/${orgSlug}/client-hub/quotes`}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
      >
        View All
      </Link>
    </ShellCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported chrome                                                   */
/* ------------------------------------------------------------------ */

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
    <footer className="border-t border-[var(--hub-border)] bg-white/40 py-10 text-center">
      <p className="text-sm font-medium text-[var(--hub-text-strong)]">{orgName}</p>
      <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{footerText}</p>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-[var(--hub-text-muted)]">
        {supportEmail && <span>{supportEmail}</span>}
        {supportEmail && supportPhone && <span>·</span>}
        {supportPhone && <span>{supportPhone}</span>}
      </div>
      {showPoweredBy && (
        <p className="mt-4 text-xs text-[var(--hub-text-muted)]">
          Powered by <span className="font-semibold text-[var(--hub-accent)]">Slipwise</span>
        </p>
      )}
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
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-[var(--hub-border)] bg-[#fffaf4]"
      style={buildHubThemeStyle(config.branding.accentColor)}
    >
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] bg-white/70 px-4 py-2.5 text-xs font-medium text-[var(--hub-text-soft)]">
        <span className="rounded-full bg-[var(--hub-accent-faint)] px-2.5 py-1 text-[var(--hub-text-strong)]">
          Preview
        </span>
        <span className="truncate">{activePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(var(--hub-accent-rgb),0.18),_transparent_44%),linear-gradient(180deg,#fff7ef_0%,#fbfaf6_44%,#f7f8fb_100%)]">
        <TopNav orgName={orgName} logoUrl={logoUrl} navItems={getHubNavItems(orgSlug, config)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 xl:px-8">{children}</main>
        <ClientHubFooter
          orgName={orgName}
          footerText={config.navigation.footerText}
          showPoweredBy={!config.branding.removePoweredBy}
          supportEmail={config.contact.supportEmail}
          supportPhone={config.contact.supportPhone}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Invoices                                                          */
/* ------------------------------------------------------------------ */

export function ClientHubInvoicesView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/invoices`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <PageHeader
          title={hubConfig.invoices.pageTitle}
          subtitle={hubConfig.invoices.pageDescription}
          action={
            <Link
              href={`/portal/${orgSlug}/client-hub/contact`}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
            >
              Need help?
            </Link>
          }
        />

        <ShellCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hub-border)] text-left">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Invoice #
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Date
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Due
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Remaining
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-soft)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INVOICES.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-[var(--hub-border)] transition-colors last:border-b-0 hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-5 font-semibold text-[var(--hub-accent)]">
                      #{invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                    <td className="px-6 py-5 text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                    <td className="px-6 py-5 font-medium text-[var(--hub-text-strong)]">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-6 py-5">
                      <StatusPill className={getStatusStyles(invoice.status)}>
                        {invoice.status.replace(/_/g, " ")}
                      </StatusPill>
                    </td>
                    <td className="px-6 py-5 text-[var(--hub-text-strong)]">
                      {invoice.remainingAmount > 0 ? formatCurrency(invoice.remainingAmount) : "—"}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`}
                        className="text-sm font-semibold text-[var(--hub-accent)] hover:underline"
                      >
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Invoice detail                                                    */
/* ------------------------------------------------------------------ */

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
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">
          Invoices
        </Link>
        <span className="text-[var(--hub-text-muted)]">/</span>
        <span className="text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</span>
      </nav>

      {/* Hero band */}
      <section
        className="relative overflow-hidden rounded-[36px] px-6 py-12 text-center text-white sm:px-10 sm:py-16"
        style={{
          background: `linear-gradient(135deg, var(--hub-accent), rgba(var(--hub-accent-rgb), 0.85))`,
        }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-white shadow-lg">
          <span className="text-lg font-bold text-[var(--hub-accent)]">{invoice.fromName.charAt(0)}</span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">{invoice.fromName}</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Hi {invoice.clientName},
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/90 sm:text-xl">
          Your payment of <span className="font-semibold">{formatCurrency(amountDue)}</span> is due on{" "}
          {invoice.dueDate}.
        </p>
      </section>

      {/* Floating invoice card */}
      <div className="-mt-20 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[900px] overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-3xl">
                Invoice #{invoice.invoiceNumber}
              </h2>
              <StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill>
            </div>
            <div className="flex items-center gap-2 text-[var(--hub-text-muted)]">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50"
                aria-label="Print invoice"
              >
                <PrintIcon />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hub-border)] bg-white text-[var(--hub-text-soft)] transition hover:bg-slate-50"
                aria-label="Download invoice"
              >
                <DownloadIcon />
              </button>
            </div>
          </div>

          {/* Metadata grid */}
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
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                Issue Date
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--hub-text-strong)]">{invoice.invoiceDate}</p>
            </div>
          </div>

          {/* Pay CTA */}
          {invoice.remainingAmount > 0 && (
            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <Link
                href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}/payment`}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--hub-accent)] px-6 py-4 text-base font-semibold text-[#152033] shadow-[0_12px_32px_rgba(var(--hub-accent-rgb),0.25)] transition hover:-translate-y-0.5"
              >
                Pay {formatCurrency(invoice.remainingAmount)} now
              </Link>
            </div>
          )}
        </ShellCard>
      </div>

      {/* Items & totals */}
      <ShellCard className="mx-auto max-w-[900px] overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
          <h3 className="text-lg font-semibold text-[var(--hub-text-strong)]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                  #
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                  Item
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                  Qty
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                  Price
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, index) => (
                <tr key={item.id} className="border-b border-[var(--hub-border)] last:border-b-0">
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{index + 1}</td>
                  <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">{item.name}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{item.quantity}</td>
                  <td className="px-6 py-4 text-[var(--hub-text-soft)]">{formatCurrency(item.price)}</td>
                  <td className="px-6 py-4 font-semibold text-[var(--hub-text-strong)]">
                    {formatCurrency(item.quantity * item.price)}
                  </td>
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
              <span className="text-lg font-semibold text-[var(--hub-text-strong)]">
                {formatCurrency(invoice.totalAmount)}
              </span>
            </div>
            {invoice.remainingAmount > 0 && invoice.remainingAmount !== invoice.totalAmount && (
              <div className="flex items-center justify-between border-t border-dashed border-[var(--hub-border)] pt-3">
                <span className="text-sm text-[var(--hub-text-soft)]">Remaining</span>
                <span className="text-sm font-semibold text-rose-600">{formatCurrency(invoice.remainingAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </ShellCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payment selection                                                 */
/* ------------------------------------------------------------------ */

import { PaymentMethodSelector } from "./payment-method-selector";

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
    <div className="mx-auto max-w-[720px] space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">
          Invoices
        </Link>
        <span className="text-[var(--hub-text-muted)]">/</span>
        <Link
          href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`}
          className="transition hover:text-[var(--hub-text-strong)]"
        >
          #{invoice.invoiceNumber}
        </Link>
        <span className="text-[var(--hub-text-muted)]">/</span>
        <span className="text-[var(--hub-text-strong)]">Payment</span>
      </nav>

      {/* Back link */}
      <Link
        href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hub-text-soft)] transition hover:text-[var(--hub-text-strong)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to invoice
      </Link>

      <PaymentMethodSelector invoice={invoice} acceptedMethods={hubConfig.payments.acceptedMethods} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quotes                                                            */
/* ------------------------------------------------------------------ */

export function ClientHubQuotesView({
  orgSlug,
  config,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/quotes`;

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <PageHeader title={hubConfig.quotes.pageTitle} subtitle={hubConfig.quotes.pageDescription} />
        <div className="space-y-4">
          {MOCK_QUOTES.map((quote) => (
            <ShellCard key={quote.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-[var(--hub-text-strong)] sm:text-xl">{quote.title}</h2>
                    <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--hub-text-soft)]">
                    Quote #{quote.quoteNumber} · Valid until {quote.validUntil}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 sm:text-right">
                  <p className="text-xl font-semibold text-[var(--hub-text-strong)]">
                    {formatCurrency(quote.totalAmount)}
                  </p>
                  <Link
                    href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`}
                    className="rounded-xl border border-[var(--hub-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hub-text-strong)] transition hover:bg-slate-50"
                  >
                    Review
                  </Link>
                </div>
              </div>
            </ShellCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quote detail                                                      */
/* ------------------------------------------------------------------ */

export function ClientHubQuoteDetailView({
  quoteId,
  orgSlug = "acme",
  config,
}: {
  quoteId: string;
  orgSlug?: string;
  config?: ClientHubConfig;
}) {
  const quote = getMockQuote(quoteId);
  if (!quote) return null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="transition hover:text-[var(--hub-text-strong)]">
          Quotes
        </Link>
        <span className="text-[var(--hub-text-muted)]">/</span>
        <span className="text-[var(--hub-text-strong)]">#{quote.quoteNumber}</span>
      </nav>

      {/* Hero band */}
      <section
        className="relative overflow-hidden rounded-[36px] px-6 py-12 text-center text-white sm:px-10 sm:py-16"
        style={{
          background: `linear-gradient(135deg, var(--hub-accent), rgba(var(--hub-accent-rgb), 0.85))`,
        }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
        <StatusPill className="bg-white/20 text-white ring-white/30">Quote</StatusPill>
        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">
          {quote.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/90">
          Valid until {quote.validUntil} · {formatCurrency(quote.totalAmount)}
        </p>
      </section>

      {/* Floating detail card */}
      <div className="-mt-16 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[900px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">
                #{quote.quoteNumber}
              </h2>
              <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
            </div>
            <p className="text-2xl font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
          </div>

          {quote.canRespond ? (
            <div className="px-6 py-6 sm:px-8">
              <h3 className="text-base font-semibold text-[var(--hub-text-strong)]">Your Response</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--hub-accent)] px-6 py-3 text-sm font-semibold text-[#152033] shadow-[0_12px_32px_rgba(var(--hub-accent-rgb),0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Accept Quote
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Decline
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--hub-text-muted)]">
                Static Phase 1 shell — quote response actions are preview-only.
              </p>
            </div>
          ) : (
            <div className="px-6 py-6 sm:px-8">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-emerald-800">You accepted this quote on {quote.issueDate}.</p>
              </div>
            </div>
          )}
        </ShellCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payments                                                          */
/* ------------------------------------------------------------------ */

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
    <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-6">
        <PageHeader title={hubConfig.payments.pageTitle} subtitle={hubConfig.payments.pageDescription} />

        <div className="grid gap-4 sm:grid-cols-2">
          <ShellCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Total Paid</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">
              {formatCurrency(TOTAL_PAID)}
            </p>
          </ShellCard>
          <ShellCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
              Outstanding
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">
              {formatCurrency(OUTSTANDING_BALANCE)}
            </p>
          </ShellCard>
        </div>

        <ShellCard className="p-6">
          <h2 className="text-lg font-semibold text-[var(--hub-text-strong)]">Payment Methods</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hubConfig.payments.acceptedMethods.map((method) => (
              <div
                key={method}
                className="rounded-2xl border border-[var(--hub-border)] bg-[#fbfcfb] p-5 text-center transition hover:border-[var(--hub-accent-soft)]"
              >
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
                  <p className="text-xs text-[var(--hub-text-soft)]">
                    {payment.paidAt} · {payment.method}
                  </p>
                </div>
                <StatusPill className={getStatusStyles(payment.status)}>{payment.status}</StatusPill>
              </div>
            ))}
          </div>
        </ShellCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                             */
/* ------------------------------------------------------------------ */

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
        <div
          className="h-48 rounded-[24px] bg-cover bg-center sm:h-56"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(var(--hub-accent-rgb), 0.22), rgba(21, 32, 51, 0.12)), url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80')",
          }}
        />
        <div className="mt-8">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-4xl">
            {hubConfig.about.pageTitle}
          </h1>
          <p className="mt-3 text-lg text-[var(--hub-text-soft)]">{hubConfig.about.heading}</p>
          <div className="mt-6 rounded-2xl border border-[var(--hub-border)] bg-[#fbfcfb] p-6 sm:p-8">
            <p className="text-base leading-8 text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
          </div>
          {hubConfig.about.showFoundedYear && hubConfig.about.foundedYear && (
            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hub-accent-faint)] text-sm font-bold text-[var(--hub-accent)]">
                {hubConfig.about.foundedYear.slice(-2)}
              </span>
              <p className="text-sm text-[var(--hub-text-soft)]">Founded in {hubConfig.about.foundedYear}</p>
            </div>
          )}
        </div>
      </ShellCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact                                                           */
/* ------------------------------------------------------------------ */

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
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-4xl">
          {hubConfig.contact.pageTitle}
        </h1>
        <p className="mt-3 text-lg text-[var(--hub-text-soft)]">{hubConfig.contact.heading}</p>

        <div className="mt-8 rounded-[24px] border border-[var(--hub-border)] bg-[#fbfcfb] p-6 sm:p-8">
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
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">
                Business Hours
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--hub-text-soft)]">
                Monday – Friday: 9:00 AM – 6:00 PM
                <br />
                Saturday: 10:00 AM – 2:00 PM
                <br />
                Sunday: Closed
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-rose-100 bg-rose-50/70 px-6 py-5 sm:px-8">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-rose-900">Emergency Support</p>
              <p className="mt-1 text-sm text-rose-800">
                For urgent matters outside business hours, please call our emergency line: +971 XX XXX XXXX
              </p>
            </div>
          </div>
        </div>
      </ShellCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Products                                                          */
/* ------------------------------------------------------------------ */

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
                  <div className="shrink-0 rounded-2xl bg-[var(--hub-accent-faint)] px-5 py-4 text-right">
                    <p className="text-xl font-semibold text-[var(--hub-text-strong)]">
                      {formatCurrency(product.price)}
                    </p>
                    {hubConfig.products.showUnit && (
                      <p className="mt-1 text-xs text-[var(--hub-text-soft)]">/{product.unit}</p>
                    )}
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

