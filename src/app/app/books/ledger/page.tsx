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
import { getBooksLedger, getChartOfAccounts } from "../actions";
import { ExportBooksReportButton } from "../components/export-books-report-button";

export const metadata = {
  title: "General Ledger | Slipwise",
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const [accountsResult, ledgerResult] = await Promise.all([
    getChartOfAccounts(),
    getBooksLedger(params),
  ]);

  if (!accountsResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {accountsResult.error}
        </div>
      </div>
    );
  }

  if (!ledgerResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {ledgerResult.error}
        </div>
      </div>
    );
  }

  const accounts = accountsResult.data.filter((account) => account.isActive);
  const ledger = ledgerResult.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">General Ledger</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review posted journal lines with running balances by account.
          </p>
        </div>
        <ExportBooksReportButton
          report="ledger"
          filters={params}
          filenamePrefix="books-general-ledger"
          disabled={ledger.length === 0}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Account</span>
              <select
                name="accountId"
                defaultValue={params.accountId ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
            </label>

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

            <div className="flex items-end justify-end gap-3">
              <Button type="submit">Apply</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Ledger lines</h2>
            <Badge variant="default">{ledger.length} rows</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Date</FinanceTableHead>
              <FinanceTableHead>Account</FinanceTableHead>
              <FinanceTableHead>Entry</FinanceTableHead>
              <FinanceTableHead>Memo</FinanceTableHead>
              <FinanceTableHead align="right">Debit</FinanceTableHead>
              <FinanceTableHead align="right">Credit</FinanceTableHead>
              <FinanceTableHead align="right">Running</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {ledger.length === 0 ? (
                <FinanceTableEmpty colSpan={7} message="No posted ledger lines found for the selected filter." />
              ) : (
                ledger.map((line) => (
                  <FinanceTableRow key={line.id}>
                    <FinanceTableCell>
                      {new Date(line.entryDate).toLocaleDateString()}
                    </FinanceTableCell>
                    <FinanceTableCell variant="primary">
                      <div className="font-medium">
                        {line.accountCode} — {line.accountName}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{line.accountType}</div>
                    </FinanceTableCell>
                    <FinanceTableCell>
                      <div>{line.entryNumber}</div>
                      {line.sourceRef && (
                        <div className="text-xs text-[var(--text-muted)]">{line.sourceRef}</div>
                      )}
                    </FinanceTableCell>
                    <FinanceTableCell>
                      {line.description || line.memo || "—"}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {line.debit.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {line.credit.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {line.runningBalance.toLocaleString("en-IN", {
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
