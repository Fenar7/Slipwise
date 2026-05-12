import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableRow,
  FinanceTableCell,
} from "@/components/ui/finance-table";
import { getChartOfAccounts } from "../actions";
import { AccountRowActions } from "../components/account-row-actions";
import { CreateAccountModal } from "../components/create-account-modal";
import { ExportBooksReportButton } from "../components/export-books-report-button";

export const metadata = {
  title: "Chart of Accounts | Slipwise",
};

interface ChartAccountRow {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId: string | null;
  parentName: string | null;
  isSystem: boolean;
  isProtected: boolean;
  isActive: boolean;
  entryCount: number;
  balance: number;
}

function renderAccountRows(
  accountId: string | null,
  rows: ChartAccountRow[],
  depth = 0,
): ReactNode[] {
  return rows
    .filter((row) => row.parentId === accountId)
    .flatMap((row) => [
      <FinanceTableRow key={row.id}>
        <FinanceTableCell>{row.code}</FinanceTableCell>
        <FinanceTableCell variant="primary">
          <div style={{ paddingLeft: `${depth * 16}px` }}>
            <span className="font-medium">{row.name}</span>
            {!row.isActive && <span className="ml-2 text-xs text-[var(--text-muted)]">(archived)</span>}
          </div>
        </FinanceTableCell>
        <FinanceTableCell>{row.accountType}</FinanceTableCell>
        <FinanceTableCell>{row.normalBalance}</FinanceTableCell>
        <FinanceTableCell align="right">{row.entryCount}</FinanceTableCell>
        <FinanceTableCell align="right" variant="numeric">
          {row.balance.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </FinanceTableCell>
        <FinanceTableCell>
          <Badge variant={row.isSystem ? "warning" : "default"}>
            {row.isSystem ? "System" : "Custom"}
          </Badge>
        </FinanceTableCell>
        <FinanceTableCell align="right">
          <AccountRowActions
            accountId={row.id}
            canArchive={!row.isSystem && !row.isProtected && row.entryCount === 0}
          />
        </FinanceTableCell>
      </FinanceTableRow>,
      ...renderAccountRows(row.id, rows, depth + 1),
    ]);
}

export default async function ChartOfAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "tree";
  const result = await getChartOfAccounts();

  if (!result.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const accounts = result.data;
  const parentOptions = accounts
    .filter((account) => account.isActive)
    .map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
    }));

  const listRows = [...accounts].sort((left, right) => left.code.localeCompare(right.code));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Chart of Accounts</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review seeded control accounts, create custom accounts, and inspect usage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-[var(--border-soft)] bg-white p-1 text-sm">
            <Link
              href="/app/books/chart-of-accounts?view=tree"
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                view === "tree"
                  ? "bg-[var(--brand-primary)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Tree
            </Link>
            <Link
              href="/app/books/chart-of-accounts?view=list"
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                view === "list"
                  ? "bg-[var(--brand-primary)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              List
            </Link>
          </div>
          <ExportBooksReportButton
            report="chart-of-accounts"
            filenamePrefix="books-chart-of-accounts"
            disabled={accounts.length === 0}
          />
          <CreateAccountModal parentOptions={parentOptions} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Accounts</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {accounts.length} accounts across system and custom structures.
              </p>
            </div>
            <Badge variant="default">{view.toUpperCase()} view</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Code</FinanceTableHead>
              <FinanceTableHead>Name</FinanceTableHead>
              <FinanceTableHead>Type</FinanceTableHead>
              <FinanceTableHead>Normal</FinanceTableHead>
              <FinanceTableHead align="right">Entries</FinanceTableHead>
              <FinanceTableHead align="right">Balance</FinanceTableHead>
              <FinanceTableHead>Class</FinanceTableHead>
              <FinanceTableHead align="right">Action</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {view === "tree"
                ? renderAccountRows(null, accounts)
                : listRows.map((row) => (
                    <FinanceTableRow key={row.id}>
                      <FinanceTableCell>{row.code}</FinanceTableCell>
                      <FinanceTableCell variant="primary">
                        <div className="font-medium">{row.name}</div>
                        {row.parentName && (
                          <div className="text-xs text-[var(--text-muted)]">Parent: {row.parentName}</div>
                        )}
                      </FinanceTableCell>
                      <FinanceTableCell>{row.accountType}</FinanceTableCell>
                      <FinanceTableCell>{row.normalBalance}</FinanceTableCell>
                      <FinanceTableCell align="right">{row.entryCount}</FinanceTableCell>
                      <FinanceTableCell align="right" variant="numeric">
                        {row.balance.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </FinanceTableCell>
                      <FinanceTableCell>
                        <Badge variant={row.isSystem ? "warning" : "default"}>
                          {row.isSystem ? "System" : "Custom"}
                        </Badge>
                      </FinanceTableCell>
                      <FinanceTableCell align="right">
                        <AccountRowActions
                          accountId={row.id}
                          canArchive={!row.isSystem && !row.isProtected && row.entryCount === 0}
                        />
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
