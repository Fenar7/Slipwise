import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/auth";
import { getFlowMetrics } from "@/lib/flow/metrics";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  AlertCircle,
  FileCheck2,
  Activity,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  GitBranch,
  Shield,
  ArrowRight,
} from "lucide-react";
import { KpiCard, DashboardSection, ContentPanel } from "@/components/dashboard";

export const metadata: Metadata = { title: "SW Flow Control Center" };

function ms(val: number | null): string {
  if (val === null) return "—";
  if (val < 60_000) return `${Math.round(val / 1000)}s`;
  if (val < 3_600_000) return `${Math.round(val / 60_000)}m`;
  return `${Math.round(val / 3_600_000)}h`;
}

export default async function FlowPage() {
  const { orgId } = await requireOrgContext();
  const m = await getFlowMetrics(orgId);

  const [recentRuns, workflows] = await Promise.all([
    db.workflowRun.findMany({
      where: { orgId },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { workflow: true },
    }),
    db.workflowDefinition.findMany({
      where: { orgId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const kpiItems = [
    {
      label: "Pending Approvals",
      value: m.pendingApprovals,
      icon: FileCheck2,
      trend: m.overdueApprovals > 0 ? { value: `${m.overdueApprovals} overdue`, direction: "down" as const } : undefined,
    },
    {
      label: "Open Tickets",
      value: m.openTickets,
      icon: AlertCircle,
    },
    {
      label: "SLA Breaches",
      value: m.slaBreachCount,
      icon: Clock,
      trend: m.slaBreachCount > 0 ? { value: "Requires intervention", direction: "down" as const } : undefined,
    },
    {
      label: "Dead-Lettered Actions",
      value: m.deadLetterCount,
      icon: ShieldAlert,
      trend: m.deadLetterCount > 0 ? { value: "Check job log", direction: "down" as const } : undefined,
    },
    {
      label: "Workflow Successes",
      value: m.workflowSuccessCount,
      icon: CheckCircle2,
    },
    {
      label: "Workflow Failures",
      value: m.workflowFailureCount,
      icon: XCircle,
      trend: m.workflowFailureCount > 0 ? { value: "Failures occurred", direction: "down" as const } : undefined,
    },
    {
      label: "Median Approval TAT",
      value: ms(m.medianApprovalTurnaroundMs),
      icon: TrendingUp,
      trend: { value: "Last 30 days", direction: "neutral" as const },
    },
    {
      label: "Median Ticket Resolution",
      value: ms(m.medianTicketResolutionMs),
      icon: Activity,
      trend: { value: "Last 30 days", direction: "neutral" as const },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-sm">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
                Flow Control Center
              </h1>
            </div>
          </div>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] max-w-xl">
            Manage approvals, SLAs, escalations, and automated workflows.
          </p>
        </div>
      </div>

      {/* Escalation Rules Banner */}
      <DashboardSection>
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Escalation Rules</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Configure automatic escalation for SLA breaches and approval timeouts.
              </p>
            </div>
          </div>
          <Link
            href="/app/flow/escalations"
            className="inline-flex items-center text-xs font-medium text-[var(--brand-primary)] hover:underline transition-colors"
          >
            Manage Rules <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
      </DashboardSection>

      {/* KPIs */}
      <DashboardSection>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiItems.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              trend={kpi.trend}
            />
          ))}
        </div>
      </DashboardSection>

      {/* Lists */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ContentPanel padding="none">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Workflow Activity</h2>
              <p className="text-xs text-[var(--text-muted)]">Recent automated flow executions.</p>
            </div>
            <Link
              href="/app/flow/activity"
              className="inline-flex items-center text-xs font-medium text-[var(--brand-primary)] hover:underline transition-colors"
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {recentRuns.length > 0 ? (
              <div className="flex flex-col gap-1">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/app/flow/workflows/${run.workflowId}/runs`}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--surface-selected)]"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{run.workflow.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {run.triggerType.replace(/\./g, " ").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          run.status === "SUCCEEDED"
                            ? "text-[var(--state-success)]"
                            : run.status === "FAILED"
                            ? "text-[var(--state-danger)]"
                            : "text-[var(--state-warning)]"
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {new Date(run.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                No recent flow activity.
              </div>
            )}
          </div>
        </ContentPanel>

        <ContentPanel padding="none">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Active Workflows</h2>
              <p className="text-xs text-[var(--text-muted)]">Currently enabled automated routines.</p>
            </div>
            <Link
              href="/app/flow/workflows"
              className="inline-flex items-center text-xs font-medium text-[var(--brand-primary)] hover:underline transition-colors"
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {workflows.length > 0 ? (
              <div className="flex flex-col gap-1">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="flex items-center justify-between rounded-md px-3 py-2.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{wf.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">Trigger: {wf.triggerType}</span>
                    </div>
                    <div className="rounded bg-[var(--state-success-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--state-success)]">
                      Active
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                No active workflows configured.
              </div>
            )}
          </div>
        </ContentPanel>
      </div>
    </div>
  );
}
