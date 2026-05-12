import Link from "next/link";
import { getBooksReconciliationWorkspace } from "../../actions";
import { WorkbenchClient } from "./workbench-client";

export const metadata = {
  title: "Reconciliation Workbench | Slipwise Books",
};

export default async function ReconciliationWorkbenchPage() {
  const result = await getBooksReconciliationWorkspace({
    status: "UNMATCHED",
  });

  const suggestedResult = await getBooksReconciliationWorkspace({
    status: "SUGGESTED",
  });

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }
  if (!suggestedResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {suggestedResult.error}
        </div>
      </div>
    );
  }

  const unmatched = result.data.transactions;
  const suggested = suggestedResult.data.transactions;

  const allPending = [
    ...unmatched,
    ...suggested.filter((t) => !unmatched.some((u) => u.id === t.id)),
  ].sort((a, b) => new Date(b.txnDate).getTime() - new Date(a.txnDate).getTime());

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/app/books/reconciliation"
            className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            ← Back to Reconciliation
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
            Reconciliation Workbench
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review unmatched bank transactions and confirm or reject suggested matches.
          </p>
        </div>

        <div className="flex gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--state-danger-soft)] px-3 py-1 font-medium text-[var(--state-danger)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--state-danger)]" />
            {unmatched.length} Unmatched
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-subtle)] px-3 py-1 font-medium text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
            {suggested.length} Suggested
          </span>
        </div>
      </div>

      <WorkbenchClient transactions={allPending} />
    </div>
  );
}
