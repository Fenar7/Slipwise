import type { Metadata } from "next";
import { listSendLog } from "./actions";
import { SendLogToolbar } from "@/components/pay/SendLogToolbar";
import { RetryForm } from "@/components/pay/RetryButton";
import { MailX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Send Log | Slipwise" };

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status}
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
  const status = params.status;
  const search = params.search;
  const page = Number(params.page) || 1;

  const { records, totalPages } = await listSendLog({ status, page, search });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Suspense fallback={<div className="h-9 w-full bg-[var(--surface-soft)] rounded-md animate-pulse" />}>
        <SendLogToolbar />
      </Suspense>

      {/* Table */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4 text-slate-400">
            <MailX className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-1">
            {search ? "No matches found" : "No invoices sent yet"}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6">
            {search
              ? "We couldn't find any send logs matching your search criteria."
              : "When you email or SMS an invoice to a customer, the delivery status and audit trail will appear here."}
          </p>
          {!search && (
            <Link
              href="/app/pay/receivables"
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-[var(--accent)]/90"
            >
              View Receivables
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-strong)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-strong)] bg-[var(--surface-soft)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Invoice #</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Recipient Email</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Scheduled At</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Sent At</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Fail Reason</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-[var(--border-strong)] last:border-0 hover:bg-[var(--surface-soft)]/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {record.invoice.invoiceNumber}
                  </td>
                  <td className="px-4 py-3">{record.recipientEmail}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {formatDate(record.scheduledAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {formatDate(record.sentAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">
                    {record.failReason || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {record.status === "FAILED" && (
                      <RetryForm sendId={record.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Link
            href={`/app/pay/send-log?${status ? `status=${status}&` : ""}${search ? `search=${search}&` : ""}page=${Math.max(1, page - 1)}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--surface-soft)] text-[var(--muted-foreground)] hover:bg-[var(--border-strong)] ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`}
          >
            Prev
          </Link>
          <span className="text-xs text-[var(--muted-foreground)] font-medium">Page {page} of {totalPages}</span>
          <Link
            href={`/app/pay/send-log?${status ? `status=${status}&` : ""}${search ? `search=${search}&` : ""}page=${Math.min(totalPages, page + 1)}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--surface-soft)] text-[var(--muted-foreground)] hover:bg-[var(--border-strong)] ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
