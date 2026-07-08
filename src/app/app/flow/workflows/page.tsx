import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  PauseCircle,
  Plus,
} from "lucide-react";
import { ContentPanel } from "@/components/dashboard";

export const metadata: Metadata = { title: "Workflow Definitions — Flow" };

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[var(--surface-subtle)] text-[var(--text-secondary)]",
  ACTIVE: "bg-[var(--state-success-soft)] text-[var(--state-success)]",
  INACTIVE: "bg-[var(--state-warning-soft)] text-[var(--state-warning)]",
  ARCHIVED: "bg-[var(--state-danger-soft)] text-[var(--state-danger)]",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  DRAFT: <Clock className="w-3.5 h-3.5" />,
  ACTIVE: <CheckCircle2 className="w-3.5 h-3.5" />,
  INACTIVE: <PauseCircle className="w-3.5 h-3.5" />,
  ARCHIVED: <XCircle className="w-3.5 h-3.5" />,
};

export default async function WorkflowsPage() {
  const { orgId } = await requireOrgContext();

  const workflows = await db.workflowDefinition.findMany({
    where: { orgId },
    include: {
      _count: { select: { runs: true, steps: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-sm">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Workflow Definitions
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Configure bounded trigger/action automations for your organisation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <Zap className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Bounded — approved triggers &amp; actions only
          </span>
          <Link
            href="/app/flow/workflows/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            New Workflow
          </Link>
        </div>
      </div>

      <ContentPanel padding="none">
        <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface-primary)] shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[0.75rem] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Trigger</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Steps</th>
                <th className="px-5 py-3 font-semibold">Runs</th>
                <th className="px-5 py-3 font-semibold">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {workflows.map((wf) => (
                <tr key={wf.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/app/flow/workflows/${wf.id}`}
                      className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)] hover:underline"
                    >
                      <GitBranch className="h-4 w-4 text-[var(--text-muted)]" />
                      {wf.name}
                    </Link>
                    {wf.description && (
                      <p className="mt-1 max-w-[250px] truncate text-xs text-[var(--text-muted)]">
                        {wf.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="rounded border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                      {wf.triggerType}
                    </code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                        STATUS_STYLES[wf.status] ?? ""
                      }`}
                    >
                      {STATUS_ICON[wf.status]}
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-[var(--text-secondary)] tabular-nums">
                    {wf._count.steps}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums">
                    <Link
                      href={`/app/flow/workflows/${wf.id}/runs`}
                      className="font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      {wf._count.runs}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
                    v{wf.version}
                  </td>
                </tr>
              ))}

              {workflows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <GitBranch className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)] opacity-50" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      No workflow definitions yet
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Create your first automation to get started.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ContentPanel>
    </div>
  );
}
