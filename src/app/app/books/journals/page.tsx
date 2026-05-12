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
import { getBooksJournalRegister, getChartOfAccounts } from "../actions";
import { ExportBooksReportButton } from "../components/export-books-report-button";
import { JournalRowActions } from "../components/journal-row-actions";

export const metadata = {
  title: "Journals | Slipwise",
};

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: "DRAFT" | "POSTED" | "REVERSED";
    source?: "MANUAL" | "INVOICE" | "INVOICE_PAYMENT" | "VOUCHER" | "SALARY_SLIP" | "GST" | "TDS" | "OPENING_BALANCE" | "SYSTEM_REVERSAL";
    startDate?: string;
    endDate?: string;
    accountId?: string;
  }>;
}) {
  const params = await searchParams;
  const [accountsResult, journalsResult] = await Promise.all([
    getChartOfAccounts(),
    getBooksJournalRegister(params),
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

  if (!journalsResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {journalsResult.error}
        </div>
      </div>
    );
  }

  const accounts = accountsResult.data.filter((account) => account.isActive);
  const journals = journalsResult.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Journal Register</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Filter journal entries by date, source, account, and posting status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportBooksReportButton
            report="journals"
            filters={params}
            filenamePrefix="books-journal-register"
            disabled={journals.length === 0}
          />
          <Link href="/app/books/journals/new">
            <Button>Manual Journal</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-5">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Status</span>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-primary)]">Source</span>
              <select
                name="source"
                defaultValue={params.source ?? ""}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              >
                <option value="">All</option>
                {[
                  "MANUAL",
                  "INVOICE",
                  "INVOICE_PAYMENT",
                  "VOUCHER",
                  "SALARY_SLIP",
                  "GST",
                  "TDS",
                  "OPENING_BALANCE",
                  "SYSTEM_REVERSAL",
                ].map((source) => (
                  <option key={source} value={source}>
                    {source.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

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

            <div className="md:col-span-5 flex items-center justify-end gap-3">
              <Link
                href="/app/books/journals"
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline transition-colors"
              >
                Reset
              </Link>
              <Button type="submit">Apply Filters</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Entries</h2>
            <Badge variant="default">{journals.length} results</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Entry</FinanceTableHead>
              <FinanceTableHead>Date</FinanceTableHead>
              <FinanceTableHead>Source</FinanceTableHead>
              <FinanceTableHead>Period</FinanceTableHead>
              <FinanceTableHead align="right">Amount</FinanceTableHead>
              <FinanceTableHead>Evidence</FinanceTableHead>
              <FinanceTableHead>Status</FinanceTableHead>
              <FinanceTableHead align="right">Action</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {journals.length === 0 ? (
                <FinanceTableEmpty colSpan={8} message="No journals match the current filters." />
              ) : (
                journals.map((journal) => (
                  <FinanceTableRow key={journal.id}>
                    <FinanceTableCell variant="primary">
                      <Link
                        href={`/app/books/journals/${journal.id}`}
                        className="font-medium text-[var(--brand-primary)] hover:underline"
                      >
                        {journal.entryNumber}
                      </Link>
                      <div className="text-xs text-[var(--text-muted)]">
                        {journal.memo || journal.sourceRef || `${journal.lineCount} lines`}
                      </div>
                    </FinanceTableCell>
                    <FinanceTableCell>
                      {new Date(journal.entryDate).toLocaleDateString()}
                    </FinanceTableCell>
                    <FinanceTableCell>{journal.source.replaceAll("_", " ")}</FinanceTableCell>
                    <FinanceTableCell>{journal.periodLabel}</FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {journal.totalDebit.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell>
                      {journal.attachmentCount === 0
                        ? "No files"
                        : `${journal.attachmentCount} attachment${journal.attachmentCount === 1 ? "" : "s"}`}
                    </FinanceTableCell>
                    <FinanceTableCell>
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
                    </FinanceTableCell>
                    <FinanceTableCell align="right">
                      <JournalRowActions journalEntryId={journal.id} status={journal.status} />
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
