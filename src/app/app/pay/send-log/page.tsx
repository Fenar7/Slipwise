import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { listSendLog } from "./actions";
import { SendLogToolbar } from "@/components/pay/SendLogToolbar";
import { RetryForm } from "@/components/pay/RetryButton";

export const metadata: Metadata = { title: "Send Log | Slipwise" };

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT:    "bg-green-100 text-green-700",
  FAILED:  "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SendLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const status  = params.status;
  const search  = params.search;
  const page    = Number(params.page) || 1;

  const { records, totalPages, total } = await listSendLog({ status, page, search });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Send Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Audit trail of all invoice emails and SMS sends.
          </p>
        </div>

        {/* Toolbar: Search + Filters */}
        <div className="mb-4">
          <Suspense
            fallback={
              <div className="h-9 w-full max-w-sm rounded-lg bg-slate-100 animate-pulse" />
            }
          >
            <SendLogToolbar />
          </Suspense>
        </div>

        {/* Empty State */}
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg
                className="h-6 w-6 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900">
              {search ? "No matches found" : "No invoices sent yet"}
            </h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              {search
                ? "No send logs match your search. Try a different email or invoice number."
                : "When you email or SMS an invoice to a customer, the delivery status and audit trail will appear here."}
            </p>
            {!search && (
              <Link
                href="/app/pay/receivables"
                className="mt-6 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                View Receivables
              </Link>
            )}
          </div>
        ) : (
          /* Table */
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Recipient Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Scheduled At
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Sent At
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Fail Reason
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {record.invoice.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.recipientEmail}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(record.scheduledAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(record.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">
                      {record.failReason || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {record.status === "FAILED" && (
                        <RetryForm sendId={record.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={`/app/pay/send-log?page=${page - 1}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`}
                      className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Previous
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={`/app/pay/send-log?page=${page + 1}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`}
                      className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
