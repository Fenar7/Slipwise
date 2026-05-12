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
} from "@/components/ui/finance-table";
import { getBooksAccountsPayableAging } from "../../actions";
import { ExportBooksReportButton } from "../../components/export-books-report-button";
import { booksStatusBadgeVariant, formatBooksMoney } from "../../view-helpers";

export const metadata = {
  title: "AP Aging | Slipwise",
};

interface AccountsPayableAgingPageProps {
  searchParams: Promise<{
    asOfDate?: string;
  }>;
}

export default async function AccountsPayableAgingPage({
  searchParams,
}: AccountsPayableAgingPageProps) {
  const params = await searchParams;
  const filters = { asOfDate: params.asOfDate };
  const result = await getBooksAccountsPayableAging(filters);

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const report = result.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Accounts Payable Aging</h1>
            <Badge variant={Math.abs(report.variance) <= 0.01 ? "success" : "warning"}>
              {Math.abs(report.variance) <= 0.01 ? "Tied Out" : "Variance"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Vendor-bill aging based on open AP balances and payable control-account totals.
          </p>
        </div>

        <ExportBooksReportButton
          report="ap-aging"
          filenamePrefix="books-ap-aging"
          filters={filters}
          label="Export CSV"
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">As of date</span>
              <input type="date" name="asOfDate" defaultValue={params.asOfDate ?? ""} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <Button type="submit" variant="secondary">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Outstanding", value: formatBooksMoney(report.totalOutstanding) },
          { label: "GL Balance", value: formatBooksMoney(report.glBalance) },
          { label: "Variance", value: formatBooksMoney(report.variance) },
          { label: "Open Bills", value: String(report.rows.length) },
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

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Buckets</h2>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {report.buckets.map((bucket) => (
            <div key={bucket.label} className="rounded-xl border border-[var(--border-soft)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{bucket.label}</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)] tabular-nums">
                {formatBooksMoney(bucket.total)}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {bucket.count} bill{bucket.count === 1 ? "" : "s"} • {bucket.percentage}%
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Open payables</h2>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Bill</FinanceTableHead>
              <FinanceTableHead>Vendor</FinanceTableHead>
              <FinanceTableHead>Dates</FinanceTableHead>
              <FinanceTableHead align="right">Outstanding</FinanceTableHead>
              <FinanceTableHead>Bucket</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {report.rows.map((row) => (
                <FinanceTableRow key={row.id}>
                  <FinanceTableCell variant="primary">{row.number}</FinanceTableCell>
                  <FinanceTableCell>{row.partyName ?? "—"}</FinanceTableCell>
                  <FinanceTableCell>
                    <div>Bill {row.issueDate}</div>
                    <div className="text-xs text-[var(--text-muted)]">Due {row.dueDate ?? "—"}</div>
                  </FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {formatBooksMoney(row.outstandingAmount)}
                  </FinanceTableCell>
                  <FinanceTableCell>
                    <Badge variant={booksStatusBadgeVariant(row.daysOverdue > 0 ? "OVERDUE" : "CURRENT")}>
                      {row.bucket}
                    </Badge>
                  </FinanceTableCell>
                </FinanceTableRow>
              ))}
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>
    </div>
  );
}
