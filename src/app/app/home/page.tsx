import type { Metadata } from "next";
import { countPasskeysForUser } from "@/lib/passkey/db";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getDashboardData } from "./actions";
import { PasskeyAdoptionPrompt } from "./passkey-adoption-prompt";
import {
  KpiRow,
  RevenueChart,
  DocBreakdownChart,
  ActivitySidebar,
  ModuleGrid,
  RecentDocs,
} from "@/components/dashboard";

export const metadata: Metadata = { title: "Dashboard | Slipwise" };

async function getCurrentUserPasskeyCount(): Promise<number> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 1;
  return countPasskeysForUser(user.id);
}

export default async function AppHomePage() {
  const [dashboardResult, passkeyCount] = await Promise.all([
    getDashboardData(),
    getCurrentUserPasskeyCount(),
  ]);

  const data = dashboardResult.success ? dashboardResult.data : null;

  return (
    <div className="min-h-screen px-3 py-4 sm:px-4 lg:px-5" style={{ background: "#f8f9fc" }}>
      <div className="mx-auto max-w-[1440px]">
        {/* Header */}
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#1C1B1F" }}>
              Dashboard
            </h1>
            <p className="text-xs" style={{ color: "#79747E" }}>
              Workspace overview
            </p>
          </div>
          {data && (
            <p className="text-xs" style={{ color: "#79747E" }}>
              {data.counts.total} documents · {data.kpis.pay.invoicesIssued} invoices this month
            </p>
          )}
        </div>

        <PasskeyAdoptionPrompt show={passkeyCount === 0} />

        {/* KPI Row */}
        {data && (
          <div className="mb-4">
            <KpiRow counts={data.counts} kpis={{ pay: data.kpis.pay }} />
          </div>
        )}

        {/* Main grid: Charts + Activity */}
        <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Left: Revenue chart — takes 2/3 */}
          <div className="lg:col-span-2">
            {data && <RevenueChart data={data.revenueTrend} />}
            {!data && (
              <div
                className="flex h-[340px] items-center justify-center rounded-2xl border bg-white"
                style={{ borderColor: "#E0E0E0" }}
              >
                <p className="text-sm" style={{ color: "#79747E" }}>
                  Unable to load dashboard data
                </p>
              </div>
            )}
          </div>

          {/* Right: stacked cards — takes 1/3 */}
          <div className="flex flex-col gap-3 lg:col-span-1">
            {data && (
              <>
                <DocBreakdownChart
                  counts={{
                    invoice: data.counts.invoice,
                    voucher: data.counts.voucher,
                    salarySlip: data.counts.salarySlip,
                  }}
                />
                <div className="flex-1" style={{ minHeight: 200 }}>
                  <ActivitySidebar entries={data.recentActivity} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom row: Recent docs + Module grid */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-1">
            {data && <RecentDocs docs={data.recentDocs} />}
          </div>
          <div className="lg:col-span-2">
            <div
              className="h-full rounded-2xl border bg-white p-4"
              style={{ borderColor: "#E0E0E0" }}
            >
              <h2 className="mb-3 text-sm font-semibold" style={{ color: "#1C1B1F" }}>
                Module Access
              </h2>
              <ModuleGrid />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
