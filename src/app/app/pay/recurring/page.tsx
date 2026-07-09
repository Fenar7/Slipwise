import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Plus, Pause, Play, Trash2, Search, ArrowRight } from "lucide-react";
import {
  listRecurringRules,
  pauseRecurringRule,
  resumeRecurringRule,
  deleteRecurringRule,
} from "./actions";

export const metadata: Metadata = { title: "Recurring Invoices | Slipwise" };

const FREQ_COLORS: Record<string, string> = {
  WEEKLY: "bg-blue-50 text-blue-700 ring-blue-600/20",
  MONTHLY: "bg-purple-50 text-purple-700 ring-purple-600/20",
  QUARTERLY: "bg-amber-50 text-amber-700 ring-amber-600/20",
  YEARLY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  COMPLETED: "bg-slate-100 text-slate-700 ring-slate-500/10",
};

function Badge({ label, colorMap }: { label: string; colorMap: Record<string, string> }) {
  const colorClass = colorMap[label] ?? "bg-slate-50 text-slate-600 ring-slate-500/10";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${colorClass}`}>
      {label}
    </span>
  );
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = params.status;
  const page = Number(params.page) || 1;

  const { rules, totalPages } = await listRecurringRules({ status, page });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recurring Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Automate your billing with scheduled invoice generation.
          </p>
        </div>
        <Link 
          href="/app/pay/recurring/new"
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-500"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {["ALL", "ACTIVE", "PAUSED", "COMPLETED"].map((s) => {
          const isActive = (s === "ALL" && !status) || status === s;
          return (
            <Link
              key={s}
              href={`/app/pay/recurring${s === "ALL" ? "" : `?status=${s}`}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-inset ring-slate-200"
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {rules.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-slate-50 p-4 ring-1 ring-slate-100">
              <Clock className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">No recurring rules found</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {status 
                ? `You don't have any rules with status ${status}.` 
                : "Get started by creating a rule to automatically generate invoices on a schedule."}
            </p>
            {!status && (
              <Link
                href="/app/pay/recurring/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Create your first rule
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-900">Base Invoice</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-900">Schedule</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-900">Status</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-900">Next Run</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-900">Generated</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rules.map((rule) => (
                  <tr key={rule.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <Link href={`/app/pay/recurring/${rule.id}`} className="text-sm font-medium text-slate-900 hover:text-red-600 hover:underline">
                            {rule.baseInvoice.invoiceNumber}
                          </Link>
                          <span className="text-xs text-slate-500">
                            {rule.autoSend ? "Auto-sending" : "Draft only"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge label={rule.frequency} colorMap={FREQ_COLORS} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge label={rule.status} colorMap={STATUS_COLORS} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-slate-900">{formatDate(rule.nextRunAt)}</div>
                      {rule.endDate && (
                        <div className="text-xs text-slate-500">Until {formatDate(rule.endDate)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                        {rule.runsCount} invoices
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {rule.status === "ACTIVE" && (
                          <form action={async () => { "use server"; await pauseRecurringRule(rule.id); }}>
                            <button type="submit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-600" title="Pause">
                              <Pause className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                        {rule.status === "PAUSED" && (
                          <form action={async () => { "use server"; await resumeRecurringRule(rule.id); }}>
                            <button type="submit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600" title="Resume">
                              <Play className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                        {rule.status !== "COMPLETED" && (
                          <form action={async () => { "use server"; await deleteRecurringRule(rule.id); }}>
                            <button type="submit" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                        <Link href={`/app/pay/recurring/${rule.id}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View details">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/app/pay/recurring?${status ? `status=${status}&` : ""}page=${p}`}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                p === page
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-inset ring-slate-200"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
