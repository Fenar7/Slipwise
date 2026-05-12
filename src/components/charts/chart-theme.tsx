"use client";

import { cn } from "@/lib/utils";

export const chartColors = {
  primary: "var(--chart-series-1)",
  secondary: "var(--chart-series-2)",
  tertiary: "var(--chart-series-3)",
  quaternary: "var(--chart-series-4)",
  neutral: "var(--chart-neutral)",
  grid: "var(--border-soft)",
  axis: "var(--text-muted)",
  tooltipBg: "var(--surface-panel)",
  tooltipBorder: "var(--border-soft)",
  tooltipText: "var(--text-primary)",
};

export const chartPalette = [
  "#16294D", // navy
  "#C05092", // purple
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#64748B", // slate
];

export const axisProps = {
  tick: { fontSize: 11, fill: chartColors.axis },
  tickLine: false,
  axisLine: { stroke: chartColors.grid },
};

export const yAxisProps = {
  tick: { fontSize: 11, fill: chartColors.axis },
  tickLine: false,
  axisLine: false,
  width: 56,
};

export const gridProps = {
  strokeDasharray: "3 3",
  stroke: chartColors.grid,
  vertical: false,
};

export const legendProps = {
  wrapperStyle: { fontSize: 12, paddingTop: 12 },
  iconType: "circle" as const,
  iconSize: 8,
};

export const tooltipStyle = {
  backgroundColor: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: "10px",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
  padding: "12px 16px",
};

export const tooltipLabelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: 4,
};

export const tooltipItemStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

interface ChartContainerProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
  className?: string;
  empty?: boolean;
  emptyMessage?: string;
}

export function ChartContainer({
  title,
  subtitle,
  children,
  height = 300,
  className,
  empty,
  emptyMessage = "No data available",
}: ChartContainerProps) {
  return (
    <div className={cn("slipwise-panel p-5", className)}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          )}
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
      )}
      {empty ? (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-subtle)]"
          style={{ height }}
        >
          <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </div>
  );
}
