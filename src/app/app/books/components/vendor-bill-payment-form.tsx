"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid, FormActions, financeInputClassName } from "@/components/forms/form-primitives";
import { recordBooksVendorBillPayment } from "../actions";

interface VendorBillPaymentFormProps {
  vendorBillId: string;
  maxAmount: number;
}

export function VendorBillPaymentForm({ vendorBillId, maxAmount }: VendorBillPaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const parsedAmount = Number.parseFloat(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    startTransition(async () => {
      const result = await recordBooksVendorBillPayment({
        vendorBillId,
        amount: parsedAmount,
        paidAt: paidAt || undefined,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setMethod("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4 shadow-[var(--shadow-card)]">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Record payment</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Outstanding balance{" "}
          <span className="font-medium text-[var(--text-primary)] tabular-nums">
            {maxAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      <FormGrid columns={2}>
        <FormField label="Amount">
          <input
            type="number"
            min="0"
            max={maxAmount}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={cn(financeInputClassName, "text-right")}
          />
        </FormField>

        <FormField label="Paid at">
          <input
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Method">
          <input
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            placeholder="Bank transfer, cheque, UPI..."
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Note">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional bank reference"
            className={financeInputClassName}
          />
        </FormField>
      </FormGrid>

      <FormActions>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Recording..." : "Record Payment"}
        </Button>
      </FormActions>
    </div>
  );
}
