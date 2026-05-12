"use client";

import {
  ResponsiveContainer,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  Legend,
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

interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  paid: number;
}

interface RevenueTrendChartProps {
  data: RevenueTrendPoint[];
}

function formatCurrency(value: number): string {
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

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const hasData = data.some((d) => d.invoiced > 0 || d.paid > 0);

  return (
    <ChartContainer
      title="Revenue Trend — Last 12 Months"
      height={300}
      empty={!hasData}
      emptyMessage="No revenue data yet. Create and issue your first invoice to see trends here."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="month" {...axisProps} />
          <YAxis tickFormatter={formatCurrency} {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...legendProps} />
          <Bar
            dataKey="invoiced"
            name="Invoiced"
            fill={chartColors.primary}
            radius={[4, 4, 0, 0]}
            barSize={24}
            opacity={0.85}
          />
          <Line
            dataKey="paid"
            name="Paid"
            type="monotone"
            stroke={chartColors.tertiary}
            strokeWidth={2}
            dot={{ r: 3, fill: chartColors.tertiary }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
