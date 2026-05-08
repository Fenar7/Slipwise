import { requireRole } from "@/lib/auth";
import { getOrgPlan } from "@/lib/plans/enforcement";
import { getOrComputeSnapshot } from "@/lib/usage-metering";
import { UsageDashboardClient } from "@/features/settings/components/usage-dashboard-client";

export const metadata = { title: "Usage & Limits – Slipwise" };

function periodLabel(periodStart: Date, periodEnd: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(periodStart)} – ${fmt(periodEnd)}`;
}

function toNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function toLimit(v: unknown): number | null {
  const n = toNumber(v);
  if (!isFinite(n) || n < 0) return null;
  return n;
}

export default async function UsagePage() {
  const { orgId } = await requireRole("admin");

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [{ planId, limits }, snapshot] = await Promise.all([
    getOrgPlan(orgId),
    getOrComputeSnapshot(orgId),
  ]);

  const s = snapshot;

  const rows = [
    {
      label: "Invoices (active)",
      current: s.activeInvoices ?? 0,
      limit: toLimit(limits.invoicesPerMonth),
    },
    {
      label: "Quotes (active)",
      current: s.activeQuotes ?? 0,
      limit: toLimit(limits.quotesPerMonth),
    },
    {
      label: "Vouchers",
      current: s.vouchers ?? 0,
      limit: toLimit(limits.vouchersPerMonth),
    },
    {
      label: "Salary Slips",
      current: s.salarySlips ?? 0,
      limit: toLimit(limits.salarySlipsPerMonth),
    },
    {
      label: "Team Members",
      current: s.teamMembers ?? 0,
      limit: toLimit(limits.teamMembers),
    },
    {
      label: "Storage Used",
      current: s.storageBytes ?? 0,
      limit: toLimit(limits.storageBytes),
      isBytes: true,
    },
    {
      label: "Webhook Calls (this month)",
      current: s.webhookCallsMonthly ?? 0,
      limit: null,
    },
    {
      label: "Active Portal Sessions",
      current: s.activePortalSessions ?? 0,
      limit: toLimit(limits.activePortalSessions),
    },
    {
      label: "Active Share Bundles",
      current: s.activeShareBundles ?? 0,
      limit: toLimit(limits.activeShareBundles),
    },
    {
      label: "Pixel Jobs Saved",
      current: s.pixelJobsSaved ?? 0,
      limit: toLimit(limits.pixelJobsSaved),
    },
  ];

  return (
    <div className="min-h-screen px-3 py-4 sm:px-4 lg:px-5" style={{ background: "#f8f9fc" }}>
      <div className="mx-auto max-w-[1440px]">
        <UsageDashboardClient
          rows={rows}
          planName={planId}
          periodLabel={periodLabel(periodStart, periodEnd)}
        />
      </div>
    </div>
  );
}
