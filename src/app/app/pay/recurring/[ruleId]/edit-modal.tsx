"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EditRecurringRuleModal({ 
  rule, 
  onClose 
}: { 
  rule: any; 
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      frequency: formData.get("frequency") as string,
      endDate: (formData.get("endDate") as string) || null,
      autoSend: formData.get("autoSend") === "on",
    };

    try {
      const { updateRecurringRule } = await import("../actions");
      const result = await updateRecurringRule(rule.id, payload);
      if (result.success) {
        router.refresh();
        onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="border-b border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Edit Recurring Rule</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Frequency */}
          <div className="space-y-1.5">
            <label htmlFor="frequency" className="block text-sm font-medium text-slate-700">
              Frequency
            </label>
            <select
              id="frequency"
              name="frequency"
              required
              defaultValue={rule.frequency}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700">
              End Date <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              defaultValue={rule.endDate ? new Date(rule.endDate).toISOString().split('T')[0] : ""}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          {/* Auto-Send */}
          <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-5 items-center">
              <input
                type="checkbox"
                id="autoSend"
                name="autoSend"
                defaultChecked={rule.autoSend}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
              />
            </div>
            <div>
              <label htmlFor="autoSend" className="text-sm font-medium text-slate-900">
                Automatically send invoice
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
