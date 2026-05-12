"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid, FormSection, FormActions, financeInputClassName } from "@/components/forms/form-primitives";
import { createBooksPaymentRun } from "../actions";

interface CreatePaymentRunFormProps {
  bills: Array<{
    id: string;
    billNumber: string;
    dueDate: string | null;
    remainingAmount: number;
    vendorName: string | null;
    status: string;
  }>;
}

export function CreatePaymentRunForm({ bills }: CreatePaymentRunFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [selectedBills, setSelectedBills] = useState<Record<string, { checked: boolean; amount: string }>>(
    Object.fromEntries(
      bills.map((bill) => [
        bill.id,
        {
          checked: false,
          amount: bill.remainingAmount.toFixed(2),
        },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => Object.values(selectedBills).filter((item) => item.checked).length,
    [selectedBills],
  );

  function toggleBill(billId: string, checked: boolean) {
    setSelectedBills((current) => ({
      ...current,
      [billId]: {
        ...current[billId],
        checked,
      },
    }));
  }

  function updateAmount(billId: string, amount: string) {
    setSelectedBills((current) => ({
      ...current,
      [billId]: {
        ...current[billId],
        amount,
      },
    }));
  }

  function submit() {
    setError(null);

    const items = bills
      .filter((bill) => selectedBills[bill.id]?.checked)
      .map((bill) => ({
        vendorBillId: bill.id,
        amount: Number.parseFloat(selectedBills[bill.id]?.amount ?? String(bill.remainingAmount)),
      }));

    if (items.length === 0) {
      setError("Select at least one bill for the payment run.");
      return;
    }

    if (items.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
      setError("Each selected bill needs a valid payment amount.");
      return;
    }

    startTransition(async () => {
      const result = await createBooksPaymentRun({
        scheduledDate,
        notes: notes.trim() || undefined,
        items,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/app/books/payment-runs/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Create payment run</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Select approved or overdue bills, set payout amounts, and generate a batch ready for approval.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      <FormGrid columns={2}>
        <FormField label="Scheduled date">
          <input
            type="date"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Notes">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional payout instructions"
            className={financeInputClassName}
          />
        </FormField>
      </FormGrid>

      <FormSection
        title="Eligible bills"
        description={`${selectedCount} of ${bills.length} selected`}
      >
        <div className="space-y-3">
          {bills.length === 0 ? (
            <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
              No approved or overdue vendor bills are ready for payment.
            </div>
          ) : (
            bills.map((bill) => (
              <div
                key={bill.id}
                className="grid gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4 md:grid-cols-[auto_1.6fr_1fr_1fr]"
              >
                <label className="flex items-start gap-3 pt-1">
                  <input
                    type="checkbox"
                    checked={selectedBills[bill.id]?.checked ?? false}
                    onChange={(event) => toggleBill(bill.id, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[var(--border-default)]"
                  />
                  <span className="sr-only">Select {bill.billNumber}</span>
                </label>

                <div>
                  <p className="font-medium text-[var(--text-primary)]">{bill.billNumber}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {bill.vendorName ?? "Unassigned vendor"} • {bill.status.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] tabular-nums">
                    Due {bill.dueDate ?? "Not set"} • Remaining{" "}
                    {bill.remainingAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>

                <FormField label="Payout amount">
                  <input
                    type="number"
                    min="0"
                    max={bill.remainingAmount}
                    step="0.01"
                    value={selectedBills[bill.id]?.amount ?? bill.remainingAmount.toFixed(2)}
                    onChange={(event) => updateAmount(bill.id, event.target.value)}
                    className={cn(financeInputClassName, "text-right")}
                  />
                </FormField>

                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="mb-1 block font-medium text-[var(--text-primary)]">Remaining</span>
                  <span className="tabular-nums">
                    {bill.remainingAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </FormSection>

      <FormActions>
        <Button type="button" onClick={submit} disabled={isPending || bills.length === 0}>
          {isPending ? "Creating..." : "Create Payment Run"}
        </Button>
      </FormActions>
    </div>
  );
}
