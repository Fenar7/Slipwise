import { Suspense } from "react";
import Link from "next/link";
import { listVouchers, archiveVoucher, duplicateVoucher } from "./actions";
import { getSequenceConfig } from "@/features/sequences/services/sequence-admin";
import { requireOrgContext } from "@/lib/auth";
import { TagFilterChips } from "@/components/tags/tag-filter-chips";

export const metadata = {
  title: "Voucher Vault | Slipwise",
};

const TYPE_COLORS: Record<string, string> = {
  payment: "bg-red-100 text-red-700",
  receipt: "bg-green-100 text-green-700",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  released: "bg-green-100 text-green-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] || "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[type] || "bg-slate-100 text-slate-700"}`}>
      {type}
    </span>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(amount);
}

// ─── Query Builder ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// ─── Type Filter Chips ─────────────────────────────────────────────────────────

function TypeFilterChips({ currentType, extraParams }: { currentType?: string; extraParams?: Record<string, string | undefined> }) {
  const types = [{ value: "", label: "All" }, { value: "payment", label: "Payments" }, { value: "receipt", label: "Receipts" }];
  const base = extraParams ?? {};

  return (
    <div className="flex flex-wrap gap-2">
      {types.map((t) => {
        const isActive = currentType === t.value || (!currentType && !t.value);
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(base)) {
          if (v !== undefined && v !== "") params.set(k, v);
        }
        if (t.value) params.set("type", t.value);
        const qs = params.toString();
        return (
          <Link key={t.value} href={`/app/docs/vouchers${qs ? `?${qs}` : ""}`} className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${isActive ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Advanced Filters ──────────────────────────────────────────────────────────

function AdvancedFilters({
  current,
  extraParams,
  show,
  toggle,
}: {
  current: { dateFrom?: string; dateTo?: string; amountMin?: string; amountMax?: string };
  extraParams?: Record<string, string | undefined>;
  show: boolean;
  toggle: string;
}) {
  const base = new URLSearchParams(extraParams as Record<string, string>);
  base.delete("dateFrom"); base.delete("dateTo"); base.delete("amountMin"); base.delete("amountMax");
  base.delete("filters");

  const activeCount = [current.dateFrom, current.dateTo, current.amountMin, current.amountMax].filter(Boolean).length;

  return (
    <>
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

// ─── List View Table ───────────────────────────────────────────────────────────

async function VoucherTable({
  type, search, page, dateFrom, dateTo, amountMin, amountMax, tagIds,
}: {
  type?: "payment" | "receipt";
  search?: string;
  page: number;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  tagIds?: string[];
}) {
  const { vouchers, total, totalPages } = await listVouchers({ type, search, page, limit: 20, dateFrom, dateTo, amountMin, amountMax, tagIds });

  if (vouchers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No vouchers found</h3>
        <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or create a new voucher.</p>
        <Link href="/app/docs/vouchers/new" className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Create Voucher</Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Voucher #</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Vendor</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Type</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {vouchers.map((v) => (
            <tr key={v.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/app/docs/vouchers/${v.id}`} className="font-medium text-blue-600 hover:underline">{v.voucherNumber ?? "Draft"}</Link>
              </td>
              <td className="px-4 py-3 text-sm text-slate-900">{v.vendor?.name || "—"}</td>
              <td className="px-4 py-3 text-sm text-slate-500">{v.voucherDate}</td>
              <td className="px-4 py-3"><TypeBadge type={v.type} /></td>
              <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{formatCurrency(v.totalAmount)}</td>
              <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
              <td className="px-4 py-3 text-right">
                <VoucherActions voucherId={v.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total}</p>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?${buildQuery({ type, search, page: page - 1, dateFrom, dateTo, amountMin, amountMax })}`} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Previous</Link>}
            {page < totalPages && <Link href={`?${buildQuery({ type, search, page: page + 1, dateFrom, dateTo, amountMin, amountMax })}`} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sequence Folder View ──────────────────────────────────────────────────────

async function VoucherSequenceView({ type, search }: { type?: "payment" | "receipt"; search?: string }) {
  const { orgId } = await requireOrgContext();
  const sequence = await getSequenceConfig({ orgId, documentType: "VOUCHER" });

  const { vouchers: drafts } = await listVouchers({ type, status: "draft", search, limit: 100 });
  const { vouchers: approved } = await listVouchers({ type, status: "approved", search, limit: 100 });
  const { vouchers: released } = await listVouchers({ type, status: "released", search, limit: 100 });

  let sequenceVouchers: Awaited<ReturnType<typeof listVouchers>>["vouchers"] = [];
  if (sequence?.sequenceId) {
    const result = await listVouchers({ type, sequenceId: sequence.sequenceId, search, limit: 100 });
    sequenceVouchers = result.vouchers;
  }

  const all = [...drafts, ...approved, ...released];
  const uniqueIds = new Set(all.map((v) => v.id));
  const allVouchers = all.filter((v) => uniqueIds.has(v.id));

  if (allVouchers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <h3 className="text-lg font-medium text-slate-900">No vouchers yet</h3>
        <p className="mt-1 text-sm text-slate-500">Create your first voucher to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.length > 0 && (
        <VoucherFolderCard label="Drafts" subtitle={`${drafts.length} voucher${drafts.length !== 1 ? "s" : ""}, not yet approved`} icon="📝" defaultExpanded vouchers={drafts} />
      )}
      {approved.length > 0 && (
        <VoucherFolderCard label="Approved" subtitle={`${approved.length} approved voucher${approved.length !== 1 ? "s" : ""}`} icon="✅" vouchers={approved} />
      )}
      {released.length > 0 && (
        <VoucherFolderCard label="Released" subtitle={`${released.length} released voucher${released.length !== 1 ? "s" : ""}`} icon="📤" vouchers={released} />
      )}
      {allVouchers.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-400">No vouchers match the current filters.</div>
      )}
    </div>
  );
}

function VoucherFolderCard({
  label, subtitle, icon, defaultExpanded, vouchers,
}: {
  label: string; subtitle: string; icon: string; defaultExpanded?: boolean;
  vouchers: Awaited<ReturnType<typeof listVouchers>>["vouchers"];
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
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Voucher #</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Vendor</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Type</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Amount</th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {vouchers.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/app/docs/vouchers/${v.id}`} className="text-sm font-medium text-blue-600 hover:underline">{v.voucherNumber ?? "Draft"}</Link>
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">{v.vendor?.name || "—"}</td>
                <td className="px-4 py-2 text-sm text-slate-500">{v.voucherDate}</td>
                <td className="px-4 py-2"><TypeBadge type={v.type} /></td>
                <td className="px-4 py-2 text-right text-sm font-medium text-slate-900">{formatCurrency(v.totalAmount)}</td>
                <td className="px-4 py-2">
                  <Link href={`/app/docs/vouchers/${v.id}`} className="text-xs text-slate-400 hover:text-slate-600">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ─── Actions ───────────────────────────────────────────────────────────────────

function VoucherActions({ voucherId }: { voucherId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={`/app/docs/vouchers/${voucherId}`} className="text-sm text-slate-600 hover:text-slate-900">Open</Link>
      <form action={async () => { "use server"; await duplicateVoucher(voucherId); }}>
        <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">Duplicate</button>
      </form>
      <form action={async () => { "use server"; await archiveVoucher(voucherId); }}>
        <button type="submit" className="text-sm text-red-600 hover:text-red-800">Archive</button>
      </form>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string; page?: string; view?: string; dateFrom?: string; dateTo?: string; amountMin?: string; amountMax?: string; filters?: string; tagId?: string | string[] }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const type = params.type as "payment" | "receipt" | undefined;
  const view = params.view === "sequence" ? "sequence" : "list";
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const amountMin = params.amountMin ? parseFloat(params.amountMin) : undefined;
  const amountMax = params.amountMax ? parseFloat(params.amountMax) : undefined;
  const tagIds = typeof params.tagId === "string" ? [params.tagId] : params.tagId || undefined;

  const extraParams: Record<string, string | undefined> = { view };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Voucher Vault</h1>
            <p className="mt-1 text-sm text-slate-500">Manage payment and receipt vouchers</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app/settings/sequences/history" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Sequence History
            </Link>
            <Link href="/app/docs/vouchers/new" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700">
              Create Voucher
            </Link>
          </div>
        </div>

        {/* Toolbar: tabs + search + filter button */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-white p-1 shadow-sm border border-slate-200">
            <Link
              href={`/app/docs/vouchers?${buildQuery({ search: params.search || undefined })}`}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                view === "list" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              List
            </Link>
            <Link
              href={`/app/docs/vouchers?${buildQuery({ view: "sequence", search: params.search || undefined })}`}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                view === "sequence" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
              Folders
            </Link>
          </div>

          <form method="GET" className="relative flex-1 max-w-xs">
            {type && <input type="hidden" name="type" value={type} />}
            {view !== "list" && <input type="hidden" name="view" value={view} />}
            {dateFrom && dateFrom !== "undefined" && <input type="hidden" name="dateFrom" value={dateFrom} />}
            {dateTo && dateTo !== "undefined" && <input type="hidden" name="dateTo" value={dateTo} />}
            {params.amountMin && params.amountMin !== "undefined" && <input type="hidden" name="amountMin" value={params.amountMin} />}
            {params.amountMax && params.amountMax !== "undefined" && <input type="hidden" name="amountMax" value={params.amountMax} />}
            <input type="text" name="search" defaultValue={params.search || ""} placeholder="Search vouchers..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-700 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </form>

          <AdvancedFilters
            current={{ dateFrom, dateTo, amountMin: params.amountMin, amountMax: params.amountMax }}
            extraParams={{ type: params.type || undefined, search: params.search || undefined, view }}
            show={params.filters === "open"}
            toggle={buildQuery({ type: params.type || undefined, search: params.search || undefined, view, filters: "open" })}
          />
        </div>

        {/* Type filter chips (list view only) */}
        {view === "list" && (
          <div className="mb-4">
            <TypeFilterChips currentType={type} extraParams={{ search: params.search, view }} />
            <Suspense fallback={null}>
              <TagFilterChips />
            </Suspense>
          </div>
        )}

        {/* Content */}
        <Suspense fallback={<div className="py-8 text-center text-slate-500">Loading...</div>}>
          {view === "sequence" ? (
            <VoucherSequenceView type={type} search={params.search} />
          ) : (
            <VoucherTable type={type} search={params.search} page={page} dateFrom={dateFrom} dateTo={dateTo} amountMin={amountMin} amountMax={amountMax} tagIds={tagIds} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
