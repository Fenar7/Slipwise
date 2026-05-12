"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid, FormSection, FormActions, financeInputClassName } from "@/components/forms/form-primitives";
import { createManualJournal } from "../actions";

interface ManualJournalFormProps {
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    accountType: string;
    allowManualEntries: boolean;
    isActive: boolean;
  }>;
}

interface FormLine {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

function newLine(defaults?: Partial<FormLine>): FormLine {
  return {
    accountId: defaults?.accountId ?? "",
    description: defaults?.description ?? "",
    debit: defaults?.debit ?? 0,
    credit: defaults?.credit ?? 0,
  };
}

export function ManualJournalForm({ accounts }: ManualJournalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<FormLine[]>([
    newLine(),
    newLine(),
  ]);
  const [error, setError] = useState<string | null>(null);

  const availableAccounts = accounts.filter((account) => account.isActive && account.allowManualEntries);
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length > 2 ? current.filter((_, lineIndex) => lineIndex !== index) : current));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const result = await createManualJournal({
        entryDate,
        memo,
        lines,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/app/books/journals/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-card)]">
      {error && (
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      <FormGrid columns={2}>
        <FormField label="Entry date">
          <input
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Memo">
          <input
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Optional journal memo"
            className={financeInputClassName}
          />
        </FormField>
      </FormGrid>

      <FormSection title="Journal lines" description="Debits must equal credits for a balanced entry.">
        <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)]">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-left text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium text-right">Debit</th>
                <th className="px-4 py-2.5 font-medium text-right">Credit</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {lines.map((line, index) => (
                <tr key={`${index}-${line.accountId}`} className="hover:bg-[var(--surface-selected)] transition-colors">
                  <td className="px-4 py-3">
                    <select
                      value={line.accountId}
                      onChange={(event) => updateLine(index, { accountId: event.target.value })}
                      className={financeInputClassName}
                    >
                      <option value="">Select account</option>
                      {availableAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} — {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={line.description}
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                      placeholder="Line note"
                      className={financeInputClassName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      onChange={(event) =>
                        updateLine(index, {
                          debit: parseFloat(event.target.value) || 0,
                          credit: 0,
                        })
                      }
                      className={cn(financeInputClassName, "text-right")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      onChange={(event) =>
                        updateLine(index, {
                          credit: parseFloat(event.target.value) || 0,
                          debit: 0,
                        })
                      }
                      className={cn(financeInputClassName, "text-right")}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-sm text-[var(--state-danger)] hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormSection>

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          + Add line
        </Button>

        <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm">
          <div className="flex gap-6">
            <span className="text-[var(--text-secondary)]">
              Debit:{" "}
              <strong className="text-[var(--text-primary)] tabular-nums">{totalDebit.toFixed(2)}</strong>
            </span>
            <span className="text-[var(--text-secondary)]">
              Credit:{" "}
              <strong className="text-[var(--text-primary)] tabular-nums">{totalCredit.toFixed(2)}</strong>
            </span>
          </div>
          <div
            className={`mt-1 ${
              totalDebit === totalCredit ? "text-[var(--state-success)]" : "text-[var(--state-danger)]"
            }`}
          >
            {totalDebit === totalCredit ? "Balanced entry" : "Debits and credits must match"}
          </div>
        </div>
      </div>

      <FormActions>
        <Button variant="secondary" onClick={() => router.push("/app/books/journals")} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Posting..." : "Post Journal"}
        </Button>
      </FormActions>
    </div>
  );
}
