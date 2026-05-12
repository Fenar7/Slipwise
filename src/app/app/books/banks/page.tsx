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
import { CreateBankAccountModal } from "../components/create-bank-account-modal";
import { getBooksBankAccounts } from "../actions";

export const metadata = {
  title: "Bank Accounts | Slipwise",
};

export default async function BooksBanksPage() {
  const result = await getBooksBankAccounts();

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
  const activeCount = accounts.filter((account) => account.isActive).length;
  const primaryCount = accounts.filter((account) => account.isPrimary).length;
  const pendingTxnCount = accounts.reduce((sum, account) => sum + account.pendingTxnCount, 0);
  const importCount = accounts.reduce((sum, account) => sum + account.importCount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Bank Accounts</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage cash, bank, petty cash, and gateway-clearing accounts used by reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/books/reconciliation">
            <Button variant="secondary">Open Reconciliation</Button>
          </Link>
          <CreateBankAccountModal />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active Accounts", value: activeCount.toString() },
          { label: "Primary Accounts", value: primaryCount.toString() },
          { label: "Pending Bank Lines", value: pendingTxnCount.toString() },
          { label: "Statement Imports", value: importCount.toString() },
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Registered accounts</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Each account links to a dedicated ledger account and import profile.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Account</FinanceTableHead>
              <FinanceTableHead>Type</FinanceTableHead>
              <FinanceTableHead>Ledger</FinanceTableHead>
              <FinanceTableHead>Currency</FinanceTableHead>
              <FinanceTableHead align="right">Opening Balance</FinanceTableHead>
              <FinanceTableHead align="right">Imports</FinanceTableHead>
              <FinanceTableHead align="right">Open Items</FinanceTableHead>
              <FinanceTableHead align="right">Action</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {accounts.length === 0 ? (
                <FinanceTableEmpty
                  colSpan={8}
                  message="No bank accounts yet. Add your first account to start importing statements."
                />
              ) : (
                accounts.map((account) => (
                  <FinanceTableRow key={account.id}>
                    <FinanceTableCell variant="primary">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{account.name}</span>
                        {account.isPrimary && <Badge variant="success">Primary</Badge>}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {account.bankName ?? "Internal cash account"}
                        {account.maskedAccountNo ? ` • ${account.maskedAccountNo}` : ""}
                      </div>
                    </FinanceTableCell>
                    <FinanceTableCell>{account.type.replaceAll("_", " ")}</FinanceTableCell>
                    <FinanceTableCell>
                      {account.glAccount.code} — {account.glAccount.name}
                    </FinanceTableCell>
                    <FinanceTableCell>{account.currency}</FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {account.openingBalance.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </FinanceTableCell>
                    <FinanceTableCell align="right">{account.importCount}</FinanceTableCell>
                    <FinanceTableCell align="right">{account.pendingTxnCount}</FinanceTableCell>
                    <FinanceTableCell align="right">
                      <Link
                        href={`/app/books/reconciliation?bankAccountId=${account.id}`}
                        className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
                      >
                        Reconcile
                      </Link>
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
