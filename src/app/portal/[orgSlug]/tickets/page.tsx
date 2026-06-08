import type { Metadata } from "next";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { listPortalTickets } from "./actions";

export const metadata: Metadata = {
  title: "Support Tickets | Customer Portal",
};

interface PageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function PortalTicketsPage({
  params,
  searchParams,
}: PageProps) {
  const { orgSlug } = await params;
  const { page: pageStr, status } = await searchParams;
  const page = parseInt(pageStr ?? "1", 10);

  const result = await listPortalTickets({ page, status, orgSlug });

  if (!result.success) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-red-700">
        <p>Error: {result.error}</p>
      </div>
    );
  }

  const { tickets, total } = result.data;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
          <p className="mt-1 text-sm text-slate-500">
            View and manage your support requests related to invoices.
          </p>
        </div>
      </div>

      {/* Filters (Simple) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { label: "All", value: "" },
          { label: "Open", value: "OPEN" },
          { label: "In Progress", value: "IN_PROGRESS" },
          { label: "Resolved", value: "RESOLVED" },
          { label: "Closed", value: "CLOSED" },
        ].map((f) => (
          <Link
            key={f.label}
            href={`/portal/${orgSlug}/tickets?status=${f.value}`}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              (status ?? "") === f.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Ticket List */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {tickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No tickets found</h3>
            <p className="mt-1 text-sm text-slate-500">
              When you raise an issue with an invoice, it will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/portal/${orgSlug}/tickets/${ticket.id}`}
                className="group flex flex-col gap-3 p-5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      {ticket.category.toLowerCase().replace("_", " ")}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-500">
                      Invoice {ticket.invoiceNumber}
                    </span>
                  </div>
                  <h4 className="mt-1 truncate text-base font-semibold text-slate-900 group-hover:text-blue-600">
                    {ticket.description}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      Opened {formatRelativeTime(ticket.createdAt)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Last active {formatRelativeTime(ticket.lastActivityAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <StatusBadge status={ticket.status} />
                  <svg className="hidden h-5 w-5 text-slate-300 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/portal/${orgSlug}/tickets?page=${page - 1}${status ? `&status=${status}` : ""}`}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/portal/${orgSlug}/tickets?page=${page + 1}${status ? `&status=${status}` : ""}`}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-emerald-50 text-emerald-700 border-emerald-100",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
    RESOLVED: "bg-slate-50 text-slate-600 border-slate-200",
    CLOSED: "bg-slate-50 text-slate-500 border-slate-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
