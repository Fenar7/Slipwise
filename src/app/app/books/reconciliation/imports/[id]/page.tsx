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
  FinanceTableEmpty,
} from "@/components/ui/finance-table";
import { BankTransactionActions } from "../../../components/bank-transaction-actions";
import { ExportReconciliationButton } from "../../../components/export-reconciliation-button";
import { RefreshReconciliationButton } from "../../../components/refresh-reconciliation-button";
import { getBooksBankImportDetail, getBooksReconciliationWorkspace } from "../../../actions";

export const metadata = {
  title: "Bank Import Detail | Slipwise",
};

interface ImportDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BankImportDetailPage({ params }: ImportDetailPageProps) {
  const { id } = await params;
  const [detailResult, workspaceResult] = await Promise.all([
    getBooksBankImportDetail(id),
    getBooksReconciliationWorkspace({ importId: id }),
  ]);

  if (!detailResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {detailResult.error}
        </div>
      </div>
    );
  }

  if (!workspaceResult.success) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {workspaceResult.error}
        </div>
      </div>
    );
  }

  const detail = detailResult.data;
  const { manualAccounts, transactions } = workspaceResult.data;
  const failedRows = Array.isArray(detail.errorRows)
    ? (detail.errorRows as Array<{ rowNumber: number; error: string; raw: Record<string, string> }>)
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/app/books/reconciliation"
            className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            ← Back to Reconciliation
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{detail.fileName}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {detail.bankAccount.name} • imported on {new Date(detail.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <RefreshReconciliationButton importId={id} bankAccountId={detail.bankAccountId} />
          <ExportReconciliationButton filters={{ importId: id, bankAccountId: detail.bankAccountId }} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Imported Rows", value: String(detail.importedRows) },
          { label: "Failed Rows", value: String(detail.failedRows) },
          { label: "Transactions", value: String(detail.transactions.length) },
          { label: "Status", value: detail.status.replaceAll("_", " ") },
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

      {failedRows.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Failed rows</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              These rows were rejected during import and need mapping or data cleanup.
            </p>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <FinanceTable>
              <FinanceTableHeader>
                <FinanceTableHead>Row</FinanceTableHead>
                <FinanceTableHead>Error</FinanceTableHead>
                <FinanceTableHead>Raw</FinanceTableHead>
              </FinanceTableHeader>
              <FinanceTableBody>
                {failedRows.map((row) => (
                  <FinanceTableRow key={`${row.rowNumber}-${row.error}`}>
                    <FinanceTableCell>{row.rowNumber}</FinanceTableCell>
                    <FinanceTableCell className="text-[var(--state-danger)]">{row.error}</FinanceTableCell>
                    <FinanceTableCell className="text-xs">
                      <pre className="whitespace-pre-wrap break-words text-[var(--text-muted)]">{JSON.stringify(row.raw)}</pre>
                    </FinanceTableCell>
                  </FinanceTableRow>
                ))}
              </FinanceTableBody>
            </FinanceTable>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Imported bank lines</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Review suggestions and finalize reconciliation for the lines in this import.
            </p>
          </div>
          <Badge
            variant={
              detail.status === "PROCESSED"
                ? "success"
                : detail.status === "FAILED"
                  ? "danger"
                  : "warning"
            }
          >
            {detail.status}
          </Badge>
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
                <FinanceTableEmpty colSpan={4} message="No transactions found for this import." />
              ) : (
                transactions.map((transaction) => (
                  <FinanceTableRow key={transaction.id}>
                    <FinanceTableCell variant="primary">
                      <div className="font-medium">
                        {new Date(transaction.txnDate).toLocaleDateString()} •{" "}
                        {transaction.reference ?? "No reference"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{transaction.description}</div>
                    </FinanceTableCell>
                    <FinanceTableCell align="right">
                      <span className="tabular-nums">
                        {transaction.direction === "CREDIT" ? "+" : "-"}
                        {transaction.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
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
