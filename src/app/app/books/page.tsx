import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KpiCard,
  DashboardSection,
  ContentPanel,
  QuickActionCard,
} from "@/components/dashboard";
import { getBooksOverview } from "./actions";
import { JournalRowActions } from "./components/journal-row-actions";
import { PeriodActionButtons } from "./components/period-action-buttons";
import {
  BookOpen,
  ArrowRight,
  FileSpreadsheet,
  Landmark,
  ScrollText,
  Scale,
  Receipt,
  CheckCircle2,
} from "lucide-react";

export const metadata = {
  title: "Books | Slipwise",
};

const booksQuickActions = [
  {
    label: "Manual Journal",
    href: "/app/books/journals/new",
    icon: ScrollText,
    description: "Create a balanced journal entry",
  },
  {
    label: "Vendor Bill",
    href: "/app/books/vendor-bills/new",
    icon: Receipt,
    description: "Record a payable invoice",
  },
  {
    label: "Chart of Accounts",
    href: "/app/books/chart-of-accounts",
    icon: FileSpreadsheet,
    description: "Review or add GL accounts",
  },
  {
    label: "Bank Accounts",
    href: "/app/books/banks",
    icon: Landmark,
    description: "Manage reconciliation accounts",
  },
];

export default async function BooksOverviewPage() {
  const result = await getBooksOverview();

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const { metrics, setup, recentJournals, periods, trialBalance } = result.data;

  const kpiItems = [
    {
      label: "Chart of Accounts",
      value: metrics.totalAccounts,
      icon: FileSpreadsheet,
      trend: undefined,
    },
    {
      label: "Posted journals",
      value: metrics.postedJournals,
      icon: ScrollText,
      trend:
        metrics.draftJournals > 0
          ? { value: `${metrics.draftJournals} draft`, direction: "neutral" as const }
          : undefined,
    },
    {
      label: "Open periods",
      value: metrics.openPeriods,
      icon: CheckCircle2,
      trend:
        metrics.lockedPeriods > 0
          ? { value: `${metrics.lockedPeriods} locked`, direction: "neutral" as const }
          : undefined,
    },
    {
      label: "Trial balance",
      value: trialBalance.balanced ? "Balanced" : "Out of balance",
      icon: Scale,
      trend: trialBalance.balanced
        ? undefined
        : { value: `Dr ${trialBalance.debit.toFixed(2)} / Cr ${trialBalance.credit.toFixed(2)}`, direction: "down" as const },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-sm">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
                Books
              </h1>
            </div>
            <Badge variant={trialBalance.balanced ? "success" : "danger"} className="ml-1">
              {trialBalance.balanced ? "Balanced" : "Out of balance"}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] max-w-xl">
            Accounting foundation, journals, fiscal periods, and core finance controls.{" "}
            <span className="text-[var(--text-secondary)]">{setup.templateKey.replaceAll("_", " ")}</span> template.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link href="/app/books/journals/new">
            <Button size="sm">Manual Journal</Button>
          </Link>
          <Link href="/app/books/trial-balance">
            <Button variant="secondary" size="sm">Trial Balance</Button>
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <DashboardSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {booksQuickActions.map((action) => (
            <QuickActionCard
              key={action.href}
              href={action.href}
              label={action.label}
              description={action.description}
              icon={action.icon}
              variant="default"
            />
          ))}
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

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Recent journals */}
        <ContentPanel padding="none">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent journals</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Latest journal activity across manual and operational postings.
              </p>
            </div>
            <Link
              href="/app/books/journals"
              className="inline-flex items-center text-xs font-medium text-[var(--brand-primary)] hover:underline transition-colors"
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-left text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  <th className="px-5 py-2.5 font-medium">Entry</th>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {recentJournals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                      No journals posted yet.
                    </td>
                  </tr>
                ) : (
                  recentJournals.map((journal) => (
                    <tr
                      key={journal.id}
                      className="hover:bg-[var(--surface-selected)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {journal.entryNumber}
                        </div>
                        {journal.sourceRef && (
                          <div className="text-xs text-[var(--text-muted)]">{journal.sourceRef}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {new Date(journal.entryDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {journal.source.replaceAll("_", " ")}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">
                        {journal.totalDebit.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={
                            journal.status === "POSTED"
                              ? "success"
                              : journal.status === "REVERSED"
                                ? "warning"
                                : "default"
                          }
                        >
                          {journal.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <JournalRowActions journalEntryId={journal.id} status={journal.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ContentPanel>

        {/* Fiscal periods */}
        <ContentPanel padding="none">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Fiscal periods</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Lock and reopen periods with an explicit audit trail.
              </p>
            </div>
            <Badge variant="default" className="tabular-nums">
              TB {trialBalance.debit.toFixed(2)} / {trialBalance.credit.toFixed(2)}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-left text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  <th className="px-5 py-2.5 font-medium">Period</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {periods.map((period) => (
                  <tr
                    key={period.id}
                    className="hover:bg-[var(--surface-selected)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {period.label}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {new Date(period.startDate).toLocaleDateString()} —{" "}
                        {new Date(period.endDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          period.status === "OPEN"
                            ? "success"
                            : period.status === "LOCKED"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {period.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <PeriodActionButtons periodId={period.id} status={period.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContentPanel>
      </div>
    </div>
  );
}
