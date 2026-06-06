import Link from "next/link";
import type { CSSProperties, ReactNode, SVGProps } from "react";
import type { ClientHubConfig } from "./customization-contract";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";
import { PaymentMethodSelector, getActionablePaymentMethods } from "./payment-method-selector";
import { QuoteResponseActions } from "./quote-response-actions";

export const DEFAULT_HUB_ACCENT = "#e8401e";

export interface ClientHubDashboardData {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  outstandingBalance: number;
  totalPaid: number;
  pendingInvoicesCount: number;
  pendingQuotesCount: number;
  pendingInvoices: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string | null;
    remainingAmount: number;
    totalAmount: number;
    status: string;
  }>;
  pendingQuotes: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    validUntil: string;
    totalAmount: number;
    status: string;
  }>;
}

export const fallbackPreviewData: ClientHubDashboardData = {
  customer: { id: "preview", name: "Valued Customer", email: "client@example.com", phone: null },
  outstandingBalance: 3000,
  totalPaid: 5800,
  pendingInvoicesCount: 2,
  pendingQuotesCount: 1,
  pendingInvoices: [
    { id: "inv-001", invoiceNumber: "INV-000131", dueDate: "2025-10-24", remainingAmount: 1200, totalAmount: 1200, status: "UNPAID" },
    { id: "inv-003", invoiceNumber: "INV-000124", dueDate: "2025-10-20", remainingAmount: 1800, totalAmount: 4400, status: "PARTIALLY_PAID" }
  ],
  pendingQuotes: [
    { id: "qt-001", quoteNumber: "QT-000084", title: "Outbound lead generation package", validUntil: "2025-11-12", totalAmount: 2800, status: "SENT" }
  ],
};

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
    return { r: 232, g: 64, b: 30 };
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
    "--hub-accent-soft": `rgba(${r}, ${g}, ${b}, 0.10)`,
    "--hub-accent-faint": `rgba(${r}, ${g}, ${b}, 0.05)`,
    "--hub-accent-wash": `rgba(${r}, ${g}, ${b}, 0.025)`,
    "--hub-text-strong": "#17171c",
    "--hub-text-soft": "#5e5e68",
    "--hub-text-muted": "#9ca3af",
    "--hub-border": "rgba(23, 23, 28, 0.07)",
    "--hub-border-strong": "rgba(23, 23, 28, 0.14)",
    "--hub-surface": "#ffffff",
    "--hub-surface-soft": "#f7f5f2",
    "--hub-card-shadow": "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)",
    "--hub-hero-gradient": "linear-gradient(165deg, rgba(247,245,242,0.8) 0%, rgba(255,255,255,0) 60%), radial-gradient(circle at 90% 10%, rgba(135,121,163,0.06) 0%, transparent 50%), radial-gradient(circle at 10% 90%, rgba(233,175,150,0.08) 0%, transparent 40%)",
  } as CSSProperties;
}

function Glyph({
  name,
  className = "h-4 w-4",
}: {
  name: "home" | "invoice" | "quote" | "payment" | "products" | "download" | "print" | "arrow";
  className?: string;
}) {
  const base = { className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.8 } as SVGProps<SVGSVGElement>;

  switch (name) {
    case "home":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></svg>;
    case "invoice":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
    case "quote":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M7 4h10a2 2 0 0 1 2 2v12l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6M9 12.5h4" /></svg>;
    case "payment":
      return <svg {...base}><rect x="3" y="6" width="18" height="12" rx="2.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M8 15h3" /></svg>;
    case "products":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="m12 3 8 4.5-8 4.5L4 7.5 12 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></svg>;
    case "download":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" /></svg>;
    case "print":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M7 9V4h10v5M7 14H5a2 2 0 0 1-2-2v-1.5A2.5 2.5 0 0 1 5.5 8h13A2.5 2.5 0 0 1 21 10.5V12a2 2 0 0 1-2 2h-2" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 12h10v8H7z" /></svg>;
    case "arrow":
      return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></svg>;
  }
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
      return "bg-emerald-50 text-emerald-700 ring-emerald-100/80";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-700 ring-amber-100/80";
    case "UNPAID":
    case "SENT":
      return "bg-sky-50 text-sky-700 ring-sky-100/80";
    case "DECLINED":
      return "bg-rose-50 text-rose-700 ring-rose-100/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

/* ------------------------------------------------------------------ */
/*  Primitives                                                        */
/* ------------------------------------------------------------------ */

function ShellCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] shadow-[var(--hub-card-shadow)] ${className}`}>
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
    <span className={`inline-flex items-center rounded-full px-3 py-[5px] text-[11px] font-semibold uppercase tracking-[0.08em] ring-1 ${className}`}>
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] leading-7 text-[var(--hub-text-soft)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                        */
/* ------------------------------------------------------------------ */

function TopNav({
  orgName,
  orgSlug,
  logoUrl,
  navItems,
  customerName,
}: {
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  navItems: NavItem[];
  customerName?: string;
}) {
  const initials = customerName
    ? customerName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hub-border)] bg-[var(--hub-surface)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-6 px-6 py-3 lg:px-10">
        <div className="flex items-center gap-3.5">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${orgName} logo`} className="h-9 w-9 rounded-lg object-cover ring-1 ring-[var(--hub-border)]" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] text-sm font-bold text-[var(--hub-accent)]">
              {orgName.charAt(0)}
            </span>
          )}
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">{orgName}</p>
            <p className="text-[11px] font-medium text-[var(--hub-text-muted)]">Client Hub</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Client hub top navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-[var(--hub-text-soft)] transition-colors hover:bg-[var(--hub-surface-soft)] hover:text-[var(--hub-text-strong)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {customerName ? (
            <>
              <div className="hidden items-center gap-2.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-2.5 py-1.5 md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hub-accent-faint)] text-[11px] font-bold text-[var(--hub-accent)]">{initials}</span>
                <span className="text-[13px] font-semibold text-[var(--hub-text-strong)]">{customerName}</span>
              </div>
              <Link
                href={`/portal/${orgSlug}/auth/logout?origin=client-hub`}
                className="rounded-lg bg-[var(--hub-accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 shadow-[var(--hub-card-shadow)]"
              >
                Logout
              </Link>
            </>
          ) : (
            <Link
              href={`/portal/${orgSlug}/client-hub/login`}
              className="rounded-lg bg-[var(--hub-accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 shadow-[var(--hub-card-shadow)]"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function ClientHubHeader({
  orgName,
  orgSlug,
  logoUrl,
  navItems,
  customerName,
}: {
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  navItems: NavItem[];
  customerName?: string;
}) {
  return <TopNav orgName={orgName} orgSlug={orgSlug} logoUrl={logoUrl} navItems={navItems} customerName={customerName} />;
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
  const iconMap: Record<string, "home" | "invoice" | "quote" | "payment" | "products"> = {
    Home: "home",
    Invoices: "invoice",
    Quotes: "quote",
    Payments: "payment",
    "Products & Services": "products",
  };

  return (
    <ShellCard className="sticky top-[72px] h-fit p-4">
      <nav className="space-y-1" aria-label="Client hub sidebar">
        {items.map((item) => {
          const isActive = activePath === item.href || activePath.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-[var(--hub-surface-soft)] text-[var(--hub-text-strong)]"
                  : "text-[var(--hub-text-soft)] hover:bg-[var(--hub-surface-soft)]/60 hover:text-[var(--hub-text-strong)]"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[var(--hub-text-muted)] transition-colors ${isActive ? "border-[var(--hub-accent-soft)] bg-white text-[var(--hub-accent)]" : "border-[var(--hub-border)] bg-[var(--hub-surface-soft)] group-hover:border-[var(--hub-border-strong)] group-hover:text-[var(--hub-text-soft)]"}`}>
                <Glyph name={iconMap[item.label]} className="h-[15px] w-[15px]" />
              </span>
              <span className="truncate">{item.label}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--hub-accent)]" />}
            </Link>
          );
        })}
      </nav>
    </ShellCard>
  );
}

function DashboardHero({
  orgSlug,
  config,
  data,
}: {
  orgSlug: string;
  config: ClientHubConfig;
  data: ClientHubDashboardData;
}) {
  const actions: Array<{ href: string; label: string; glyph: "invoice" | "quote" | "products" | "payment" | "home" | "download" | "print" | "arrow" }> = [];

  if (config.homeDashboard.showQuickActions) {
    if (config.navigation.showInvoices) {
      actions.push({ href: `/portal/${orgSlug}/client-hub/invoices`, label: "View Invoices", glyph: "invoice" });
    }
    if (config.navigation.showQuotes) {
      actions.push({ href: `/portal/${orgSlug}/client-hub/quotes`, label: "Review Quotes", glyph: "quote" });
    }
    if (config.navigation.showPayments && data.outstandingBalance > 0) {
      actions.push({ href: `/portal/${orgSlug}/client-hub/payments`, label: "Make a Payment", glyph: "payment" });
    }
    if (config.navigation.showProducts) {
      actions.push({ href: `/portal/${orgSlug}/client-hub/products`, label: "Browse Services", glyph: "products" });
    }
    const hasSupportContact = !!(config.contact.supportEmail || config.contact.supportPhone);
    if (config.navigation.showContact && hasSupportContact) {
      actions.push({ href: `/portal/${orgSlug}/client-hub/contact`, label: "Contact Support", glyph: "arrow" });
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] px-6 py-10 sm:px-10 sm:py-14 lg:px-12" style={{ background: "var(--hub-hero-gradient)" }}>
      <div className="relative max-w-2xl">
        <StatusPill className="bg-white/80 text-[var(--hub-accent)] ring-[var(--hub-accent-soft)] backdrop-blur-sm">
          {config.homeDashboard.welcomeMessage}
        </StatusPill>
        <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[34px] lg:text-[40px]">
          {config.homeDashboard.heroTitle}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[var(--hub-text-soft)] sm:text-base sm:leading-8">
          {config.homeDashboard.heroSubtitle}
        </p>
        {actions.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {actions.map((action, index) => (
              <Link
                key={action.href}
                href={action.href}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition ${
                  index === 0
                    ? "bg-[var(--hub-accent)] text-white shadow-sm hover:brightness-[0.97]"
                    : "border border-[var(--hub-border-strong)] bg-white text-[var(--hub-text-strong)] hover:bg-[var(--hub-surface-soft)]"
                }`}
              >
                <Glyph name={action.glyph} className="h-4 w-4" />
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DashboardActionBoard({
  orgSlug,
  config,
  data,
}: {
  orgSlug: string;
  config: ClientHubConfig;
  data: ClientHubDashboardData;
}) {
  const showInvs = config.navigation.showInvoices && config.homeDashboard.showPendingInvoices;
  const showQts = config.navigation.showQuotes && config.homeDashboard.showPendingQuotes;

  const pendingInvoice = showInvs ? data.pendingInvoices[0] : undefined;
  const pendingQuote = showQts ? data.pendingQuotes[0] : undefined;
  
  const totalActions = (showInvs ? data.pendingInvoicesCount : 0) + (showQts ? data.pendingQuotesCount : 0);

  return (
    <ShellCard className="p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Take Actions</h2>
        {totalActions > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--hub-accent)] px-1.5 text-[11px] font-bold text-white">
            {totalActions}
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {pendingInvoice && (
          <div className="flex items-center gap-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-4 transition hover:border-[var(--hub-border-strong)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--hub-accent-soft)] bg-[var(--hub-accent-faint)] text-[var(--hub-accent)]">
              <Glyph name="invoice" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Pay {data.pendingInvoicesCount} invoice{data.pendingInvoicesCount !== 1 ? "s" : ""}</p>
              <p className="mt-0.5 text-[13px] text-[var(--hub-text-soft)]">{formatCurrency(data.outstandingBalance)} pending</p>
            </div>
            <Link href={`/portal/${orgSlug}/client-hub/invoices/${pendingInvoice.id}`} className="shrink-0 rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
              View Invoice
            </Link>
          </div>
        )}

        {pendingQuote && (
          <div className="flex items-center gap-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-4 transition hover:border-[var(--hub-border-strong)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--hub-accent-soft)] bg-[var(--hub-accent-faint)] text-[var(--hub-accent)]">
              <Glyph name="quote" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Respond to {data.pendingQuotesCount} quote{data.pendingQuotesCount !== 1 ? "s" : ""}</p>
              <p className="mt-0.5 text-[13px] text-[var(--hub-text-soft)]">Awaiting your response</p>
            </div>
            <Link href={`/portal/${orgSlug}/client-hub/quotes/${pendingQuote.id}`} className="shrink-0 rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
              Review Quote
            </Link>
          </div>
        )}

        {totalActions === 0 && (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--hub-border)] text-sm text-[var(--hub-text-muted)]">
            No actions required right now
          </div>
        )}
      </div>
    </ShellCard>
  );
}

function SupportCard({ orgSlug, config }: { orgSlug: string; config: ClientHubConfig }) {
  return (
    <ShellCard className="overflow-hidden">
      <div className="h-32 border-b border-[var(--hub-border)] bg-[var(--hub-surface-soft)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{ background: `linear-gradient(135deg, var(--hub-accent-soft), transparent 60%), linear-gradient(225deg, rgba(23,23,28,0.04), transparent 50%)` }} />
        <div className="absolute bottom-4 left-6">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-[var(--hub-border)] text-[var(--hub-accent)] text-sm font-bold">
            {orgSlug.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">About Us</h3>
        <p className="mt-2 text-[13px] leading-6 text-[var(--hub-text-soft)]">{config.about.body}</p>
        <Link href={`/portal/${orgSlug}/client-hub/about`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--hub-accent)] transition hover:underline">
          Learn More <Glyph name="arrow" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </ShellCard>
  );
}

function PendingInvoicesCard({ orgSlug, data }: { orgSlug: string; data: ClientHubDashboardData }) {
  const pending = data.pendingInvoices;

  return (
    <ShellCard className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Pending Invoices</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--hub-accent)] px-1.5 text-[11px] font-bold text-white">{data.pendingInvoicesCount}</span>
      </div>
      {pending.length > 0 ? (
        <div className="mt-4 space-y-2">
          {pending.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 px-4 py-3.5 transition hover:border-[var(--hub-border-strong)]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</p>
                <p className="text-[12px] text-[var(--hub-text-muted)]">Due {invoice.dueDate ?? "—"}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--hub-border)] text-sm text-[var(--hub-text-muted)]">
          No pending invoices
        </div>
      )}
      <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
        View All
      </Link>
    </ShellCard>
  );
}

function PendingQuotesCard({ orgSlug, data }: { orgSlug: string; data: ClientHubDashboardData }) {
  const pending = data.pendingQuotes;

  return (
    <ShellCard className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Pending Quotes</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--hub-accent)] px-1.5 text-[11px] font-bold text-white">{data.pendingQuotesCount}</span>
      </div>
      {pending.length > 0 ? (
        <div className="mt-4 space-y-2">
          {pending.map((quote) => (
            <div key={quote.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 px-4 py-3.5 transition hover:border-[var(--hub-border-strong)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--hub-text-strong)]">{quote.title}</p>
                <p className="text-[12px] text-[var(--hub-text-muted)]">Valid until {quote.validUntil}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--hub-border)] text-sm text-[var(--hub-text-muted)]">
          No pending quotes
        </div>
      )}
      <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
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
    <div className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 shadow-[var(--hub-card-shadow)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{value}</p>
      <p className="mt-1 text-[13px] text-[var(--hub-text-soft)]">{hint}</p>
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
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hub-text-muted)]">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
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
      ? "border-l-2 border-[var(--hub-accent)] bg-[var(--hub-accent-faint)]"
      : tone === "warning"
        ? "border-l-2 border-amber-400 bg-amber-50/50"
        : "border-l-2 border-[var(--hub-border-strong)] bg-[var(--hub-surface-soft)]/60";

  return (
    <div className={`rounded-r-lg px-3.5 py-2.5 ${toneClass}`}>
      <p className="text-[13px] font-semibold text-[var(--hub-text-strong)]">{title}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-[var(--hub-text-soft)]">{detail}</p>
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
          className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]"
        >
          {primaryLabel}
        </Link>
        <Link
          href={`/portal/${orgSlug}/client-hub/contact`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]"
        >
          Contact Support
        </Link>
      </WorkspacePanel>

      <WorkspacePanel title="Support Desk">
        <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/60 px-3.5 py-3.5">
          <p className="text-[13px] font-semibold text-[var(--hub-text-strong)]">{config.contact.supportEmail}</p>
          <p className="mt-0.5 text-[12px] text-[var(--hub-text-soft)]">{config.contact.supportPhone}</p>
          <p className="mt-2 text-[12px] text-[var(--hub-text-muted)]">Mon–Fri, 9:00 AM – 6:00 PM GST</p>
        </div>
      </WorkspacePanel>
    </div>
  );
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
    <footer className="border-t border-[var(--hub-border)] bg-[var(--hub-surface)] py-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:text-left lg:px-10">
        <div>
          <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{orgName}</p>
          <p className="mt-0.5 text-[13px] text-[var(--hub-text-soft)]">{footerText}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-[var(--hub-text-muted)]">
          {supportEmail && <span>{supportEmail}</span>}
          {supportEmail && supportPhone && <span className="hidden sm:inline">·</span>}
          {supportPhone && <span>{supportPhone}</span>}
        </div>
      </div>
      {showPoweredBy && (
        <div className="mt-4 text-center">
          <p className="text-[11px] text-[var(--hub-text-muted)]">Powered by <span className="font-semibold text-[var(--hub-accent)]">Slipwise</span></p>
        </div>
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]" style={buildHubThemeStyle(config.branding.accentColor)}>
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] bg-white px-4 py-2 text-[11px] font-medium text-[var(--hub-text-muted)]">
        <span className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-2 py-0.5 text-[var(--hub-text-strong)]">Preview</span>
        <span className="truncate">{activePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--hub-surface-soft)]">
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
  data = fallbackPreviewData,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
  data?: ClientHubDashboardData;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub`;

  const unpaidInvoices = data.pendingInvoices;
  const pendingQuotes = data.pendingQuotes;

  const showOutstanding = hubConfig.homeDashboard.showOutstandingBalance && hubConfig.navigation.showInvoices;
  const showPendingInvs = hubConfig.homeDashboard.showPendingInvoices && hubConfig.navigation.showInvoices;
  const showPendingQts = hubConfig.homeDashboard.showPendingQuotes && hubConfig.navigation.showQuotes;
  const showTotalPaid = hubConfig.navigation.showPayments;

  return (
    <div className="space-y-6">
      <DashboardHero orgSlug={orgSlug} config={hubConfig} data={data} />

      {/* Summary Cards */}
      {(showOutstanding || showPendingInvs || showPendingQts || showTotalPaid) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showOutstanding && (
            <SummaryMetric
              label="Outstanding Balance"
              value={formatCurrency(data.outstandingBalance)}
              hint={data.outstandingBalance > 0 ? "Awaiting your payment" : "No outstanding balance"}
            />
          )}
          {showPendingInvs && (
            <SummaryMetric
              label="Pending Invoices"
              value={`${unpaidInvoices.length}`}
              hint={unpaidInvoices.length > 0 ? "Action required" : "All invoices settled"}
            />
          )}
          {showPendingQts && (
            <SummaryMetric
              label="Pending Quotes"
              value={`${pendingQuotes.length}`}
              hint={pendingQuotes.length > 0 ? "Awaiting response" : "No open quotes"}
            />
          )}
          {showTotalPaid && (
            <SummaryMetric
              label="Total Paid"
              value={formatCurrency(data.totalPaid)}
              hint="Lifetime transaction volume"
            />
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[220px_1fr_280px]">
        <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
        <DashboardActionBoard orgSlug={orgSlug} config={hubConfig} data={data} />
        <SupportCard orgSlug={orgSlug} config={hubConfig} />
      </div>
      <div className="grid gap-5 md:grid-cols-[7fr_5fr]">
        {showPendingInvs && <PendingInvoicesCard orgSlug={orgSlug} data={data} />}
        {showPendingQts && <PendingQuotesCard orgSlug={orgSlug} data={data} />}
      </div>
    </div>
  );
}

export function ClientHubInvoicesView({
  orgSlug,
  config,
  invoices = [],
  outstandingBalance = 0,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
  invoices?: Array<{
    id: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    dueDate: string | null;
    totalAmount: number;
    amountPaid: number;
    remainingAmount: number;
    status: string;
  }>;
  outstandingBalance?: number;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/invoices`;
  const dueSoon = invoices.filter((invoice) => invoice.remainingAmount > 0).length;
  const acceptedMethods = hubConfig.payments.acceptedMethods || [];
  const methodsText = `${acceptedMethods.length} method${acceptedMethods.length !== 1 ? "s" : ""}`;
  const methodsHint = acceptedMethods.join(", ");

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-5">
        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/60 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[32px]">{hubConfig.invoices.pageTitle}</h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[var(--hub-text-soft)]">{hubConfig.invoices.pageDescription}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="inline-flex items-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
                  Review Quotes
                </Link>
                <Link href={`/portal/${orgSlug}/client-hub/contact`} className="inline-flex items-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
                  Need help?
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-3">
            <SummaryMetric label="Outstanding" value={formatCurrency(outstandingBalance)} hint="Across open invoices" />
            <SummaryMetric label="Invoices Open" value={`${dueSoon}`} hint="Ready for review or payment" />
            <SummaryMetric label="Payment Options" value={methodsText} hint={methodsHint} />
          </div>
        </ShellCard>

        <ShellCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hub-border)] px-6 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Invoice List</h2>
              <p className="mt-0.5 text-[13px] text-[var(--hub-text-soft)]">Track payment status, due dates, and what still needs action.</p>
            </div>
            <div className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">
              {invoices.length} records
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hub-border)] text-left">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Invoice #</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Date</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Due</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Amount</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Status</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Remaining</th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--hub-text-soft)]">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-[var(--hub-border)] last:border-b-0 transition hover:bg-[var(--hub-surface-soft)]/40">
                      <td className="px-6 py-4 text-sm font-semibold text-[var(--hub-accent)]">#{invoice.invoiceNumber ?? "—"}</td>
                      <td className="px-6 py-4 text-sm text-[var(--hub-text-soft)]">{invoice.invoiceDate}</td>
                      <td className="px-6 py-4 text-sm text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</td>
                      <td className="px-6 py-4"><StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill></td>
                      <td className="px-6 py-4 text-sm text-[var(--hub-text-strong)]">{invoice.remainingAmount > 0 ? formatCurrency(invoice.remainingAmount) : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="text-[13px] font-semibold text-[var(--hub-accent)] hover:underline">View</Link>
                      </td>
                    </tr>
                  ))
                )}
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
  invoice,
  config,
}: {
  orgSlug: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    totalAmount: number;
    amountPaid: number;
    remainingAmount: number;
    status: string;
    fromName: string;
    clientName: string;
    lineItems: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
      total: number;
    }>;
    payments?: Array<{
      id: string;
      amount: number;
      paidAt: string;
      method: string;
      note: string;
      paymentMethodDisplay: string;
    }>;
  };
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const amountDue = invoice.remainingAmount;
  const isPayable = invoice.status !== "PAID" && invoice.status !== "CANCELLED" && invoice.remainingAmount > 0;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-[13px] font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">Invoices</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</span>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-6 py-10 text-center sm:px-10 sm:py-14" style={{ background: "var(--hub-hero-gradient)" }}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[var(--hub-border)]">
          <span className="text-base font-bold text-[var(--hub-accent)]">{invoice.fromName ? invoice.fromName.charAt(0) : "—"}</span>
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">{invoice.fromName ?? "—"}</p>
        <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[34px]">Hi {invoice.clientName ?? "Guest"},</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-[var(--hub-text-soft)]">
          {invoice.status === "PAID"
            ? "This invoice is fully paid. Thank you!"
            : `Your payment of ${formatCurrency(amountDue)} is due on ${invoice.dueDate ?? "—"}.`}
        </p>
      </section>

      <div className="-mt-12 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[880px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--hub-text-strong)] sm:text-2xl">Invoice #{invoice.invoiceNumber}</h2>
              <StatusPill className={getStatusStyles(invoice.status)}>{invoice.status.replace(/_/g, " ")}</StatusPill>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-5 sm:px-8 sm:py-6 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">From</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{invoice.fromName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">To</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{invoice.clientName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Issue Date</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{invoice.invoiceDate}</p>
            </div>
          </div>

          {isPayable && (
            <div className="px-6 pb-5 sm:px-8 sm:pb-6">
              <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}/payment`} className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--hub-accent)] px-6 py-3.5 text-[13px] font-semibold text-white transition hover:brightness-[0.97]">
                PAY NOW
              </Link>
            </div>
          )}
        </ShellCard>
      </div>

      <ShellCard className="mx-auto max-w-[880px] overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-4 sm:px-8">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--hub-surface-soft)] text-left">
              <tr>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">No</th>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Item</th>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Quantity</th>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Price</th>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, index) => (
                <tr key={item.id} className="border-b border-[var(--hub-border)] last:border-b-0 transition hover:bg-[var(--hub-surface-soft)]/40">
                  <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{index + 1}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-[var(--hub-text-strong)]">{item.name}</td>
                  <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{item.quantity}</td>
                  <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{formatCurrency(item.price)}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-[var(--hub-text-strong)]">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5 sm:px-8">
          <div className="ml-auto max-w-xs space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--hub-text-soft)]">Subtotal</span>
              <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--hub-border)] pt-2.5">
              <span className="text-base font-semibold text-[var(--hub-text-strong)]">Total</span>
              <span className="text-base font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>
      </ShellCard>

      {invoice.payments && invoice.payments.length > 0 && (
        <ShellCard className="mx-auto max-w-[880px] overflow-hidden">
          <div className="border-b border-[var(--hub-border)] px-6 py-4 sm:px-8">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Payment History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--hub-surface-soft)] text-left">
                <tr>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Date</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Method</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Note</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((pmt) => (
                  <tr key={pmt.id} className="border-b border-[var(--hub-border)] last:border-b-0 transition hover:bg-[var(--hub-surface-soft)]/40">
                    <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{pmt.paidAt}</td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-[var(--hub-text-strong)]">{pmt.paymentMethodDisplay || pmt.method || "—"}</td>
                    <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{pmt.note || "—"}</td>
                    <td className="px-6 py-3.5 text-sm text-right font-semibold text-[var(--hub-text-strong)]">{formatCurrency(pmt.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ShellCard>
      )}
    </div>
  );
}

export function ClientHubPaymentSelectionView({
  orgSlug,
  invoice,
  config,
}: {
  orgSlug: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    dueDate: string | null;
    totalAmount: number;
    remainingAmount: number;
    hasValidPaymentLink: boolean;
    organization: {
      name: string;
      defaults: {
        bankName: string | null;
        bankAccount: string | null;
        bankIFSC: string | null;
      } | null;
    } | null;
  };
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);

  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <nav className="flex items-center gap-2 text-[13px] font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="transition hover:text-[var(--hub-text-strong)]">Invoices</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="transition hover:text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">Payment</span>
      </nav>

      <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--hub-text-soft)] transition hover:text-[var(--hub-text-strong)]">
        ← Invoice #{invoice.invoiceNumber}
      </Link>

      <PaymentMethodSelector orgSlug={orgSlug} invoice={invoice} acceptedMethods={hubConfig.payments.acceptedMethods} hasValidPaymentLink={invoice.hasValidPaymentLink} />
    </div>
  );
}

export function ClientHubQuotesView({
  orgSlug,
  config,
  quotes,
  quotesError,
  acceptanceEnabled = true,
}: {
  orgSlug: string;
  config?: ClientHubConfig;
  quotes?: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    issueDate: Date;
    validUntil: Date;
    totalAmount: number;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    canRespond: boolean;
  }>;
  quotesError?: string;
  acceptanceEnabled?: boolean;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/quotes`;
  const now = new Date();
  const quoteList = quotes ?? [];
  const openQuotes = quoteList.filter((q) => q.status === "SENT" && new Date(q.validUntil) >= now).length;
  const acceptedCount = quoteList.filter((q) => q.status === "ACCEPTED").length;
  const avgValue = quoteList.length > 0
    ? formatCurrency(Math.round(quoteList.reduce((sum, q) => sum + q.totalAmount, 0) / quoteList.length))
    : "—";

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-5">
        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/60 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[32px]">{hubConfig.quotes.pageTitle}</h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[var(--hub-text-soft)]">{hubConfig.quotes.pageDescription}</p>
              </div>
              <Link href={`/portal/${orgSlug}/client-hub/invoices`} className="inline-flex items-center rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
                Go to Invoices
              </Link>
            </div>
          </div>
          {!quotesError && quotes !== undefined && (
            <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-3">
              <SummaryMetric label="Awaiting Reply" value={`${openQuotes}`} hint="Quotations still awaiting your decision" />
              <SummaryMetric label="Accepted" value={`${acceptedCount}`} hint="Already confirmed this cycle" />
              <SummaryMetric label="Avg. Quote Value" value={avgValue} hint="Based on your current proposals" />
            </div>
          )}
        </ShellCard>
        <div className="space-y-3">
          {!acceptanceEnabled && (
            <ShellCard className="border-amber-200 bg-amber-50/60 p-5">
              <p className="text-[13px] font-semibold text-amber-800">
                Quote responses are not currently enabled for this portal. You can view quotes but cannot accept or decline them at this time.
              </p>
            </ShellCard>
          )}
          {quotesError ? (
            <ShellCard className="border-rose-200 bg-rose-50/60 p-5">
              <p className="text-[13px] font-semibold text-rose-800">
                Unable to load quotes. Please try again or contact support if this persists.
              </p>
            </ShellCard>
          ) : quoteList.length === 0 ? (
            <ShellCard className="p-8 text-center">
              <p className="text-[13px] text-[var(--hub-text-soft)]">No quotes found.</p>
            </ShellCard>
          ) : (
              quotes.map((quote) => (
                <ShellCard key={quote.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)] sm:text-lg">{quote.title}</h2>
                        <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
                        {quote.canRespond && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
                            Action Needed
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] text-[var(--hub-text-soft)]">Quote #{quote.quoteNumber} · Valid until {new Date(quote.validUntil).toLocaleDateString()}</p>
                    </div>
                  <div className="flex shrink-0 items-center gap-4 sm:text-right">
                    <p className="text-lg font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.totalAmount)}</p>
                    <Link href={`/portal/${orgSlug}/client-hub/quotes/${quote.id}`} className="rounded-lg border border-[var(--hub-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--hub-text-strong)] transition hover:bg-[var(--hub-surface-soft)]">
                      Review
                    </Link>
                  </div>
                </div>
              </ShellCard>
            ))
          )}
        </div>
      </div>

      {!quotesError && quoteList.length > 0 && (
        <WorkspaceSupportRail
          orgSlug={orgSlug}
          config={hubConfig}
          primaryHref={`/portal/${orgSlug}/client-hub/quotes/${quoteList[0]?.id ?? "#"}`}
          primaryLabel="Open Pending Quote"
        />
      )}
    </div>
  );
}

export function ClientHubQuoteDetailView({
  orgSlug,
  quote,
  config,
}: {
  orgSlug: string;
  quote: {
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    issueDate: Date | string;
    validUntil: Date | string;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    notes: string | null;
    termsAndConditions: string | null;
    acceptedAt: Date | string | null;
    declinedAt: Date | string | null;
    declineReason: string | null;
    canRespond: boolean;
    customerName: string;
    orgName: string;
    lineItems: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      amount: number;
    }>;
  };
  config?: ClientHubConfig;
}) {
  const hubConfig = getHubConfig(config);
  const issueDateStr = new Date(quote.issueDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const validUntilStr = new Date(quote.validUntil).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-[13px] font-medium text-[var(--hub-text-soft)]" aria-label="Breadcrumb">
        <Link href={`/portal/${orgSlug}/client-hub/quotes`} className="transition hover:text-[var(--hub-text-strong)]">Quotes</Link>
        <span className="text-[var(--hub-text-muted)]">›</span>
        <span className="text-[var(--hub-text-strong)]">#{quote.quoteNumber}</span>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-6 py-10 text-center sm:px-10 sm:py-14" style={{ background: "var(--hub-hero-gradient)" }}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[var(--hub-border)]">
          <span className="text-base font-bold text-[var(--hub-accent)]">Q</span>
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Quotation</p>
        <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[34px]">Hi {quote.customerName},</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-[var(--hub-text-soft)]">Please review the quotation details below.</p>
        <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-[var(--hub-text-strong)]">{quote.title}</p>
      </section>

      {/* Status notices */}
      {quote.status === "ACCEPTED" && quote.acceptedAt && (
        <div className="mx-auto max-w-[880px] rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-semibold text-emerald-800">
          You accepted this quote on {new Date(quote.acceptedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.
        </div>
      )}
      {quote.status === "DECLINED" && quote.declinedAt && (
        <div className="mx-auto max-w-[880px] rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-semibold text-rose-800">
          You declined this quote on {new Date(quote.declinedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.
          {quote.declineReason && (
            <p className="mt-1 text-[13px] font-normal text-rose-700">Reason: {quote.declineReason}</p>
          )}
        </div>
      )}
      {quote.status === "EXPIRED" && (
        <div className="mx-auto max-w-[880px] rounded-xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-semibold text-slate-600">
          This quote has expired and is no longer available for response.
        </div>
      )}
      {quote.status === "CONVERTED" && (
        <div className="mx-auto max-w-[880px] rounded-xl border border-teal-200 bg-teal-50 px-5 py-3.5 text-sm font-semibold text-teal-800">
          This quote was accepted and converted to an invoice.
        </div>
      )}

      <div className="-mt-12 px-2 sm:px-4">
        <ShellCard className="mx-auto max-w-[880px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hub-border)] px-6 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--hub-text-strong)] sm:text-2xl">Quotation #{quote.quoteNumber}</h2>
              <StatusPill className={getStatusStyles(quote.status)}>{quote.status}</StatusPill>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-5 sm:px-8 sm:py-6 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">From</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{quote.orgName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">To</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{quote.customerName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Issue Date</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{issueDateStr}</p>
            </div>
          </div>

          <div className="grid gap-6 border-t border-[var(--hub-border)] px-6 py-5 sm:px-8 sm:py-6 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Valid Until</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-text-strong)]">{validUntilStr}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Quote Total</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--hub-accent)]">{formatCurrency(quote.totalAmount)}</p>
            </div>
          </div>

          {quote.canRespond && (
            <div className="border-t border-[var(--hub-border)] px-6 py-5 sm:px-8 sm:pb-6">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Your Response</h3>
              <p className="mb-4 text-[13px] text-[var(--hub-text-soft)]">
                Please review the quote and let us know your decision before {validUntilStr}.
              </p>
              <QuoteResponseActions orgSlug={orgSlug} quoteId={quote.id} />
            </div>
          )}
        </ShellCard>
      </div>

      {/* Line Items */}
      <ShellCard className="mx-auto max-w-[880px] overflow-hidden">
        <div className="border-b border-[var(--hub-border)] px-6 py-4 sm:px-8">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--hub-surface-soft)] text-left">
              <tr>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">No</th>
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Description</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Qty</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Unit Price</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Tax</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lineItems.map((item, idx) => (
                <tr key={item.id} className="border-b border-[var(--hub-border)] last:border-b-0 transition hover:bg-[var(--hub-surface-soft)]/40">
                  <td className="px-6 py-3.5 text-sm text-[var(--hub-text-soft)]">{idx + 1}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-[var(--hub-text-strong)]">{item.description}</td>
                  <td className="px-6 py-3.5 text-sm text-right text-[var(--hub-text-soft)]">{item.quantity}</td>
                  <td className="px-6 py-3.5 text-sm text-right text-[var(--hub-text-soft)]">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-6 py-3.5 text-sm text-right text-[var(--hub-text-soft)]">{item.taxRate > 0 ? `${item.taxRate}%` : "—"}</td>
                  <td className="px-6 py-3.5 text-sm text-right font-semibold text-[var(--hub-text-strong)]">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5 sm:px-8">
          <div className="ml-auto max-w-xs space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--hub-text-soft)]">Subtotal</span>
              <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.subtotal)}</span>
            </div>
            {quote.discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--hub-text-soft)]">Discount</span>
                <span className="font-semibold text-emerald-600">− {formatCurrency(quote.discountAmount)}</span>
              </div>
            )}
            {quote.taxAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--hub-text-soft)]">Tax</span>
                <span className="font-semibold text-[var(--hub-text-strong)]">{formatCurrency(quote.taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--hub-border)] pt-2.5">
              <span className="text-base font-semibold text-[var(--hub-text-strong)]">Total</span>
              <span className="text-base font-semibold text-[var(--hub-accent)]">{formatCurrency(quote.totalAmount)}</span>
            </div>
          </div>
        </div>
      </ShellCard>

      {/* Notes / Terms */}
      {(quote.notes || quote.termsAndConditions) && (
        <div className="mx-auto max-w-[880px] grid gap-4 sm:grid-cols-2">
          {quote.notes && (
            <ShellCard className="p-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Notes</h3>
              <p className="text-[13px] leading-6 text-[var(--hub-text-soft)] whitespace-pre-wrap">{quote.notes}</p>
            </ShellCard>
          )}
          {quote.termsAndConditions && (
            <ShellCard className="p-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Terms &amp; Conditions</h3>
              <p className="text-[13px] leading-6 text-[var(--hub-text-soft)] whitespace-pre-wrap">{quote.termsAndConditions}</p>
            </ShellCard>
          )}
        </div>
      )}
    </div>
  );
}

export function ClientHubPaymentsView({
  orgSlug = "acme",
  config,
  outstandingBalance = 0,
  totalPaid = 0,
  orgHasBankDetails = false,
  hasPaymentLink = false,
  payments = [],
  outstandingInvoices = [],
}: {
  orgSlug?: string;
  config?: ClientHubConfig;
  outstandingBalance?: number;
  totalPaid?: number;
  orgHasBankDetails?: boolean;
  hasPaymentLink?: boolean;
  payments?: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    paidAt: string;
    method: string;
    status: string;
  }>;
  outstandingInvoices?: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string | null;
    remainingAmount: number;
  }>;
}) {
  const hubConfig = getHubConfig(config);
  const basePath = `/portal/${orgSlug}/client-hub/payments`;
  const availableMethods = getActionablePaymentMethods(hubConfig.payments.acceptedMethods, orgHasBankDetails, hasPaymentLink);

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-5">
        <PageHeader title={hubConfig.payments.pageTitle} subtitle={hubConfig.payments.pageDescription} />

        <div className="grid gap-4 sm:grid-cols-2">
          <ShellCard className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Total Paid</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{formatCurrency(totalPaid)}</p>
          </ShellCard>
          <ShellCard className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Outstanding</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)]">{formatCurrency(outstandingBalance)}</p>
          </ShellCard>
        </div>

        {hubConfig.payments.showPaymentMethods && (
          <ShellCard className="p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Payment Methods</h2>
            {availableMethods.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-6 text-center">
                <p className="text-[13px] text-[var(--hub-text-soft)]">No payment methods are currently available.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableMethods.map((method) => (
                  <div key={method} className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-4 text-center transition hover:border-[var(--hub-border-strong)]">
                    <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{method}</p>
                    <p className="mt-1 text-[11px] text-[var(--hub-text-muted)]">Available</p>
                  </div>
                ))}
              </div>
            )}
          </ShellCard>
        )}

        {outstandingInvoices.length > 0 && (
          <ShellCard className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hub-border)] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Unpaid Invoices</h2>
                <p className="mt-0.5 text-[13px] text-[var(--hub-text-soft)]">Select an invoice to settle your open balance.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--hub-border)] text-left">
                    <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Invoice #</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Due Date</th>
                    <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Remaining Amount</th>
                    <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hub-text-muted)]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-[var(--hub-border)] last:border-b-0 transition hover:bg-[var(--hub-surface-soft)]/40">
                      <td className="px-6 py-4 text-sm font-semibold text-[var(--hub-text-strong)]">#{invoice.invoiceNumber}</td>
                      <td className="px-6 py-4 text-sm text-[var(--hub-text-soft)]">{invoice.dueDate ?? "—"}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-[var(--hub-text-strong)]">{formatCurrency(invoice.remainingAmount)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/portal/${orgSlug}/client-hub/invoices/${invoice.id}/payment`} className="inline-flex items-center rounded-lg bg-[var(--hub-accent)] px-3 py-1.5 text-[12px] font-bold text-white transition hover:brightness-[0.97]">
                          Pay Now
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ShellCard>
        )}

        <ShellCard className="overflow-hidden">
          <div className="border-b border-[var(--hub-border)] px-6 py-4">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--hub-text-strong)]">Payment History</h2>
          </div>
          <div className="divide-y divide-[var(--hub-border)]">
            {payments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[var(--hub-text-muted)]">
                No payment history available.
              </div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 transition hover:bg-[var(--hub-surface-soft)]/40">
                  <div>
                    <p className="text-sm font-semibold text-[var(--hub-text-strong)]">Invoice #{payment.invoiceNumber}</p>
                    <p className="text-[12px] text-[var(--hub-text-soft)]">{payment.paidAt} · {payment.method}</p>
                  </div>
                  <StatusPill className={getStatusStyles(payment.status)}>{payment.status}</StatusPill>
                </div>
              ))
            )}
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
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <ShellCard className="overflow-hidden">
        <div className="h-40 border-b border-[var(--hub-border)] bg-[var(--hub-surface-soft)] relative overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, var(--hub-accent-soft), transparent 60%), linear-gradient(225deg, rgba(23,23,28,0.06), transparent 50%)` }} />
        </div>
        <div className="p-6 sm:p-10">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[32px]">{hubConfig.about.pageTitle}</h1>
          <p className="mt-2 text-[15px] leading-7 text-[var(--hub-text-soft)]">{hubConfig.about.heading}</p>
          <div className="mt-6 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-6 sm:p-8">
            <p className="text-[15px] leading-8 text-[var(--hub-text-soft)]">{hubConfig.about.body}</p>
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
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <ShellCard className="p-6 sm:p-10">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[32px]">{hubConfig.contact.pageTitle}</h1>
        <p className="mt-2 text-[15px] leading-7 text-[var(--hub-text-soft)]">{hubConfig.contact.heading}</p>

        <div className="mt-6 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-[var(--hub-text-strong)]">Contact Information</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Email</p>
              <p className="mt-1.5 text-sm font-medium text-[var(--hub-text-strong)]">{hubConfig.contact.supportEmail}</p>
              <p className="mt-0.5 text-[12px] text-[var(--hub-text-soft)]">We&apos;ll respond within 24 hours</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Phone</p>
              <p className="mt-1.5 text-sm font-medium text-[var(--hub-text-strong)]">{hubConfig.contact.supportPhone}</p>
              <p className="mt-0.5 text-[12px] text-[var(--hub-text-soft)]">Mon–Fri, 9:00 AM – 6:00 PM GST</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Office</p>
              <p className="mt-1.5 text-sm font-medium text-[var(--hub-text-strong)]">123 Business Street</p>
              <p className="mt-0.5 text-[12px] text-[var(--hub-text-soft)]">Dubai, United Arab Emirates</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hub-text-muted)]">Business Hours</p>
              <p className="mt-1.5 text-[13px] leading-6 text-[var(--hub-text-soft)]">Monday – Friday: 9:00 AM – 6:00 PM<br />Saturday: 10:00 AM – 2:00 PM<br />Sunday: Closed</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 px-6 py-4 sm:px-8">
          <p className="text-sm font-semibold text-rose-900">Emergency Support</p>
          <p className="mt-1 text-[13px] text-rose-800">For urgent matters outside business hours, please call our emergency line: +971 XX XXX XXXX</p>
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
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <Sidebar orgSlug={orgSlug} config={hubConfig} activePath={basePath} />
      <div className="space-y-5">
        <PageHeader title={hubConfig.products.pageTitle} subtitle={hubConfig.products.heading} />
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)] px-6 py-8 text-center">
            <p className="text-[13px] text-[var(--hub-text-soft)]">
              Your service catalogue will appear here once it has been configured.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
