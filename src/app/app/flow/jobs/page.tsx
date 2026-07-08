import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { replayAction, cancelAction } from "./actions";
import { ShieldAlert, RotateCcw, XCircle, Clock, ServerCrash } from "lucide-react";
import { ContentPanel } from "@/components/dashboard";

export default async function JobsConsolePage() {
  const { orgId } = await requireOrgContext();

  const actions = await db.scheduledAction.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-sm">
            <ServerCrash className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Job Log
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Manage scheduled background actions, monitor dead-letters, and replay failures.
            </p>
          </div>
        </div>
      </div>

      <ContentPanel padding="none">
        <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-[var(--surface-primary)] shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[0.75rem] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Attempts</th>
                <th className="px-5 py-3 font-semibold">Failure Reason</th>
                <th className="px-5 py-3 text-right font-semibold">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {actions.map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--text-primary)]">{job.actionType}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(job.scheduledAt)}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                        job.status === "DEAD_LETTERED"
                          ? "bg-[var(--state-danger-soft)] text-[var(--state-danger)]"
                          : job.status === "SUCCEEDED"
                          ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
                          : job.status === "FAILED"
                          ? "bg-[var(--state-warning-soft)] text-[var(--state-warning)]"
                          : job.status === "CANCELLED"
                          ? "bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                          : "bg-blue-50 text-blue-700" // PENDING
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--text-secondary)]">
                    {job.attemptCount} <span className="text-[var(--text-muted)]">/ {job.maxAttempts}</span>
                  </td>
                  <td
                    className="max-w-[200px] truncate px-5 py-3.5 text-[var(--text-secondary)]"
                    title={job.lastError || "None"}
                  >
                    {job.lastError || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <form className="flex items-center justify-end gap-2">
                      <input type="hidden" name="id" value={job.id} />
                      {(job.status === "DEAD_LETTERED" || job.status === "FAILED") && (
                        <button
                          formAction={async (fd) => {
                            "use server";
                            await replayAction(fd.get("id") as string);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          title="Replay Job"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                      {(job.status === "PENDING" ||
                        job.status === "FAILED" ||
                        job.status === "DEAD_LETTERED") && (
                        <button
                          formAction={async (fd) => {
                            "use server";
                            await cancelAction(fd.get("id") as string);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                          title="Cancel Job"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}

              {actions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)] opacity-50" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">No jobs in the queue</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Background tasks and dead letters will appear here.</p>
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
