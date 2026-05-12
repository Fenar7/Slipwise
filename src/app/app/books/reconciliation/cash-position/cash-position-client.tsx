"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableRow,
  FinanceTableCell,
} from "@/components/ui/finance-table";
import type { CashPositionSummary } from "../../actions";

interface CashPositionClientProps {
  data: CashPositionSummary;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CashPositionClient({ data }: CashPositionClientProps) {
  const variance = data.totalBankBalance - data.unreconciledCreditAmount;

  return (
    <div className="space-y-6">
      {/* ── Top-line summary ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Bank Balance" value={formatINR(data.totalBankBalance)} />
        <KpiCard
          label="Unreconciled Credits"
          value={formatINR(data.unreconciledCreditAmount)}
          trend={{ value: "Not yet matched to invoices", direction: "neutral" }}
        />
        <KpiCard label="This Month — In" value={formatINR(data.thisMonthCredits)} />
        <KpiCard label="This Month — Out" value={formatINR(data.thisMonthDebits)} />
      </div>

      {/* ── Receivables forecast ── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Overdue / Due in 7 Days"
          value={formatINR(data.invoicesDueIn7Days.totalAmount)}
          trend={{
            value: `${data.invoicesDueIn7Days.count} invoice${data.invoicesDueIn7Days.count !== 1 ? "s" : ""}`,
            direction: data.invoicesDueIn7Days.totalAmount > 0 ? "down" : "neutral",
          }}
        />
        <KpiCard
          label="Due in 30 Days"
          value={formatINR(data.invoicesDueIn30Days.totalAmount)}
          trend={{
            value: `${data.invoicesDueIn30Days.count} invoice${data.invoicesDueIn30Days.count !== 1 ? "s" : ""}`,
            direction: "neutral",
          }}
        />
      </div>

      {/* ── Per-account breakdown ── */}
      <Card>
        <CardHeader className="border-b border-[var(--border-soft)] pb-3 pt-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Account Balances</h2>
        </CardHeader>
        <CardContent className="p-0">
          {data.accounts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              No active bank accounts found.
            </p>
          ) : (
            <FinanceTable>
              <FinanceTableHeader>
                <FinanceTableHead>Account</FinanceTableHead>
                <FinanceTableHead>Bank</FinanceTableHead>
                <FinanceTableHead align="right">Balance</FinanceTableHead>
                <FinanceTableHead align="right">Last Import</FinanceTableHead>
              </FinanceTableHeader>
              <FinanceTableBody>
                {data.accounts.map((acc) => (
                  <FinanceTableRow key={acc.id}>
                    <FinanceTableCell variant="primary">{acc.name}</FinanceTableCell>
                    <FinanceTableCell>{acc.bankName ?? "—"}</FinanceTableCell>
                    <FinanceTableCell align="right" variant="numeric">
                      {acc.runningBalance !== null
                        ? formatINR(acc.runningBalance)
                        : formatINR(acc.openingBalance)}
                      {acc.runningBalance === null && (
                        <span className="ml-1 text-xs text-[var(--text-muted)]">(opening)</span>
                      )}
                    </FinanceTableCell>
                    <FinanceTableCell align="right" className="text-[var(--text-muted)]">
                      {formatDate(acc.lastTxnDate)}
                    </FinanceTableCell>
                  </FinanceTableRow>
                ))}
              </FinanceTableBody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-subtle)]">
                  <td className="px-5 py-3 font-semibold text-[var(--text-primary)]" colSpan={2}>
                    Total
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums">
                    {formatINR(data.totalBankBalance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </FinanceTable>
          )}
        </CardContent>
      </Card>

      {/* ── Net cash position note ── */}
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">Net available (estimated):</span>{" "}
        <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatINR(variance)}</span>
        <span className="ml-2 text-xs text-[var(--text-muted)]">
          (total bank balance minus unreconciled credits)
        </span>
      </div>
    </div>
  );
}
