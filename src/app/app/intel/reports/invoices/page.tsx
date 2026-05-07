"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  getInvoiceReport,
  exportInvoiceReportCSV,
  type InvoiceReportRow,
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

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "VIEWED", label: "Viewed" },
  { value: "DUE", label: "Due" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "DISPUTED", label: "Disputed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const BASE_FILTER_FIELDS: FilterField[] = [
  {
    key: "status",
    label: "Status",
    type: "multi-select",
    options: STATUS_OPTIONS,
  },
  { key: "dateFrom", label: "From Date", type: "date" },
  { key: "dateTo", label: "To Date", type: "date" },
  {
    key: "customerId",
    label: "Customer ID",
    type: "text",
    placeholder: "Customer ID",
  },
  { key: "amountMin", label: "Min Amount", type: "number", placeholder: "0" },
  { key: "amountMax", label: "Max Amount", type: "number", placeholder: "∞" },
];

const BASE_COLUMNS: Column<InvoiceReportRow>[] = [
  { key: "invoiceNumber", label: "Invoice #", sortable: true },
  {
    key: "customerName",
    label: "Customer",
    render: (row) => row.customerName,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: "invoiceDate", label: "Issue Date", sortable: true },
  {
    key: "dueDate",
    label: "Due Date",
    sortable: true,
    render: (row) => row.dueDate ?? "—",
  },
  {
    key: "totalAmount",
    label: "Total Amount",
    sortable: true,
    render: (row) => formatCurrency(row.totalAmount),
  },
  {
    key: "amountPaid",
    label: "Amount Paid",
    render: (row) => formatCurrency(row.amountPaid),
  },
  {
    key: "balance",
    label: "Balance",
    render: (row) => (
      <span className={row.balance > 0 ? "text-red-600 font-medium" : ""}>
        {formatCurrency(row.balance)}
      </span>
    ),
  },
  {
    key: "tags",
    label: "Tags",
    render: (row) => (
      <span className="text-xs text-[var(--muted-foreground)]">{row.tags}</span>
    ),
  },
  {
    key: "actions",
    label: "",
    render: (row) => (
      <Link
        href={`/app/docs/invoices/${row.id}`}
        className="text-xs text-[var(--accent)] hover:underline"
      >
        View
      </Link>
    ),
  },
];

export default function InvoiceReportPage() {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<InvoiceReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<FilterValues>({});
  const [loaded, setLoaded] = useState(false);
  const [serverTotalAmount, setServerTotalAmount] = useState(0);
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
        const result = await getInvoiceReport({
          status: (f.status as string[])?.length ? (f.status as string[]) : undefined,
          dateFrom: f.dateFrom as string | undefined,
          dateTo: f.dateTo as string | undefined,
          customerId: f.customerId as string | undefined,
          amountMin: f.amountMin as number | undefined,
          amountMax: f.amountMax as number | undefined,
          tagIds: (f.tagIds as string[])?.length ? (f.tagIds as string[]) : undefined,
          page: p,
          sortKey: sk,
          sortDir: sd,
        });
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
        setServerTotalAmount(result.totalAmount ?? 0);
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

  const handlePageChange = (p: number) => {
    fetchData(filters, p, sortKey, sortDir);
  };

  const handleSort = (key: string, dir: "asc" | "desc") => {
    setSortKey(key);
    setSortDir(dir);
    fetchData(filters, 1, key, dir);
  };

  const handleExport = () => {
    startTransition(async () => {
      const csv = await exportInvoiceReportCSV({
        status: (filters.status as string[])?.length
          ? (filters.status as string[])
          : undefined,
        dateFrom: filters.dateFrom as string | undefined,
        dateTo: filters.dateTo as string | undefined,
        customerId: filters.customerId as string | undefined,
        amountMin: filters.amountMin as number | undefined,
        amountMax: filters.amountMax as number | undefined,
        tagIds: (filters.tagIds as string[])?.length ? (filters.tagIds as string[]) : undefined,
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  useEffect(() => {
    if (loaded) return;
    fetchData({}, 1);
  }, [fetchData, loaded]);

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
            Invoice Report
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

      <div className="mb-6">
        <ReportFilterBar
          fields={filterFields}
          values={filters}
          onApply={handleApply}
          onClear={handleClear}
        />
      </div>

      {loaded && (
        <div className="mb-4 flex gap-6">
          <div className="text-sm text-[var(--muted-foreground)]">
            Total Records: <span className="font-semibold text-[var(--foreground)]">{total}</span>
          </div>
          <div className="text-sm text-[var(--muted-foreground)]">
            Total Amount:{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {formatCurrency(serverTotalAmount)}
            </span>
          </div>
        </div>
      )}

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
