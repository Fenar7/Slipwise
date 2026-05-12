import { Suspense } from "react";
import Link from "next/link";
import { getDocsSummary } from "@/lib/docs-vault";
import type { DocsSummary, VaultRow } from "@/lib/docs-vault";
import { ActivityItem, ActivityList, StatusBadge } from "@/components/dashboard";
import {
  FileText,
  Receipt,
  Banknote,
  FileCheck,
  LayoutGrid,
  Layers,
  FileImage,
  Plus,
  ArrowRight,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export const metadata = {
  title: "Docs | Slipwise",
  description: "Document operations hub. Manage invoices, vouchers, salary slips, and quotes.",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDetailHref(row: VaultRow): string {
  switch (row.docType) {
    case "invoice":     return `/app/docs/invoices/${row.documentId}`;
    case "voucher":     return `/app/docs/vouchers/${row.documentId}`;
    case "salary_slip": return `/app/docs/salary-slips/${row.documentId}`;
    case "quote":       return `/app/docs/quotes/${row.documentId}`;
    default:            return "#";
  }
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  voucher: "Voucher",
  salary_slip: "Salary Slip",
  quote: "Quote",
};

const DOC_TYPE_VARIANTS: Record<string, "default" | "success" | "warning" | "info" | "neutral"> = {
  invoice: "info",
  voucher: "default",
  salary_slip: "warning",
  quote: "success",
};

const SUITE_CARDS = [
  {
    type: "invoice" as const,
    label: "Invoices",
    icon: FileText,
    href: "/app/docs/invoices",
    newHref: "/app/docs/invoices/new",
    description: "Create and manage customer invoices",
    iconBg: "#EFF6FF",
    iconColor: "#2563EB",
  },
  {
    type: "voucher" as const,
    label: "Vouchers",
    icon: Receipt,
    href: "/app/docs/vouchers",
    newHref: "/app/docs/vouchers/new",
    description: "Payment and receipt vouchers",
    iconBg: "#F5F5F5",
    iconColor: "#49454F",
  },
  {
    type: "salary_slip" as const,
    label: "Salary Slips",
    icon: Banknote,
    href: "/app/docs/salary-slips",
    newHref: "/app/docs/salary-slips/new",
    description: "Generate employee payslips",
    iconBg: "#FFFBEB",
    iconColor: "#D97706",
  },
  {
    type: "quote" as const,
    label: "Quotes",
    icon: FileCheck,
    href: "/app/docs/quotes",
    newHref: "/app/docs/quotes/new",
    description: "Send estimates and proposals",
    iconBg: "#ECFDF5",
    iconColor: "#16A34A",
  },
];

// ─── Server-rendered body ─────────────────────────────────────────────────────

async function DocsHomeBody() {
  const summary: DocsSummary = await getDocsSummary();

  const totalDocs = Object.values(summary.counts).reduce((a, b) => a + b, 0);
  const recentCount = summary.recentDocuments.length;

  return (
    <>
      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SUITE_CARDS.map((card) => (
          <Link
            key={card.type}
            href={card.href}
            className="flex items-center gap-3 rounded-2xl border bg-white p-4 transition-colors hover:border-[#DC2626]"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: card.iconBg, color: card.iconColor }}
            >
              <card.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>{card.label}</p>
              <p className="text-lg font-bold tracking-tight" style={{ color: "#1C1B1F" }}>
                {summary.counts[card.type]}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Left 2/3: Recent docs + Create New */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          {/* Recently Updated */}
          <div
            className="rounded-2xl border bg-white"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E0E0E0" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: "#79747E" }} />
                <h2 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>Recently Updated</h2>
                {recentCount > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
                    style={{ background: "#F5F5F5", color: "#79747E" }}
                  >
                    {recentCount}
                  </span>
                )}
              </div>
              <Link
                href="/app/docs/vault"
                className="inline-flex items-center text-xs font-medium hover:underline"
                style={{ color: "#DC2626" }}
              >
                Open Vault <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
            <ActivityList
              emptyMessage="No documents yet"
              emptyDescription="Create your first invoice, voucher, quote, or salary slip to get started."
              className="px-2 py-1"
            >
              {summary.recentDocuments.map((row) => (
                <ActivityItem
                  key={`${row.docType}-${row.documentId}`}
                  href={getDetailHref(row)}
                  title={row.documentNumber}
                  detail={row.titleOrSummary}
                  badge={
                    <StatusBadge variant={DOC_TYPE_VARIANTS[row.docType] ?? "neutral"}>
                      {DOC_TYPE_LABELS[row.docType] ?? row.docType}
                    </StatusBadge>
                  }
                  rightText={row.amount > 0 ? formatCurrency(row.amount, row.currency) : undefined}
                  rightSubtext={formatDate(row.updatedAt)}
                />
              ))}
            </ActivityList>
          </div>

          {/* Create New */}
          <div
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: "#E0E0E0" }}
          >
            <h2 className="mb-3 text-sm font-semibold" style={{ color: "#1C1B1F" }}>Create New</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUITE_CARDS.map((card) => (
                <Link
                  key={card.type}
                  href={card.newHref}
                  className="group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:-translate-y-0.5 hover:border-[#DC2626] hover:shadow-sm"
                  style={{ borderColor: "#E0E0E0" }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-[#DC2626] group-hover:text-white"
                    style={{ background: card.iconBg, color: card.iconColor }}
                  >
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{card.label}</p>
                    <p className="mt-0.5 text-[0.7rem]" style={{ color: "#79747E" }}>{card.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1/3: Quick Actions */}
        <div className="flex flex-col gap-3">
          <div
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>Quick Actions</h2>
            </div>
            <div className="space-y-2">
              {[
                { href: "/app/docs/vault", label: "Document Vault", description: `Browse all ${totalDocs} documents`, icon: LayoutGrid, iconBg: "#EFF6FF", iconColor: "#2563EB" },
                { href: "/app/docs/templates", label: "Templates", description: "Browse and manage document templates", icon: Layers, iconBg: "#F5F5F5", iconColor: "#49454F" },
                { href: "/app/docs/pdf-studio", label: "PDF Studio", description: "Preview, export, and print documents", icon: FileImage, iconBg: "#F5F5F5", iconColor: "#49454F" },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors hover:border-[#DC2626]"
                  style={{ borderColor: "#F0F0F0" }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: action.iconBg, color: action.iconColor }}
                  >
                    <action.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#1C1B1F" }}>{action.label}</p>
                    <p className="text-[11px]" style={{ color: "#79747E" }}>{action.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Templates promo */}
          <div
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "#D97706" }} />
              <h2 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>Templates</h2>
            </div>
            <p className="mb-3 text-xs" style={{ color: "#79747E" }}>
              Start faster with pre-built templates for your organisation.
            </p>
            <Link
              href="/app/docs/templates"
              className="inline-flex items-center text-xs font-medium hover:underline"
              style={{ color: "#DC2626" }}
            >
              Browse templates <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  return (
    <div className="min-h-screen px-3 py-4 sm:px-4 lg:px-5" style={{ background: "#f8f9fc" }}>
      <div className="mx-auto max-w-[1440px]">
        {/* Header */}
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#1C1B1F" }}>Docs</h1>
            <p className="text-xs" style={{ color: "#79747E" }}>
              Document operations hub — invoices, vouchers, salary slips, and quotes
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24" style={{ color: "#79747E" }}>
              <div
                className="mr-2 h-5 w-5 animate-spin rounded-full border-2"
                style={{ borderColor: "#E0E0E0", borderTopColor: "#DC2626" }}
              />
              Loading…
            </div>
          }
        >
          <DocsHomeBody />
        </Suspense>
      </div>
    </div>
  );
}
