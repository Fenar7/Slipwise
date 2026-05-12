import Link from "next/link";
import { getCrmDashboard } from "./actions";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardSection, ContentPanel } from "@/components/dashboard/dashboard-section";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ActivityList, ActivityItem } from "@/components/dashboard/activity-list";
import {
  Users,
  Building2,
  CalendarDays,
  AlertTriangle,
  Clock,
  Plus,
  Receipt,
  Quote,
  ArrowUpRight,
} from "lucide-react";

export const metadata = {
  title: "CRM | Slipwise",
};

const LIFECYCLE_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

const COMPLIANCE_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  PENDING: "warning",
  VERIFIED: "success",
  SUSPENDED: "danger",
  BLOCKED: "danger",
};

const INVOICE_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  ISSUED: "info",
  VIEWED: "info",
  DUE: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  DISPUTED: "danger",
  CANCELLED: "neutral",
  REISSUED: "info",
};

const QUOTE_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CONVERTED: "success",
};

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function CrmPage() {
  const data = await getCrmDashboard();

  const totalCustomers = data.lifecycleBreakdown.reduce((sum, s) => sum + s._count.id, 0);
  const totalVendors = data.vendorCompliance.reduce((sum, s) => sum + s._count.id, 0);
  const activeCustomers = data.lifecycleBreakdown.find((s) => s.lifecycleStage === "ACTIVE")?._count.id ?? 0;
  const atRiskCount = data.atRiskCustomers.length;
  const overdueCount = data.overdueFollowUps.length;

  // Build combined recent activity
  type Activity = {
    id: string;
    type: "note" | "invoice" | "quote";
    title: string;
    meta?: string;
    href: string;
    badge?: React.ReactNode;
    rightText: string;
    sortTime: number;
  };

  const activities: Activity[] = [
    ...data.recentNotes.map((n) => ({
      id: `note-${n.id}`,
      type: "note" as const,
      title: n.content.slice(0, 80),
      meta: n.entityType === "customer" ? "Customer note" : "Vendor note",
      href: n.entityType === "customer" ? `/app/crm/customers/${n.entityId}` : `/app/crm/vendors/${n.entityId}`,
      rightText: new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      sortTime: new Date(n.createdAt).getTime(),
    })),
    ...data.recentInvoices.map((inv) => ({
      id: `inv-${inv.id}`,
      type: "invoice" as const,
      title: inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : "Invoice",
      meta: inv.customer?.name ?? undefined,
      href: `/app/docs/invoices/${inv.id}`,
      badge: (
        <StatusBadge variant={INVOICE_STATUS_VARIANTS[inv.status] ?? "neutral"}>
          {inv.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
      rightText: formatCurrency(Number(inv.totalAmount)),
      sortTime: new Date(inv.createdAt).getTime(),
    })),
    ...data.recentQuotes.map((q) => ({
      id: `quote-${q.id}`,
      type: "quote" as const,
      title: q.quoteNumber ? `Quote ${q.quoteNumber}` : "Quote",
      meta: q.customer?.name ?? undefined,
      href: `/app/docs/quotes/${q.id}`,
      badge: (
        <StatusBadge variant={QUOTE_STATUS_VARIANTS[q.status] ?? "neutral"}>
          {q.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
      rightText: formatCurrency(Number(q.totalAmount)),
      sortTime: new Date(q.createdAt).getTime(),
    })),
  ];

  activities.sort((a, b) => b.sortTime - a.sortTime);
  const recentActivity = activities.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">CRM</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Customer lifecycle, vendor compliance, and relationship history
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/data/customers/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Customer
          </Link>
          <Link
            href="/app/data/vendors/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Vendor
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Customers" value={totalCustomers} icon={Users} />
        <KpiCard label="Active Customers" value={activeCustomers} icon={Users} />
        <KpiCard label="Total Vendors" value={totalVendors} icon={Building2} />
        <KpiCard label="Follow-ups (7d)" value={data.upcomingFollowUps.length} icon={CalendarDays} />
      </div>

      {/* Needs Attention */}
      {(atRiskCount > 0 || overdueCount > 0) && (
        <DashboardSection title="Needs Attention" subtitle="Customers requiring follow-up">
          <ContentPanel padding="none">
            <div className="divide-y divide-[var(--border-soft)]">
              {data.overdueFollowUps.map((c) => (
                <div
                  key={`overdue-${c.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--state-danger-soft)] text-[var(--state-danger)]">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <Link
                        href={`/app/crm/customers/${c.id}`}
                        className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)]"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)]">
                        Follow-up overdue · {c.nextFollowUpAt ? new Date(c.nextFollowUpAt).toLocaleDateString("en-IN") : "—"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge variant={LIFECYCLE_VARIANTS[c.lifecycleStage ?? "PROSPECT"] ?? "neutral"}>
                    {(c.lifecycleStage ?? "PROSPECT").replace(/_/g, " ")}
                  </StatusBadge>
                </div>
              ))}
              {data.atRiskCustomers.map((c) => (
                <div
                  key={`risk-${c.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--state-warning-soft)] text-[var(--state-warning)]">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <Link
                        href={`/app/crm/customers/${c.id}`}
                        className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)]"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)]">
                        {(c.lifecycleStage ?? "").replace(/_/g, " ")} · {formatCurrency(Number(c.totalInvoiced))} lifetime
                      </p>
                    </div>
                  </div>
                  <StatusBadge variant={LIFECYCLE_VARIANTS[c.lifecycleStage ?? "PROSPECT"] ?? "neutral"}>
                    {(c.lifecycleStage ?? "PROSPECT").replace(/_/g, " ")}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </ContentPanel>
        </DashboardSection>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recent Activity */}
          <DashboardSection
            title="Recent Activity"
            subtitle="Notes, invoices, and quotes across all relationships"
          >
            <ContentPanel padding="none">
              {recentActivity.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  No recent activity.
                </div>
              ) : (
                <ActivityList>
                  {recentActivity.map((a) => (
                    <ActivityItem
                      key={a.id}
                      href={a.href}
                      title={a.title}
                      meta={a.meta}
                      badge={a.badge}
                      rightText={a.rightText}
                    />
                  ))}
                </ActivityList>
              )}
            </ContentPanel>
          </DashboardSection>

          {/* Upcoming Follow-ups */}
          <DashboardSection title="Upcoming Follow-ups (7 days)">
            <ContentPanel padding="none">
              {data.upcomingFollowUps.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  No follow-ups scheduled this week.
                </div>
              ) : (
                <ActivityList>
                  {data.upcomingFollowUps.map((c) => (
                    <ActivityItem
                      key={c.id}
                      href={`/app/crm/customers/${c.id}`}
                      title={c.name}
                      meta={c.email ?? undefined}
                      badge={
                        <StatusBadge variant={LIFECYCLE_VARIANTS[c.lifecycleStage ?? "PROSPECT"] ?? "neutral"}>
                          {(c.lifecycleStage ?? "PROSPECT").replace(/_/g, " ")}
                        </StatusBadge>
                      }
                      rightText={c.nextFollowUpAt ? new Date(c.nextFollowUpAt).toLocaleDateString("en-IN") : "—"}
                    />
                  ))}
                </ActivityList>
              )}
            </ContentPanel>
          </DashboardSection>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Customer Lifecycle */}
          <DashboardSection
            title="Customer Lifecycle"
            action={{ href: "/app/data/customers", label: "View Customers →" }}
          >
            <ContentPanel padding="none">
              {data.lifecycleBreakdown.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  No customer data yet.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-soft)]">
                  {data.lifecycleBreakdown.map((s) => (
                    <li
                      key={s.lifecycleStage}
                      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                    >
                      <StatusBadge variant={LIFECYCLE_VARIANTS[s.lifecycleStage ?? "PROSPECT"] ?? "neutral"}>
                        {(s.lifecycleStage ?? "UNKNOWN").replace(/_/g, " ")}
                      </StatusBadge>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{s._count.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ContentPanel>
          </DashboardSection>

          {/* Vendor Compliance */}
          <DashboardSection
            title="Vendor Compliance"
            action={{ href: "/app/data/vendors", label: "View Vendors →" }}
          >
            <ContentPanel padding="none">
              {data.vendorCompliance.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  No vendor data yet.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-soft)]">
                  {data.vendorCompliance.map((s) => (
                    <li
                      key={s.complianceStatus}
                      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
                    >
                      <StatusBadge variant={COMPLIANCE_VARIANTS[s.complianceStatus ?? "PENDING"] ?? "neutral"}>
                        {(s.complianceStatus ?? "PENDING").replace(/_/g, " ")}
                      </StatusBadge>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{s._count.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ContentPanel>
          </DashboardSection>

          {/* Quick Links */}
          <DashboardSection title="Quick Links">
            <ContentPanel padding="none">
              <ul className="divide-y divide-[var(--border-soft)]">
                <li>
                  <Link
                    href="/app/docs/invoices"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <Receipt className="h-4 w-4 text-[var(--brand-primary)]" />
                    Invoices
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/app/docs/quotes"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <Quote className="h-4 w-4 text-[var(--brand-primary)]" />
                    Quotes
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/app/data/customers"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <Users className="h-4 w-4 text-[var(--brand-primary)]" />
                    Customers
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/app/data/vendors"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <Building2 className="h-4 w-4 text-[var(--brand-primary)]" />
                    Vendors
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </Link>
                </li>
              </ul>
            </ContentPanel>
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}
