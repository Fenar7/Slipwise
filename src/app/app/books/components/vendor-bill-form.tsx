"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid, FormSection, FormActions, financeInputClassName } from "@/components/forms/form-primitives";
import { createBooksVendorBill, updateBooksVendorBill } from "../actions";

interface VendorBillFormProps {
  vendorBillId?: string;
  vendors: Array<{ id: string; name: string; gstin: string | null }>;
  expenseAccounts: Array<{ id: string; code: string; name: string }>;
  defaultValues?: {
    vendorId?: string | null;
    expenseAccountId?: string | null;
    billDate: string;
    dueDate?: string | null;
    currency?: string | null;
    notes?: string | null;
    lines: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }>;
  };
}

type VendorBillDefaultValues = NonNullable<VendorBillFormProps["defaultValues"]>;

interface EditableLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

function toEditableLine(line?: VendorBillDefaultValues["lines"][number]): EditableLine {
  return {
    description: line?.description ?? "",
    quantity: String(line?.quantity ?? 1),
    unitPrice: String(line?.unitPrice ?? 0),
    taxRate: String(line?.taxRate ?? 0),
  };
}

export function VendorBillForm({
  vendorBillId,
  vendors,
  expenseAccounts,
  defaultValues,
}: VendorBillFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vendorId, setVendorId] = useState(defaultValues?.vendorId ?? "");
  const [expenseAccountId, setExpenseAccountId] = useState(defaultValues?.expenseAccountId ?? "");
  const [billDate, setBillDate] = useState(defaultValues?.billDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(defaultValues?.dueDate ?? "");
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "INR");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(
    defaultValues?.lines.length
      ? defaultValues.lines.map((line) => toEditableLine(line))
      : [toEditableLine()],
  );
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, field: keyof EditableLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, toEditableLine()]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)));
  }

  function submit() {
    setError(null);

    const normalizedLines = lines
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number.parseFloat(line.quantity || "0"),
        unitPrice: Number.parseFloat(line.unitPrice || "0"),
        taxRate: Number.parseFloat(line.taxRate || "0"),
      }))
      .filter((line) => line.description);

    if (normalizedLines.length === 0) {
      setError("Add at least one vendor bill line.");
      return;
    }

    startTransition(async () => {
      const payload = {
        vendorId: vendorId || null,
        expenseAccountId: expenseAccountId || null,
        billDate,
        dueDate: dueDate || null,
        currency: currency.trim().toUpperCase() || "INR",
        notes: notes.trim() || null,
        lines: normalizedLines.map((line) => ({
          description: line.description,
          quantity: Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1,
          unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
          taxRate: Number.isFinite(line.taxRate) ? line.taxRate : 0,
        })),
      };

      const result = vendorBillId
        ? await updateBooksVendorBill(vendorBillId, payload)
        : await createBooksVendorBill(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/app/books/vendor-bills/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      <FormGrid columns={2}>
        <FormField label="Vendor">
          <select
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
            className={financeInputClassName}
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
                {vendor.gstin ? ` • ${vendor.gstin}` : ""}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Expense account">
          <select
            value={expenseAccountId}
            onChange={(event) => setExpenseAccountId(event.target.value)}
            className={financeInputClassName}
          >
            <option value="">Select expense account</option>
            {expenseAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} — {account.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Bill date">
          <input
            type="date"
            value={billDate}
            onChange={(event) => setBillDate(event.target.value)}
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Due date">
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={financeInputClassName}
          />
        </FormField>

        <FormField label="Currency" className="md:col-span-2 xl:col-span-1">
          <input
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            className={cn(financeInputClassName, "uppercase")}
            maxLength={3}
          />
        </FormField>

        <FormField label="Notes" className="md:col-span-2">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className={financeInputClassName}
            placeholder="Optional context, bill reference, or payment instructions"
          />
        </FormField>
      </FormGrid>

      <FormSection
        title="Bill lines"
        description="Add line items for services, goods, or expenses."
      >
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={`vendor-bill-line-${index}`}
              className="grid gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4 md:grid-cols-[2fr_repeat(3,1fr)_auto]"
            >
              <FormField label="Description">
                <input
                  value={line.description}
                  onChange={(event) => updateLine(index, "description", event.target.value)}
                  className={financeInputClassName}
                  placeholder="Consulting, software, rent, utilities..."
                />
              </FormField>

              <FormField label="Qty">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, "quantity", event.target.value)}
                  className={cn(financeInputClassName, "text-right")}
                />
              </FormField>

              <FormField label="Unit price">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
                  className={cn(financeInputClassName, "text-right")}
                />
              </FormField>

              <FormField label="Tax %">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.taxRate}
                  onChange={(event) => updateLine(index, "taxRate", event.target.value)}
                  className={cn(financeInputClassName, "text-right")}
                />
              </FormField>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          Add line
        </Button>
      </FormSection>

      <FormActions>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? (vendorBillId ? "Saving..." : "Creating...") : vendorBillId ? "Save Bill" : "Create Bill"}
        </Button>
      </FormActions>
    </div>
  );
}
