import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableRow,
  FinanceTableCell,
  FinanceTableEmpty,
} from "@/components/ui/finance-table";
import { getBooksPaymentRunOptions, getBooksPaymentRuns } from "../actions";
import { CreatePaymentRunForm } from "../components/create-payment-run-form";
import { booksStatusBadgeVariant, formatBooksDate, formatBooksMoney } from "../view-helpers";

export const metadata = {
  title: "Payment Runs | Slipwise",
};

interface PaymentRunsPageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
  }>;
}

export default async function PaymentRunsPage({ searchParams }: PaymentRunsPageProps) {
  const params = await searchParams;
  const [runsResult, optionsResult] = await Promise.all([
    getBooksPaymentRuns({
      status: params.status as never,
      page: params.page ? Number.parseInt(params.page, 10) : undefined,
    }),
    getBooksPaymentRunOptions(),
  ]);

  if (!runsResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {runsResult.error}
        </div>
      </div>
    );
  }

  if (!optionsResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {optionsResult.error}
        </div>
      </div>
    );
  }

  const { runs, total, page, totalPages } = runsResult.data;
  const { bills } = optionsResult.data;
  const totalScheduled = runs.reduce((sum, run) => sum + run.totalAmount, 0);
  const pendingApprovalCount = runs.filter((run) => run.status === "PENDING_APPROVAL").length;
  const processingCount = runs.filter((run) => run.status === "PROCESSING").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Payment Runs</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Batch approved payables, route approvals, and track payout execution outcomes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/books/vendor-bills">
            <Button variant="secondary">Vendor Bills</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Runs in View", value: String(runs.length) },
          { label: "Pending Approval", value: String(pendingApprovalCount) },
          { label: "Processing", value: String(processingCount) },
          { label: "Total Value", value: formatBooksMoney(totalScheduled) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.label}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreatePaymentRunForm bills={bills} />

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filter payment runs</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review batches by lifecycle state and audit what is still waiting to be released.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Status</span>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              >
                <option value="">All statuses</option>
                {[
                  "DRAFT",
                  "PENDING_APPROVAL",
                  "APPROVED",
                  "PROCESSING",
                  "COMPLETED",
                  "FAILED",
                  "CANCELLED",
                  "REJECTED",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary">
                Apply
              </Button>
              <Link
                href="/app/books/payment-runs"
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline transition-colors"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Run history</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {total} payment run{total === 1 ? "" : "s"} across {totalPages} page{totalPages === 1 ? "" : "s"}.
            </p>
          </div>
          <Badge variant="default">Page {page}</Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Run</FinanceTableHead>
              <FinanceTableHead>Schedule</FinanceTableHead>
              <FinanceTableHead align="right">Items</FinanceTableHead>
              <FinanceTableHead align="right">Amount</FinanceTableHead>
              <FinanceTableHead>Status</FinanceTableHead>
              <FinanceTableHead align="right">Action</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {runs.length === 0 ? (
                <FinanceTableEmpty colSpan={6} message="No payment runs found for the current filter." />
              ) : (
                runs.map((run) => (
                  <FinanceTableRow key={run.id}>
                    <FinanceTableCell variant="primary">
                      <div className="font-medium">{run.runNumber}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {run.approvalRequests.length} pending approval request
                        {run.approvalRequests.length === 1 ? "" : "s"}
                      </div>
                    </FinanceTableCell>
                    <FinanceTableCell>
                      <div>{formatBooksDate(run.scheduledDate)}</div>
                      <div className="text-xs text-[var(--text-muted)]">Created {formatBooksDate(run.createdAt)}</div>
                    </FinanceTableCell>
                    <FinanceTableCell align="right">
                      {run.items.length} bill{run.items.length === 1 ? "" : "s"}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {formatBooksMoney(run.totalAmount)}
                    </FinanceTableCell>
                    <FinanceTableCell>
                      <Badge variant={booksStatusBadgeVariant(run.status)}>
                        {run.status.replaceAll("_", " ")}
                      </Badge>
                    </FinanceTableCell>
                    <FinanceTableCell align="right">
                      <Link
                        href={`/app/books/payment-runs/${run.id}`}
                        className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
                      >
                        View Detail
                      </Link>
                    </FinanceTableCell>
                  </FinanceTableRow>
                ))
              )}
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-4 text-sm">
          {page > 1 && (
            <Link
              href={`/app/books/payment-runs?${new URLSearchParams({
                ...(params.status ? { status: params.status } : {}),
                page: String(page - 1),
              }).toString()}`}
              className="font-medium text-[var(--brand-primary)] hover:underline"
            >
              ← Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/app/books/payment-runs?${new URLSearchParams({
                ...(params.status ? { status: params.status } : {}),
                page: String(page + 1),
              }).toString()}`}
              className="font-medium text-[var(--brand-primary)] hover:underline"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
