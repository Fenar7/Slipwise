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
import { getBooksCashFlow } from "../../actions";
import { ExportBooksReportButton } from "../../components/export-books-report-button";
import { formatBooksMoney } from "../../view-helpers";

export const metadata = {
  title: "Cash Flow | Slipwise",
};

interface CashFlowPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
}

export default async function CashFlowPage({ searchParams }: CashFlowPageProps) {
  const params = await searchParams;
  const filters = {
    startDate: params.startDate,
    endDate: params.endDate,
  };
  const result = await getBooksCashFlow(filters);

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
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Cash Flow</h1>
            <Badge variant={Math.abs(report.reconciliationDifference) <= 0.01 ? "success" : "warning"}>
              {Math.abs(report.reconciliationDifference) <= 0.01 ? "Reconciled" : "Difference"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Indirect cash flow built from net profit, working capital deltas, and bank-ledger balances.
          </p>
        </div>

        <ExportBooksReportButton
          report="cash-flow"
          filenamePrefix="books-cash-flow"
          filters={filters}
          label="Export CSV"
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Start date</span>
              <input type="date" name="startDate" defaultValue={params.startDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">End date</span>
              <input type="date" name="endDate" defaultValue={params.endDate ?? ""} className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
            </label>
            <div className="flex items-end">
              <Button type="submit" variant="secondary">Apply</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Opening Cash", value: formatBooksMoney(report.openingCash) },
          { label: "Closing Cash", value: formatBooksMoney(report.closingCash) },
          { label: "Net Profit", value: formatBooksMoney(report.netProfit) },
          { label: "Operating Cash", value: formatBooksMoney(report.netCashFromOperating) },
          { label: "Recon Difference", value: formatBooksMoney(report.reconciliationDifference) },
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
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Working capital adjustments</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Changes in AR, AP, and tax control accounts that bridge accrual profit to cash movement.
          </p>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Adjustment</FinanceTableHead>
              <FinanceTableHead align="right">Amount</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {report.adjustments.map((row) => (
                <FinanceTableRow key={row.label}>
                  <FinanceTableCell variant="primary">{row.label}</FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {formatBooksMoney(row.amount)}
                  </FinanceTableCell>
                </FinanceTableRow>
              ))}
              <FinanceTableRow className="bg-[var(--surface-subtle)]">
                <FinanceTableCell variant="primary" className="font-medium">
                  Total Adjustments
                </FinanceTableCell>
                <FinanceTableCell align="right" variant="numeric" className="font-semibold">
                  {formatBooksMoney(report.totalAdjustments)}
                </FinanceTableCell>
              </FinanceTableRow>
              <FinanceTableRow className="bg-[var(--surface-subtle)]">
                <FinanceTableCell variant="primary" className="font-medium">
                  Actual Net Cash Movement
                </FinanceTableCell>
                <FinanceTableCell align="right" variant="numeric" className="font-semibold">
                  {formatBooksMoney(report.actualNetCashMovement)}
                </FinanceTableCell>
              </FinanceTableRow>
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>
    </div>
  );
}
