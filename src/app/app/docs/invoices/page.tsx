import { Suspense } from "react";
import Link from "next/link";
import { listInvoices, archiveInvoice, duplicateInvoice, getInvoice } from "./actions";
import type { InvoiceStatus } from "./actions";
import { CopyInvoiceLinkButton } from "./copy-link-button";
import { getSequenceConfig } from "@/features/sequences/services/sequence-admin";
import { requireOrgContext } from "@/lib/auth";
import { TagFilterChips } from "@/components/tags/tag-filter-chips";

export const metadata = {
  title: "Invoice Vault | Slipwise",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-700",
  VIEWED: "bg-purple-100 text-purple-700",
  DUE: "bg-yellow-100 text-yellow-700",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  DISPUTED: "bg-pink-100 text-pink-700",
  CANCELLED: "bg-slate-200 text-slate-500",
  REISSUED: "bg-indigo-100 text-indigo-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || "bg-slate-100 text-slate-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function formatTicketCategory(category: string) {
  return category.toLowerCase().replaceAll("_", " ");
}

function AttentionSummary({
  proofs,
  tickets,
}: {
  proofs?: Array<{ id: string }>;
  tickets?: Array<{ id: string; status: string; category: string }>;
}) {
  const pendingProofs = proofs ?? [];
  const activeTickets = tickets ?? [];

  if (pendingProofs.length === 0 && activeTickets.length === 0) {
    return <span className="text-sm text-slate-400">No open customer actions</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pendingProofs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {pendingProofs.length === 1 ? "1 payment proof awaiting review" : `${pendingProofs.length} proofs awaiting review`}
          </span>
        </div>
      )}
      {activeTickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {activeTickets.length === 1
              ? `1 active query: ${formatTicketCategory(activeTickets[0].category)}`
              : `${activeTickets.length} active customer queries`}
          </span>
        </div>
      )}
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getDueDateColor(dueDate: string | null, status: string): string {
  if (!dueDate) return "text-slate-500";
  if (status === "PAID") return "text-green-600";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0 && status !== "PAID") return "text-red-600 font-medium";
  if (diffDays <= 7) return "text-amber-600 font-medium";
  return "text-slate-500";
}

// ─── Invoice Table (List View) ──────────────────────────────────────────────────

async function InvoiceTable({
  status,
  search,
  page,
  dateFrom,
  dateTo,
  sequenceId,
  amountMin,
  amountMax,
  tagIds,
}: {
  status?: InvoiceStatus;
  search?: string;
  page: number;
  dateFrom?: string;
  dateTo?: string;
  sequenceId?: string;
  amountMin?: number;
  amountMax?: number;
  tagIds?: string[];
}) {
  const { invoices, total, totalPages } = await listInvoices({
    status, search, page, limit: 20,
    dateFrom, dateTo, sequenceId, amountMin, amountMax,
    tagIds,
  });

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No invoices found</h3>
        <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or create a new invoice.</p>
        <Link href="/app/docs/invoices/new" className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          Create Invoice
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Invoice #</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Due Date</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Activity</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/app/docs/invoices/${invoice.id}`} className="font-medium text-blue-600 hover:underline">
                  {invoice.invoiceNumber ?? "Draft"}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-slate-900">{invoice.customer?.name || "—"}</td>
              <td className="px-4 py-3 text-sm text-slate-500">{invoice.invoiceDate}</td>
              <td className={`px-4 py-3 text-sm ${getDueDateColor(invoice.dueDate, invoice.status)}`}>{invoice.dueDate || "—"}</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{formatCurrency(invoice.totalAmount)}</td>
              <td className="px-4 py-3"><StatusBadge status={invoice.status} /></td>
              <td className="px-4 py-3">
                <AttentionSummary proofs={invoice.proofs as Array<{ id: string }> | undefined} tickets={invoice.tickets as Array<{ id: string; status: string; category: string }> | undefined} />
              </td>
              <td className="px-4 py-3 text-right">
                <InvoiceActions invoiceId={invoice.id} status={invoice.status} token={(invoice.publicTokens as Array<{token: string}> | undefined)?.[0]?.token} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total}</p>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?${buildQuery({ status, search, page: page - 1, dateFrom, dateTo, sequenceId, amountMin, amountMax })}`} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Previous</Link>}
            {page < totalPages && <Link href={`?${buildQuery({ status, search, page: page + 1, dateFrom, dateTo, sequenceId, amountMin, amountMax })}`} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sequence Folder View ──────────────────────────────────────────────────────

async function InvoiceSequenceView({ search }: { search?: string }) {
  const { orgId } = await requireOrgContext();
  const sequence = await getSequenceConfig({ orgId, documentType: "INVOICE" });

  const { invoices: drafts } = await listInvoices({
    status: "DRAFT",
    search,
    limit: 100,
  });

  let sequenceInvoices: Awaited<ReturnType<typeof listInvoices>>["invoices"] = [];
  if (sequence?.sequenceId) {
    const result = await listInvoices({
      sequenceId: sequence.sequenceId,
      search,
      limit: 100,
    });
    sequenceInvoices = result.invoices;
  }

  if (drafts.length === 0 && sequenceInvoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No invoices yet</h3>
        <p className="mt-1 text-sm text-slate-500">Create your first invoice to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Drafts folder */}
      {drafts.length > 0 && <SequenceFolderCard label="Drafts" subtitle={`${drafts.length} unissued invoice${drafts.length !== 1 ? "s" : ""}, no number assigned yet`} icon="📝" defaultExpanded invoices={drafts} />}

      {/* Sequence folder */}
      {sequence?.sequenceId && sequenceInvoices.length > 0 && (
        <SequenceFolderCard
          label={sequence.name ?? "Invoice Sequence"}
          subtitle={sequence.formatString ? `${sequence.formatString} · ${sequenceInvoices.length} invoice${sequenceInvoices.length !== 1 ? "s" : ""}` : `${sequenceInvoices.length} invoice${sequenceInvoices.length !== 1 ? "s" : ""}`}
          icon="📁"
          defaultExpanded={drafts.length === 0}
          invoices={sequenceInvoices}
        />
      )}

      {/* Orphaned issued invoices (no sequence, but issued) */}
      {sequenceInvoices.length === 0 && drafts.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-400">
          No issued invoices with this sequence yet. Drafts are above.
        </div>
      )}
    </div>
  );
}

function SequenceFolderCard({
  label, subtitle, icon, defaultExpanded, invoices,
}: {
  label: string;
  subtitle: string;
  icon: string;
  defaultExpanded?: boolean;
  invoices: Awaited<ReturnType<typeof listInvoices>>["invoices"];
}) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white" open={defaultExpanded}>
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <span className="text-sm font-medium text-slate-900">{label}</span>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        <svg className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </summary>
      <div className="border-t border-slate-100 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Invoice #</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Customer</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Status</th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/app/docs/invoices/${inv.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {inv.invoiceNumber ?? "Draft"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">{inv.customer?.name || "—"}</td>
                <td className="px-4 py-2 text-sm text-slate-500">{inv.invoiceDate}</td>
                <td className="px-4 py-2 text-right text-sm font-medium text-slate-900">{formatCurrency(inv.totalAmount)}</td>
                <td className="px-4 py-2"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-2">
                  <Link href={`/app/docs/invoices/${inv.id}`} className="text-xs text-slate-400 hover:text-slate-600">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ─── Query Builder ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "" && val !== "undefined") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.join("&");
}

// ─── Filters ───────────────────────────────────────────────────────────────────

function StatusFilterChips({ currentStatus, extraParams }: { currentStatus?: string; extraParams?: Record<string, string | undefined> }) {
  const statuses = [
    { value: "", label: "All" },
    { value: "DRAFT", label: "Draft" },
    { value: "ISSUED", label: "Issued" },
    { value: "DUE", label: "Due" },
    { value: "OVERDUE", label: "Overdue" },
    { value: "PAID", label: "Paid" },
    { value: "PARTIALLY_PAID", label: "Partial" },
    { value: "DISPUTED", label: "Disputed" },
    { value: "REISSUED", label: "Reissued" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

  const base = extraParams ?? {};

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((s) => {
        const isActive = currentStatus === s.value || (!currentStatus && !s.value);
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(base)) {
          if (v !== undefined && v !== "") params.set(k, v);
        }
        if (s.value) params.set("status", s.value);
        const qs = params.toString();

        return (
          <Link
            key={s.value}
            href={`/app/docs/invoices${qs ? `?${qs}` : ""}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${isActive ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

function AdvancedFilters({
  current,
  extraParams,
  show,
  toggle,
}: {
  current: { dateFrom?: string; dateTo?: string; amountMin?: string; amountMax?: string; sequenceId?: string };
  extraParams?: Record<string, string | undefined>;
  show: boolean;
  toggle: string;
}) {
  const base = new URLSearchParams(extraParams as Record<string, string>);
  base.delete("dateFrom"); base.delete("dateTo"); base.delete("amountMin"); base.delete("amountMax"); base.delete("sequenceId");
  base.delete("filters");

  const activeCount = [current.dateFrom, current.dateTo, current.amountMin, current.amountMax, current.sequenceId].filter(Boolean).length;

  return (
    <>
      {/* Filter button */}
      <a
        href={show ? `?${base.toString()}` : `?${toggle}`}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          show ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
        Filters
        {activeCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{activeCount}</span>
        )}
      </a>

      {/* Filter panel */}
      {show && (
        <form method="GET" className="mt-3 rounded-lg border-2 border-red-200 bg-white p-4">
          {Array.from(base.entries()).filter(([, v]) => v !== "undefined" && v !== "").map(([k, v]) => (<input key={k} type="hidden" name={k} value={v} />))}
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date From</label>
              <input type="date" name="dateFrom" defaultValue={current.dateFrom || ""} className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date To</label>
              <input type="date" name="dateTo" defaultValue={current.dateTo || ""} className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount Min (₹)</label>
              <input type="number" name="amountMin" defaultValue={current.amountMin || ""} placeholder="0" className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount Max (₹)</label>
              <input type="number" name="amountMax" defaultValue={current.amountMax || ""} placeholder="∞" className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700">Apply</button>
            <a href={`?${base.toString()}`} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Reset</a>
          </div>
        </form>
      )}
    </>
  );
}

// ─── Actions ───────────────────────────────────────────────────────────────────

function InvoiceActions({ invoiceId, status, token }: { invoiceId: string; status: string; token?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={`/app/docs/invoices/${invoiceId}`} className="text-sm text-slate-600 hover:text-slate-900">Open</Link>
      {token && <CopyInvoiceLinkButton token={token} />}
      <form action={async () => { "use server"; await duplicateInvoice(invoiceId); }}>
        <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">Duplicate</button>
      </form>
      {status === "DRAFT" && (
        <form action={async () => { "use server"; await archiveInvoice(invoiceId); }}>
          <button type="submit" className="text-sm text-red-600 hover:text-red-800">Archive</button>
        </form>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string; view?: string; dateFrom?: string; dateTo?: string; amountMin?: string; amountMax?: string; sequenceId?: string; filters?: string; tagId?: string | string[] }>; 
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const status = params.status as InvoiceStatus | undefined;
  const view = params.view === "sequence" ? "sequence" : "list";
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const amountMin = params.amountMin ? parseFloat(params.amountMin) : undefined;
  const amountMax = params.amountMax ? parseFloat(params.amountMax) : undefined;
  const sequenceId = params.sequenceId;
  const tagIds = typeof params.tagId === "string" ? [params.tagId] : params.tagId || undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Invoice Vault</h1>
            <p className="mt-1 text-sm text-slate-500">Manage and track all your invoices</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app/settings/sequences/history" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Sequence History
            </Link>
            <Link href="/app/docs/invoices/new" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
              Create Invoice
            </Link>
          </div>
        </div>

        {/* Toolbar: tabs + search + filter button */}
        <div className="mb-4 flex items-center gap-3">
          {/* Tab bar */}
          <div className="flex items-center rounded-xl bg-white p-1 shadow-sm border border-slate-200">
            <Link
              href={`/app/docs/invoices?${buildQuery({ search: params.search || undefined })}`}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                view === "list"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              List
            </Link>
            <Link
              href={`/app/docs/invoices?${buildQuery({ view: "sequence", search: params.search || undefined })}`}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                view === "sequence"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
              Folders
            </Link>
          </div>

          {/* Search */}
          <form method="GET" className="relative flex-1 max-w-xs">
            {status && (status as string) !== "undefined" && <input type="hidden" name="status" value={status} />}
            {view !== "list" && <input type="hidden" name="view" value={view} />}
            {dateFrom && dateFrom !== "undefined" && <input type="hidden" name="dateFrom" value={dateFrom} />}
            {dateTo && dateTo !== "undefined" && <input type="hidden" name="dateTo" value={dateTo} />}
            {params.amountMin && params.amountMin !== "undefined" && <input type="hidden" name="amountMin" value={params.amountMin} />}
            {params.amountMax && params.amountMax !== "undefined" && <input type="hidden" name="amountMax" value={params.amountMax} />}
            <input
              type="text" name="search" defaultValue={params.search || ""} placeholder="Search invoices..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </form>

          {/* Filter button */}
          <AdvancedFilters
            current={{ dateFrom, dateTo, amountMin: params.amountMin, amountMax: params.amountMax, sequenceId }}
            extraParams={{ status: status || undefined, search: params.search || undefined, view }}
            show={params.filters === "open"}
            toggle={buildQuery({ status: status || undefined, search: params.search || undefined, view, filters: "open" })}
          />
        </div>

        {/* Filter panel renders inline via AdvancedFilters */}

        {/* Status filter chips (list view only) */}
        {view === "list" && (
          <div className="mb-4">
            <StatusFilterChips currentStatus={status} extraParams={{ view: params.view, search: params.search || undefined }} />
            <Suspense fallback={null}>
              <TagFilterChips />
            </Suspense>
          </div>
        )}

        {/* Content */}
        <Suspense fallback={<div className="py-8 text-center text-slate-500">Loading...</div>}>
          {view === "sequence" ? (
            <InvoiceSequenceView search={params.search} />
          ) : (
            <InvoiceTable status={status} search={params.search} page={page} dateFrom={dateFrom} dateTo={dateTo} sequenceId={sequenceId} amountMin={amountMin} amountMax={amountMax} tagIds={tagIds} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
