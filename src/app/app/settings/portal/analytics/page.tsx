import { TrendingUp, Users, Eye, FileText, Package, ShieldAlert, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getPortalAnalyticsSummary } from "@/lib/portal-signals";
import { db } from "@/lib/db";

export const metadata = { title: "Portal Analytics – Slipwise" };

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${highlight && value > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <span className={`text-gray-400 ${highlight && value > 0 ? "text-red-400" : ""}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${highlight && value > 0 ? "text-red-700" : "text-gray-900"}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default async function PortalAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { orgId } = await requireRole("admin");
  const { days: daysParam } = await searchParams;
  const periodDays = Math.min(90, Math.max(7, parseInt(daysParam ?? "30", 10) || 30));

  const summary = await getPortalAnalyticsSummary(orgId, periodDays);

  const unusualEvents = await db.externalAccessEvent.findMany({
    where: {
      orgId,
      eventType: "UNUSUAL_ACCESS",
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const customerIds = Array.from(
    new Set(unusualEvents.map((e) => e.customerId).filter(Boolean) as string[])
  );

  const customers = customerIds.length > 0
    ? await db.customer.findMany({
        where: { id: { in: customerIds }, organizationId: orgId },
        select: { id: true, name: true, email: true },
      })
    : [];

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const unusualEventsWithCustomer = unusualEvents.map((e) => ({
    ...e,
    customer: e.customerId ? customerMap.get(e.customerId) : undefined,
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Portal Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customer portal and share activity over the past {periodDays} days.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {[7, 30, 90].map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                periodDays === d
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {d}d
            </a>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Portal Logins"
          value={summary.totalLogins}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Invoice Views"
          value={summary.totalInvoiceViews}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Quote Decisions"
          value={summary.totalQuoteDecisions}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Share Views"
          value={summary.totalShareViews}
          icon={<Eye className="h-5 w-5" />}
        />
        <StatCard
          label="Proof Uploads"
          value={summary.totalProofUploads}
          icon={<Upload className="h-5 w-5" />}
        />
        <StatCard
          label="Unusual Access Events"
          value={summary.unusualAccessCount}
          icon={<ShieldAlert className="h-5 w-5" />}
          highlight
        />
      </div>

      {summary.unusualAccessCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="font-medium text-red-800">Unusual access detected</p>
              <p className="mt-1 text-sm text-red-600">
                {summary.unusualAccessCount} unusual access event{summary.unusualAccessCount > 1 ? "s were" : " was"} recorded.
                Review active portal sessions and revoke any suspicious access.
              </p>
              <a
                href="/app/settings/portal/activity"
                className="mt-2 inline-flex text-sm font-medium text-red-700 underline-offset-2 hover:underline"
              >
                Review portal access logs →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Recent Unusual Activity */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-gray-900">Recent Security Alerts & Unusual Access</h2>
        </div>

        {unusualEventsWithCustomer.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No unusual access attempts detected in this organization.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-500">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700 font-semibold">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Event Detail</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">User Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {unusualEventsWithCustomer.map((event) => {
                  const metadataObj = typeof event.metadata === "object" && event.metadata !== null
                    ? (event.metadata as Record<string, unknown>)
                    : {};
                  const reason = String(metadataObj.reason || "N/A").replace(/_/g, " ");
                  const flow = String(metadataObj.flow || "");
                  return (
                    <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 font-mono">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {event.customer ? (
                          <div>
                            <div className="font-medium text-gray-900">{event.customer.name}</div>
                            <div className="text-xs text-gray-400">{event.customer.email}</div>
                          </div>
                        ) : (
                          <span className="italic text-gray-400">Unknown Client ({event.customerId || "N/A"})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 capitalize">
                          {reason} {flow ? `(${flow})` : ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-mono text-gray-600">
                        {event.ip || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate" title={event.userAgent || ""}>
                        {event.userAgent || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary.totalLogins === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center">
          <Package className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">No portal activity in this period</p>
          <p className="mt-1 text-sm text-gray-500">
            Share portal access with customers to start tracking engagement.
          </p>
          <a
            href="/app/settings/portal/readiness"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            Check portal readiness →
          </a>
        </div>
      )}
    </div>
  );
}
