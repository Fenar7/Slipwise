"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Invoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
}

export function RecurringRuleForm({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      baseInvoiceId: formData.get("baseInvoiceId") as string,
      frequency: formData.get("frequency") as string,
      startDate: formData.get("startDate") as string,
      endDate: (formData.get("endDate") as string) || undefined,
      autoSend: formData.get("autoSend") === "on",
    };

    try {
      const { createRecurringRule } = await import("../actions");
      const result = await createRecurringRule(payload);
      if (result.success) {
        router.push("/app/pay/recurring");
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Base Invoice */}
        <div className="space-y-1.5">
          <label
            htmlFor="baseInvoiceId"
            className="block text-sm font-medium text-slate-700"
          >
            Base Invoice
          </label>
          <select
            id="baseInvoiceId"
            name="baseInvoiceId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <option value="" disabled>Select an invoice…</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} — ₹{inv.totalAmount.toLocaleString("en-IN")}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            This invoice's line items and customer details will be duplicated each time the rule runs.
          </p>
        </div>

        {/* Frequency */}
        <div className="space-y-1.5">
          <label
            htmlFor="frequency"
            className="block text-sm font-medium text-slate-700"
          >
            Frequency
          </label>
          <select
            id="frequency"
            name="frequency"
            required
            defaultValue="MONTHLY"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-slate-700"
            >
              First Run Date
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-slate-700"
            >
              End Date <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Auto-Send */}
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-5 items-center">
            <input
              type="checkbox"
              id="autoSend"
              name="autoSend"
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
            />
          </div>
          <div>
            <label htmlFor="autoSend" className="text-sm font-medium text-slate-900">
              Automatically send invoice
            </label>
            <p className="text-xs text-slate-500">
              If enabled, Slipwise will automatically email the newly generated invoice to the customer based on their default contacts.
            </p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Rule"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/app/pay/recurring")}
            className="inline-flex justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
