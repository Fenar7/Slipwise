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
import { getBooksProfitLoss } from "../../actions";
import { ExportBooksReportButton } from "../../components/export-books-report-button";
import { formatBooksMoney } from "../../view-helpers";

export const metadata = {
  title: "Profit & Loss | Slipwise",
};

interface ProfitLossPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    compareStartDate?: string;
    compareEndDate?: string;
  }>;
}

function StatementTable({
  title,
  subtitle,
  income,
  expenses,
  netProfit,
}: {
  title: string;
  subtitle: string;
  income: Array<{ id: string; code: string; name: string; amount: number }>;
  expenses: Array<{ id: string; code: string; name: string; amount: number }>;
  netProfit: number;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <FinanceTable>
          <FinanceTableHeader>
            <FinanceTableHead>Section</FinanceTableHead>
            <FinanceTableHead>Code</FinanceTableHead>
            <FinanceTableHead>Account</FinanceTableHead>
            <FinanceTableHead align="right">Amount</FinanceTableHead>
          </FinanceTableHeader>
          <FinanceTableBody>
            {income.map((row) => (
              <FinanceTableRow key={`${title}-income-${row.id}`}>
                <FinanceTableCell className="text-[var(--state-success)]">Income</FinanceTableCell>
                <FinanceTableCell>{row.code}</FinanceTableCell>
                <FinanceTableCell variant="primary">{row.name}</FinanceTableCell>
                <FinanceTableCell align="right" variant="numeric">
                  {formatBooksMoney(row.amount)}
                </FinanceTableCell>
              </FinanceTableRow>
            ))}
            {expenses.map((row) => (
              <FinanceTableRow key={`${title}-expense-${row.id}`}>
                <FinanceTableCell className="text-[var(--state-danger)]">Expense</FinanceTableCell>
                <FinanceTableCell>{row.code}</FinanceTableCell>
                <FinanceTableCell variant="primary">{row.name}</FinanceTableCell>
                <FinanceTableCell align="right" variant="numeric">
                  {formatBooksMoney(row.amount)}
                </FinanceTableCell>
              </FinanceTableRow>
            ))}
            <FinanceTableRow className="bg-[var(--surface-subtle)]">
              <FinanceTableCell className="font-medium text-[var(--text-primary)]" colSpan={3}>
                Net Profit
              </FinanceTableCell>
              <FinanceTableCell align="right" variant="numeric" className="font-semibold">
                {formatBooksMoney(netProfit)}
              </FinanceTableCell>
            </FinanceTableRow>
          </FinanceTableBody>
        </FinanceTable>
      </CardContent>
    </Card>
  );
}

export default async function ProfitLossPage({ searchParams }: ProfitLossPageProps) {
  const params = await searchParams;
  const filters = {
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
  };
  const result = await getBooksProfitLoss(filters);

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
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Profit &amp; Loss</h1>
            <Badge variant={report.current.totals.netProfit >= 0 ? "success" : "warning"}>
              {report.current.totals.netProfit >= 0 ? "Profit" : "Loss"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Period income, expenses, and comparison reporting derived from posted ledger balances.
          </p>
        </div>

        <ExportBooksReportButton
          report="profit-loss"
          filenamePrefix="books-profit-loss"
          filters={filters}
          label="Export CSV"
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Start date</span>
              <input type="date" name="startDate" defaultValue={params.startDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">End date</span>
              <input type="date" name="endDate" defaultValue={params.endDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Compare start</span>
              <input type="date" name="compareStartDate" defaultValue={params.compareStartDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Compare end</span>
              <input type="date" name="compareEndDate" defaultValue={params.compareEndDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
              <Button type="submit" variant="secondary">Apply</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Current Income", value: formatBooksMoney(report.current.totals.income) },
          { label: "Current Expenses", value: formatBooksMoney(report.current.totals.expenses) },
          { label: "Net Profit", value: formatBooksMoney(report.current.totals.netProfit) },
          {
            label: "Comparison Net",
            value: report.comparison ? formatBooksMoney(report.comparison.totals.netProfit) : "—",
          },
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

      <StatementTable
        title="Current period"
        subtitle={`${report.current.period.startDate} to ${report.current.period.endDate}`}
        income={report.current.income}
        expenses={report.current.expenses}
        netProfit={report.current.totals.netProfit}
      />

      {report.comparison && (
        <StatementTable
          title="Comparison period"
          subtitle={`${report.comparison.period.startDate} to ${report.comparison.period.endDate}`}
          income={report.comparison.income}
          expenses={report.comparison.expenses}
          netProfit={report.comparison.totals.netProfit}
        />
      )}
    </div>
  );
}
