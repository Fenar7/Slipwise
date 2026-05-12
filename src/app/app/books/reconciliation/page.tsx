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
import { BankTransactionActions } from "../components/bank-transaction-actions";
import { ExportReconciliationButton } from "../components/export-reconciliation-button";
import { RefreshReconciliationButton } from "../components/refresh-reconciliation-button";
import { UploadBankStatementForm } from "../components/upload-bank-statement-form";
import { getBooksReconciliationWorkspace } from "../actions";

export const metadata = {
  title: "Reconciliation | Slipwise",
};

function parseAmount(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface ReconciliationPageProps {
  searchParams: Promise<{
    bankAccountId?: string;
    importId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: string;
    maxAmount?: string;
  }>;
}

export default async function BooksReconciliationPage({
  searchParams,
}: ReconciliationPageProps) {
  const params = await searchParams;
  const filters = {
    bankAccountId: params.bankAccountId,
    importId: params.importId,
    status: params.status,
    startDate: params.startDate,
    endDate: params.endDate,
    minAmount: parseAmount(params.minAmount),
    maxAmount: parseAmount(params.maxAmount),
  };

  const result = await getBooksReconciliationWorkspace(filters);

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const { bankAccounts, transactions, importHistory, manualAccounts } = result.data;
  const statusCounts = {
    unmatched: transactions.filter((t) => t.status === "UNMATCHED").length,
    suggested: transactions.filter((t) => t.status === "SUGGESTED").length,
    partial: transactions.filter((t) => t.status === "PARTIALLY_MATCHED").length,
    matched: transactions.filter((t) => t.status === "MATCHED").length,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Bank Reconciliation</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Import statements, review suggestions, split matches, and post adjusting journals for
            unmatched cash movement.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/books/reconciliation/workbench">
            <Button variant="secondary">Open Workbench</Button>
          </Link>
          <RefreshReconciliationButton
            bankAccountId={filters.bankAccountId}
            importId={filters.importId}
          />
          <ExportReconciliationButton filters={filters} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Unmatched", value: statusCounts.unmatched.toString(), variant: "danger" as const },
          { label: "Suggested", value: statusCounts.suggested.toString(), variant: "default" as const },
          { label: "Partial", value: statusCounts.partial.toString(), variant: "warning" as const },
          { label: "Matched", value: statusCounts.matched.toString(), variant: "success" as const },
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

      <UploadBankStatementForm bankAccounts={bankAccounts} />

      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Filter bank lines</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Narrow the active reconciliation queue by account, status, date, and amount.
            </p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-primary)]">Bank account</span>
                <select
                  name="bankAccountId"
                  defaultValue={params.bankAccountId ?? ""}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                >
                  <option value="">All accounts</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-primary)]">Status</span>
                <select
                  name="status"
                  defaultValue={params.status ?? ""}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                >
                  <option value="">All statuses</option>
                  <option value="UNMATCHED">Unmatched</option>
                  <option value="SUGGESTED">Suggested</option>
                  <option value="PARTIALLY_MATCHED">Partially matched</option>
                  <option value="MATCHED">Matched</option>
                  <option value="IGNORED">Ignored</option>
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

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-primary)]">Min amount</span>
                <input
                  type="number"
                  step="0.01"
                  name="minAmount"
                  defaultValue={params.minAmount ?? ""}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-primary)]">Max amount</span>
                <input
                  type="number"
                  step="0.01"
                  name="maxAmount"
                  defaultValue={params.maxAmount ?? ""}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                />
              </label>

              <label className="block text-sm md:col-span-2 xl:col-span-2">
                <span className="mb-1 block font-medium text-[var(--text-primary)]">Import</span>
                <select
                  name="importId"
                  defaultValue={params.importId ?? ""}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                >
                  <option value="">All imports</option>
                  {importHistory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fileName} — {new Date(item.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
                <Button type="submit" variant="secondary">
                  Apply filters
                </Button>
                <Link
                  href="/app/books/reconciliation"
                  className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline transition-colors"
                >
                  Reset
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Import history</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Review recent bank imports, failed rows, and generated suggestions.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {importHistory.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
                No bank imports yet.
              </div>
            ) : (
              importHistory.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href={`/app/books/reconciliation/imports/${item.id}`}
                  className="block rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 transition-colors hover:bg-[var(--surface-selected)] hover:border-[var(--border-default)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.fileName}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {item.bankAccount.name} • {item.importedRows} imported / {item.failedRows} failed
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.status === "PROCESSED"
                          ? "success"
                          : item.status === "FAILED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Reconciliation queue</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Confirm suggestions, split matches by editing the amount prompt, or post an adjusting
            journal for suspense and write-offs. Partially matched lines stay in review until the
            remaining balance is resolved or explicitly cleared.
          </p>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Transaction</FinanceTableHead>
              <FinanceTableHead align="right">Amount</FinanceTableHead>
              <FinanceTableHead>Status</FinanceTableHead>
              <FinanceTableHead>Matches & Actions</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {transactions.length === 0 ? (
                <FinanceTableEmpty
                  colSpan={4}
                  message="No bank transactions match the current filters."
                />
              ) : (
                transactions.map((transaction) => (
                  <FinanceTableRow key={transaction.id}>
                    <FinanceTableCell variant="primary">
                      <div className="font-medium">{transaction.bankAccount.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {new Date(transaction.txnDate).toLocaleDateString()} •{" "}
                        {transaction.reference ?? "No reference"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">{transaction.description}</div>
                      {transaction.import && (
                        <div className="mt-2 text-xs text-[var(--text-muted)]">
                          Import:{" "}
                          <Link
                            href={`/app/books/reconciliation/imports/${transaction.import.id}`}
                            className="font-medium text-[var(--brand-primary)] hover:underline"
                          >
                            {transaction.import.fileName}
                          </Link>
                        </div>
                      )}
                    </FinanceTableCell>
                    <FinanceTableCell align="right">
                      <div className="font-medium tabular-nums">
                        {transaction.direction === "CREDIT" ? "+" : "-"}
                        {transaction.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      {transaction.runningBalance !== null && (
                        <div className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
                          Balance {transaction.runningBalance.toFixed(2)}
                        </div>
                      )}
                    </FinanceTableCell>
                    <FinanceTableCell>
                      <Badge
                        variant={
                          transaction.status === "MATCHED"
                            ? "success"
                            : transaction.status === "PARTIALLY_MATCHED"
                              ? "warning"
                              : transaction.status === "IGNORED"
                                ? "default"
                                : "danger"
                        }
                      >
                        {transaction.status.replaceAll("_", " ")}
                      </Badge>
                    </FinanceTableCell>
                    <FinanceTableCell>
                      <BankTransactionActions
                        transactionId={transaction.id}
                        status={transaction.status}
                        suggestions={transaction.matches}
                        manualAccounts={manualAccounts}
                      />
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
