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
import { getBooksTrialBalance } from "../actions";
import { ExportBooksReportButton } from "../components/export-books-report-button";

export const metadata = {
  title: "Trial Balance | Slipwise",
};

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const result = await getBooksTrialBalance(params);

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const trialBalance = result.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Trial Balance</h1>
            <Badge variant={trialBalance.balanced ? "success" : "danger"}>
              {trialBalance.balanced ? "Balanced" : "Out of balance"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Posted-account balances derived from the general ledger only.
          </p>
        </div>
        <ExportBooksReportButton
          report="trial-balance"
          filters={params}
          filenamePrefix="books-trial-balance"
          disabled={trialBalance.rows.length === 0}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Start date</span>
              <input
                type="date"
                name="startDate"
                defaultValue={params.startDate ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">End date</span>
              <input
                type="date"
                name="endDate"
                defaultValue={params.endDate ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </label>
            <div className="flex items-end justify-end">
              <Button type="submit">Apply</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Total debits</p>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
              {trialBalance.totals.debit.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Total credits</p>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
              {trialBalance.totals.credit.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Accounts</h2>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Code</FinanceTableHead>
              <FinanceTableHead>Account</FinanceTableHead>
              <FinanceTableHead>Type</FinanceTableHead>
              <FinanceTableHead align="right">Debits</FinanceTableHead>
              <FinanceTableHead align="right">Credits</FinanceTableHead>
              <FinanceTableHead align="right">Debit balance</FinanceTableHead>
              <FinanceTableHead align="right">Credit balance</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {trialBalance.rows.length === 0 ? (
                <FinanceTableEmpty colSpan={7} message="No posted balances found for the selected dates." />
              ) : (
                trialBalance.rows.map((row) => (
                  <FinanceTableRow key={row.id}>
                    <FinanceTableCell>{row.code}</FinanceTableCell>
                    <FinanceTableCell variant="primary">{row.name}</FinanceTableCell>
                    <FinanceTableCell>{row.accountType}</FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {row.totalDebit.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {row.totalCredit.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {row.debitBalance.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {row.creditBalance.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                  </FinanceTableRow>
                ))
              )}
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>
    </div>
  );
}
