"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuoteAction, updateQuoteAction, sendQuoteAction, resolveQuoteAutofillAction } from "../actions";

interface Customer {
  id: string;
  name: string;
  email: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface QuoteAutofillPayload {
  customerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  termsAndConditions: string;
}

interface QuoteFormProps {
  customers: Customer[];
  initialAutofill?: QuoteAutofillPayload;
  existingQuote?: {
    id: string;
    customerId: string;
    title: string;
    issueDate: Date;
    validUntil: Date;
    currency: string;
    notes: string | null;
    termsAndConditions: string | null;
    discountAmount: number;
    lineItems: {
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }[];
  };
}

const emptyLineItem: LineItem = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function QuoteForm({ customers, initialAutofill, existingQuote }: QuoteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(
    existingQuote?.customerId ?? initialAutofill?.customerId ?? ""
  );
  const [title, setTitle] = useState(existingQuote?.title ?? "");
  const [issueDate, setIssueDate] = useState(
    existingQuote
      ? existingQuote.issueDate.toISOString().split("T")[0]
      : initialAutofill?.issueDate ?? new Date().toISOString().split("T")[0]
  );
  const [validUntil, setValidUntil] = useState(
    existingQuote
      ? existingQuote.validUntil.toISOString().split("T")[0]
      : initialAutofill?.validUntil ?? ""
  );
  const [notes, setNotes] = useState(existingQuote?.notes ?? initialAutofill?.notes ?? "");
  const [termsAndConditions, setTermsAndConditions] = useState(
    existingQuote?.termsAndConditions ?? initialAutofill?.termsAndConditions ?? ""
  );
  const [discountAmount, setDiscountAmount] = useState(existingQuote?.discountAmount ?? 0);
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existingQuote?.lineItems?.length
      ? existingQuote.lineItems
      : [{ ...emptyLineItem }]
  );

  const handleCustomerChange = async (newCustomerId: string) => {
    setCustomerId(newCustomerId);

    try {
      const result = await resolveQuoteAutofillAction({
        customerId: newCustomerId || undefined,
      });
      if (result.success && result.data) {
        const payload = result.data;
        setIssueDate(payload.issueDate);
        setValidUntil(payload.validUntil);
        setNotes(payload.notes);
        setTermsAndConditions(payload.termsAndConditions);
      }
    } catch (e) {
      console.error("Failed to fetch quote autofill:", e);
    }
  };

  function addLineItem() {
    setLineItems([...lineItems, { ...emptyLineItem }]);
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  }

  function getLineAmount(item: LineItem) {
    return item.quantity * item.unitPrice * (1 + item.taxRate / 100);
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.taxRate / 100), 0);
  const totalAmount = Math.max(subtotal + taxAmount - discountAmount, 0);

  function handleSubmit(sendAfterSave: boolean) {
    setError(null);

    if (!customerId) {
      setError("Please select a customer");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }
    if (lineItems.some((li) => !li.description.trim())) {
      setError("All line items must have a description");
      return;
    }

    const data = {
      customerId,
      title: title.trim(),
      issueDate,
      validUntil: validUntil || undefined,
      notes: notes || undefined,
      termsAndConditions: termsAndConditions || undefined,
      discountAmount,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        taxRate: Number(li.taxRate),
      })),
    };

    startTransition(async () => {
      let result;

      if (existingQuote) {
        result = await updateQuoteAction(existingQuote.id, data);
      } else {
        result = await createQuoteAction(data);
      }

      if (!result.success) {
        setError(result.error);
        return;
      }

      const quoteId = "id" in result.data ? result.data.id : existingQuote?.id;

      if (sendAfterSave && quoteId) {
        const sendResult = await sendQuoteAction(quoteId);
        if (!sendResult.success) {
          setError(sendResult.error);
          return;
        }
      }

      router.push(quoteId ? `/app/docs/quotes/${quoteId}` : "/app/docs/quotes");
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="h-1.5 bg-red-600" />

      <div className="p-8 space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">
          {existingQuote ? "Edit Quote" : "Create New Quote"}
        </h2>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Customer & Title */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer *</label>
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            >
              <option value="">Select a customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Website Redesign Proposal"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <p className="mt-1 text-xs text-slate-400">Leave empty to use org default validity days</p>
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-slate-700">Line Items *</label>
            <button
              type="button"
              onClick={addLineItem}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              + Add Item
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500 w-20">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500 w-28">Unit Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500 w-20">Tax %</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500 w-28">Amount</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, "description", e.target.value)}
                        placeholder="Item description"
                        className="w-full border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-full border-0 bg-transparent text-sm text-right text-slate-700 focus:outline-none focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="w-full border-0 bg-transparent text-sm text-right text-slate-700 focus:outline-none focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.taxRate}
                        onChange={(e) => updateLineItem(index, "taxRate", parseFloat(e.target.value) || 0)}
                        className="w-full border-0 bg-transparent text-sm text-right text-slate-700 focus:outline-none focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-slate-900">
                      {formatCurrency(getLineAmount(item))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Discount */}
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1">Discount Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
        </div>

        {/* Totals Preview */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tax</span>
              <span className="text-slate-700">{formatCurrency(taxAmount)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Discount</span>
                <span className="text-slate-700">−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="font-bold text-red-600">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes for the customer..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Terms & Conditions</label>
            <textarea
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
              rows={3}
              placeholder="Payment terms, conditions..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => router.push("/app/docs/quotes")}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleSubmit(false)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save as Draft"}
          </button>
          {!existingQuote && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving..." : "Save & Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
