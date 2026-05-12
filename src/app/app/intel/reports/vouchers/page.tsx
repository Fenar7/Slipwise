"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  getVoucherReport,
  exportVoucherReportCSV,
  type VoucherReportRow,
} from "./actions";
import {
  ReportFilterBar,
  type FilterField,
  type FilterValues,
} from "@/features/intel/components/report-filter-bar";
import {
  ReportDataTable,
  StatusBadge,
  formatCurrency,
  type Column,
} from "@/features/intel/components/report-data-table";
import { listTags } from "@/lib/tags/tag-service";

const BASE_FILTER_FIELDS: FilterField[] = [
  {
    key: "type",
    label: "Type",
    type: "select",
    options: [
      { value: "payment", label: "Payment" },
      { value: "receipt", label: "Receipt" },
    ],
  },
  { key: "dateFrom", label: "From Date", type: "date" },
  { key: "dateTo", label: "To Date", type: "date" },
  {
    key: "category",
    label: "Category",
    type: "text",
    placeholder: "Search category",
  },
];

const BASE_COLUMNS: Column<VoucherReportRow>[] = [
  { key: "voucherNumber", label: "Voucher #", sortable: true },
  {
    key: "type",
    label: "Type",
    sortable: true,
    render: (row) => <StatusBadge status={row.type} />,
  },
  { key: "voucherDate", label: "Date", sortable: true },
  { key: "vendorName", label: "Paid To / Received From" },
  { key: "category", label: "Category" },
  {
    key: "totalAmount",
    label: "Total Amount",
    sortable: true,
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "tags",
    label: "Tags",
    render: (row) => (
      <span className="text-xs text-[var(--muted-foreground)]">{row.tags}</span>
    ),
  },
];

export default function VoucherReportPage() {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<VoucherReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<FilterValues>({});
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState({
    payments: 0,
    paymentCount: 0,
    receipts: 0,
    receiptCount: 0,
  });
  const [tagOptions, setTagOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    listTags({ includeArchived: false }).then((result) => {
      if (result.success && result.data) {
        setTagOptions(
          result.data.map((t) => ({ value: t.id, label: t.name }))
        );
      }
    });
  }, []);

  const filterFields = useMemo<FilterField[]>(() => {
    if (tagOptions.length > 0) {
      return [
        ...BASE_FILTER_FIELDS,
        {
          key: "tagIds",
          label: "Tags",
          type: "multi-select",
          options: tagOptions,
          placeholder: "All tags",
        },
      ];
    }
    return BASE_FILTER_FIELDS;
  }, [tagOptions]);

  const fetchData = useCallback(
    (f: FilterValues, p: number, sk?: string, sd?: "asc" | "desc") => {
      startTransition(async () => {
        const result = await getVoucherReport({
          type: f.type as string | undefined,
          dateFrom: f.dateFrom as string | undefined,
          dateTo: f.dateTo as string | undefined,
          category: f.category as string | undefined,
          tagIds: (f.tagIds as string[])?.length ? (f.tagIds as string[]) : undefined,
          page: p,
          sortKey: sk,
          sortDir: sd,
        });
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
        setSummary({
          payments: result.summaryPayments,
          paymentCount: result.summaryPaymentCount,
          receipts: result.summaryReceipts,
          receiptCount: result.summaryReceiptCount,
        });
        setLoaded(true);
      });
    },
    []
  );

  const handleApply = (v: FilterValues) => {
    setFilters(v);
    fetchData(v, 1, sortKey, sortDir);
  };

  const handleClear = () => {
    const cleared: FilterValues = {};
    setFilters(cleared);
    fetchData(cleared, 1, undefined, "asc");
    setSortKey(undefined);
  };

  const handlePageChange = (p: number) => fetchData(filters, p, sortKey, sortDir);

  const handleSort = (key: string, dir: "asc" | "desc") => {
    setSortKey(key);
    setSortDir(dir);
    fetchData(filters, 1, key, dir);
  };

  const handleExport = () => {
    startTransition(async () => {
      const csv = await exportVoucherReportCSV({
        type: filters.type as string | undefined,
        dateFrom: filters.dateFrom as string | undefined,
        dateTo: filters.dateTo as string | undefined,
        category: filters.category as string | undefined,
        tagIds: (filters.tagIds as string[])?.length ? (filters.tagIds as string[]) : undefined,
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voucher-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    if (loaded) return;
    fetchData({}, 1);
  }, [fetchData, loaded]);

  const net = summary.receipts - summary.payments;

  return (
    <div className="min-h-screen">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/app/intel/reports"
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ← Back to Reports
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Voucher Report
          </h1>
        </div>
        <button
          onClick={handleExport}
          disabled={isPending || rows.length === 0}
          className="h-9 rounded-lg border border-[var(--border-soft)] px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors"
        >
          Export CSV
        </button>
      </header>

      {/* Summary strip */}
      {loaded && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-red-600">
              Total Payments
            </p>
            <p className="mt-1 text-xl font-bold text-red-700">
              {formatCurrency(summary.payments)}
            </p>
            <p className="text-xs text-red-500">
              {summary.paymentCount} voucher{summary.paymentCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">
              Total Receipts
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-700">
              {formatCurrency(summary.receipts)}
            </p>
            <p className="text-xs text-emerald-500">
              {summary.receiptCount} voucher{summary.receiptCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Net
            </p>
            <p
              className={`mt-1 text-xl font-bold ${
                net >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {net >= 0 ? "+" : ""}
              {formatCurrency(net)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Receipts − Payments
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <ReportFilterBar
          fields={filterFields}
          values={filters}
          onApply={handleApply}
          onClear={handleClear}
        />
      </div>

      {isPending && !loaded ? (
        <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
          Loading…
        </div>
      ) : (
        <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          <ReportDataTable
            columns={BASE_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onSort={handleSort}
            sortKey={sortKey}
            sortDir={sortDir}
          />
        </div>
      )}
    </div>
  );
}
