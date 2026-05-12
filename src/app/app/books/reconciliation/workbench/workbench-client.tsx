"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  confirmBooksReconciliationMatch,
  rejectBooksReconciliationMatch,
  getSuggestedMatchesAction,
} from "../../actions";
import type { EnrichedMatch } from "@/lib/bank/reconciliation-engine";

interface BankTxn {
  id: string;
  txnDate: Date | string;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  description: string;
  reference: string | null;
  normalizedPayee: string | null;
  status: string;
  bankAccount: { id: string; name: string } | null;
  matches: Array<{
    id: string;
    entityType: string;
    entityId: string;
    matchedAmount: number;
    confidenceScore: number | null;
    status: string;
  }>;
}

interface WorkbenchClientProps {
  transactions: BankTxn[];
}

function confidenceBadge(score: number | null) {
  if (score === null) return null;
  if (score >= 95) return <Badge variant="success">{score}% Auto</Badge>;
  if (score >= 70) return <Badge variant="default">{score}%</Badge>;
  return <Badge variant="warning">{score}%</Badge>;
}

function formatCurrency(amount: number, direction: string): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
  return direction === "CREDIT" ? `+${formatted}` : `-${formatted}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MatchRow({
  match,
  onConfirm,
  onReject,
}: {
  match: EnrichedMatch;
  onConfirm: (matchId: string) => void;
  onReject: (matchId: string) => void;
}) {
  const isConfirmed = match.status === "CONFIRMED";

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--text-primary)]">{match.label}</span>
          {match.subLabel && (
            <span className="text-[var(--text-muted)]">· {match.subLabel}</span>
          )}
          {confidenceBadge(match.confidenceScore)}
        </div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">
          {match.entityType.replace(/_/g, " ")}
          {match.documentDate ? ` · ${formatDate(match.documentDate)}` : ""}
          {" · "}
          <span className="font-mono tabular-nums">
            {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
              match.matchedAmount,
            )}
          </span>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 gap-2">
        {isConfirmed ? (
          <span className="rounded-full bg-[var(--state-success-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--state-success)]">
            Confirmed
          </span>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => onConfirm(match.matchId)}
              className="h-7 px-2 text-xs"
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              onClick={() => onReject(match.matchId)}
              className="h-7 px-2 text-xs text-[var(--text-muted)]"
            >
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TxnCard({
  txn,
  onRefresh,
}: {
  txn: BankTxn;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [enrichedMatches, setEnrichedMatches] = useState<EnrichedMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExpand() {
    setExpanded((prev) => {
      const next = !prev;
      if (next && enrichedMatches === null) {
        startTransition(async () => {
          const result = await getSuggestedMatchesAction(txn.id);
          if (result.success) {
            setEnrichedMatches(result.data);
          }
        });
      }
      return next;
    });
  }

  function handleConfirm(matchId: string) {
    const reason = window.prompt("Optional reconciliation note for the audit trail", "") ?? "";

    startTransition(async () => {
      const result = await confirmBooksReconciliationMatch({
        bankTransactionId: txn.id,
        matchId,
        reason: reason.trim() || undefined,
      });
      if (result.success) {
        toast.success("Match confirmed");
        onRefresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleReject(matchId: string) {
    startTransition(async () => {
      const result = await rejectBooksReconciliationMatch({
        bankTransactionId: txn.id,
        matchId,
      });
      if (result.success) {
        toast.success("Match rejected");
        setEnrichedMatches((prev) =>
          prev ? prev.filter((m) => m.matchId !== matchId) : prev,
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  const matchCount = txn.matches.length;

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--border-default)]">
      <button
        type="button"
        onClick={handleExpand}
        disabled={isPending}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold tabular-nums ${
                txn.direction === "CREDIT" ? "text-[var(--state-success)]" : "text-[var(--state-danger)]"
              }`}
            >
              {formatCurrency(txn.amount, txn.direction)}
            </span>
            <span className="text-sm text-[var(--text-muted)]">{formatDate(txn.txnDate)}</span>
            <Badge variant={txn.status === "SUGGESTED" ? "default" : "warning"}>
              {txn.status}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
            {txn.normalizedPayee ?? txn.description}
          </p>
          {txn.reference && (
            <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{txn.reference}</p>
          )}
          {txn.bankAccount && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{txn.bankAccount.name}</p>
          )}
        </div>
        <div className="shrink-0 text-sm text-[var(--text-muted)]">
          {matchCount > 0 ? `${matchCount} match${matchCount > 1 ? "es" : ""}` : "No matches"}{" "}
          {expanded ? "▲" : "▼"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-soft)] px-4 pb-4 pt-3">
          {isPending && !enrichedMatches ? (
            <p className="text-sm text-[var(--text-muted)]">Loading matches…</p>
          ) : enrichedMatches && enrichedMatches.length > 0 ? (
            <div className="space-y-2">
              {enrichedMatches.map((m) => (
                <MatchRow
                  key={m.matchId}
                  match={m}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No suggested matches. Use the main reconciliation page to manually match.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkbenchClient({ transactions }: WorkbenchClientProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-base font-medium text-[var(--text-primary)]">All transactions are reconciled</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Import a bank statement to begin reconciliation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div key={refreshKey} className="space-y-3">
      {transactions.map((txn) => (
        <TxnCard key={txn.id} txn={txn} onRefresh={handleRefresh} />
      ))}
    </div>
  );
}
