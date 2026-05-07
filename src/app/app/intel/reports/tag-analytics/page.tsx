"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import {
  ChartContainer,
  chartColors,
  axisProps,
  yAxisProps,
  gridProps,
  legendProps,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
} from "@/components/charts/chart-theme";
import {
  getTagAnalytics,
  type AnalyticsMode,
  type TagSummary,
  type MonthlyTrendPoint,
} from "./actions";
import {
  ReportDataTable,
  formatCurrency,
  type Column,
} from "@/features/intel/components/report-data-table";

const MODE_OPTIONS: { value: AnalyticsMode; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
  { value: "combined", label: "Combined" },
];

function formatChartCurrency(value: number): string {
  if (value >= 10_00_000) return `₹${(value / 10_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={tooltipLabelStyle}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ ...tooltipItemStyle, color: entry.color }}>
          {entry.name}: ₹{entry.value.toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

export default function TagAnalyticsPage() {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<AnalyticsMode>("combined");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [topTags, setTopTags] = useState<TagSummary[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalInvoiceValue: 0,
    totalInvoiceCount: 0,
    totalVoucherValue: 0,
    totalVoucherCount: 0,
    totalDocumentCount: 0,
  });

  const fetchData = useCallback(
    (m: AnalyticsMode, df: string, dt: string) => {
      setError(null);
      startTransition(async () => {
        try {
          const result = await getTagAnalytics({
            mode: m,
            dateFrom: df || undefined,
            dateTo: dt || undefined,
          });
          setTopTags(result.topTags);
          setMonthlyTrend(result.monthlyTrend);
          setSummary(result.summary);
          setLoaded(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load analytics");
          setLoaded(true);
        }
      });
    },
    []
  );

  useEffect(() => {
    fetchData(mode, dateFrom, dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModeChange = (m: AnalyticsMode) => {
    setMode(m);
    fetchData(m, dateFrom, dateTo);
  };

  const handleApply = () => {
    fetchData(mode, dateFrom, dateTo);
  };

  const hasData = monthlyTrend.some(
    (d) => d.invoiceTotal > 0 || d.voucherTotal > 0 || d.combinedTotal > 0
  );

  const buildTaggedUrl = (docType: "invoice" | "voucher") => {
    const params = new URLSearchParams();
    params.set("tagged", "1");
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/app/docs/${docType === "invoice" ? "invoices" : "vouchers"}?${params.toString()}`;
  };

  const buildDrilldownUrl = useCallback(
    (tagId: string, docType: "invoice" | "voucher") => {
      const params = new URLSearchParams();
      params.set("tagIds", tagId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      return `/app/docs/${docType === "invoice" ? "invoices" : "vouchers"}?${params.toString()}`;
    },
    [dateFrom, dateTo]
  );

  const leaderboardColumns = useMemo<Column<TagSummary>[]>(
    () => [
      {
        key: "rank",
        label: "#",
        render: (_, idx) => (
          <span className="text-xs font-semibold text-[var(--muted-foreground)]">
            {idx + 1}
          </span>
        ),
      },
      {
        key: "tagName",
        label: "Tag",
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            {row.tagColor && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: row.tagColor }}
              />
            )}
            <span className="text-sm font-medium">{row.tagName}</span>
          </span>
        ),
      },
      {
        key: "invoiceTotal",
        label: "Invoice Total",
        render: (row) => formatCurrency(row.invoiceTotal),
      },
      {
        key: "voucherTotal",
        label: "Voucher Total",
        render: (row) => formatCurrency(row.voucherTotal),
      },
      {
        key: "activityCount",
        label: "Documents",
        render: (row) => (
          <span className="text-sm tabular-nums">{row.activityCount}</span>
        ),
      },
      {
        key: "lastActivityDate",
        label: "Last Activity",
        render: (row) =>
          row.lastActivityDate
            ? new Date(row.lastActivityDate).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—",
      },
      {
        key: "actions",
        label: "Drill Down",
        render: (row) => (
          <div className="flex items-center gap-2">
            {(mode === "revenue" || mode === "combined") && row.invoiceCount > 0 && (
              <Link
                href={buildDrilldownUrl(row.tagId, "invoice")}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Invoices
              </Link>
            )}
            {(mode === "expense" || mode === "combined") && row.voucherCount > 0 && (
              <Link
                href={buildDrilldownUrl(row.tagId, "voucher")}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Vouchers
              </Link>
            )}
          </div>
        ),
      },
    ],
    [mode, buildDrilldownUrl]
  );

  const trendBars = () => {
    if (mode === "revenue") {
      return (
        <Bar
          dataKey="invoiceTotal"
          name="Invoice Total"
          fill={chartColors.primary}
          radius={[4, 4, 0, 0]}
          barSize={24}
          opacity={0.85}
        />
      );
    }
    if (mode === "expense") {
      return (
        <Bar
          dataKey="voucherTotal"
          name="Voucher Total"
          fill={chartColors.red}
          radius={[4, 4, 0, 0]}
          barSize={24}
          opacity={0.85}
        />
      );
    }
    return (
      <>
        <Bar
          dataKey="invoiceTotal"
          name="Invoice Total"
          fill={chartColors.primary}
          radius={[4, 4, 0, 0]}
          barSize={20}
          opacity={0.85}
        />
        <Bar
          dataKey="voucherTotal"
          name="Voucher Total"
          fill={chartColors.red}
          radius={[4, 4, 0, 0]}
          barSize={20}
          opacity={0.85}
        />
      </>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="mb-6">
        <Link
          href="/app/intel/reports"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ← Back to Reports
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Tag Analytics
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Spending and revenue intelligence grouped by document tags.
        </p>
      </header>

      {/* Non-exclusive attribution notice */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Non-Exclusive Attribution:</span>{" "}
          Documents with multiple tags have their full amount attributed to each
          assigned tag. Summed tag totals may exceed overall company totals.
        </p>
      </div>

      {/* Mode toggle + Date filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex items-center rounded-lg border border-[var(--border-soft)] bg-white p-1 shadow-sm">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleModeChange(opt.value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === opt.value
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              From Date
            </label>
            <input
              type="date"
              className="h-9 rounded-lg border border-[var(--border-soft)] bg-white px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              To Date
            </label>
            <input
              type="date"
              className="h-9 rounded-lg border border-[var(--border-soft)] bg-white px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <button
            onClick={handleApply}
            className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)] transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Top Tags KPI cards */}
      {loaded && summary.totalDocumentCount > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Total Tagged Documents
            </p>
            <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
              {summary.totalDocumentCount}
            </p>
            <div className="mt-2 flex gap-2">
              <Link
                href={buildTaggedUrl("invoice")}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Invoices →
              </Link>
              <Link
                href={buildTaggedUrl("voucher")}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Vouchers →
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600">
              Total Invoice Value
            </p>
            <p className="mt-1 text-xl font-bold text-blue-700">
              {formatCurrency(summary.totalInvoiceValue)}
            </p>
            <div className="mt-2">
              <Link
                href={buildTaggedUrl("invoice")}
                className="text-xs text-blue-600 hover:underline"
              >
                View Tagged Invoices →
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-red-600">
              Total Voucher Value
            </p>
            <p className="mt-1 text-xl font-bold text-red-700">
              {formatCurrency(summary.totalVoucherValue)}
            </p>
            <div className="mt-2">
              <Link
                href={buildTaggedUrl("voucher")}
                className="text-xs text-red-600 hover:underline"
              >
                View Tagged Vouchers →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Monthly trend chart */}
      {isPending && !loaded ? (
        <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
          Loading…
        </div>
      ) : (
        <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          <div className="mb-6">
            <ChartContainer
              title="Monthly Tagged Activity"
              height={320}
              empty={!hasData}
              emptyMessage="No tagged document activity found for the selected period and mode."
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyTrend}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis tickFormatter={formatChartCurrency} {...yAxisProps} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend {...legendProps} />
                  {trendBars()}
                  {mode === "combined" && (
                    <Line
                      dataKey="combinedTotal"
                      name="Combined"
                      type="monotone"
                      stroke={chartColors.amber}
                      strokeWidth={2}
                      dot={{ r: 3, fill: chartColors.amber }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Top Tags Leaderboard */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">
              Top Tags
            </h2>
            {topTags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] p-12 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  No tag activity found. Assign tags to invoices and vouchers to
                  see analytics here.
                </p>
              </div>
            ) : (
              <ReportDataTable
                columns={leaderboardColumns}
                rows={topTags}
                total={topTags.length}
                page={1}
                pageSize={topTags.length}
                onPageChange={() => {}}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
