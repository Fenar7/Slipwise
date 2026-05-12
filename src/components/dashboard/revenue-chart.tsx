"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface RevenueTrendPoint {
  month: string;
  invoiced: number;
  paid: number;
}

const RANGE_OPTIONS = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "12M", value: 12 },
];

function formatCurrency(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
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
    <div
      className="rounded-xl border px-4 py-3 text-xs"
      style={{
        background: "rgba(255,255,255,0.96)",
        borderColor: "#E0E0E0",
        boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
      }}
    >
      <p className="mb-2 text-[11px] font-semibold" style={{ color: "#1C1B1F" }}>
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: "#79747E" }}>{entry.name}:</span>
          <span className="font-semibold" style={{ color: "#1C1B1F" }}>
            ₹{entry.value.toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface RevenueChartProps {
  data: RevenueTrendPoint[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [range, setRange] = useState(6);

  const filtered = useMemo(() => {
    if (data.length <= range) return data;
    return data.slice(-range);
  }, [data, range]);

  const hasData = filtered.some((d) => d.invoiced > 0 || d.paid > 0);
  const latest = filtered[filtered.length - 1];

  return (
    <div
      className="flex h-full flex-col rounded-2xl border bg-white p-4"
      style={{ borderColor: "#E0E0E0" }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
            Revenue Overview
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {latest && (
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-[10px]" style={{ color: "#79747E" }}>Invoiced</p>
                <p className="text-sm font-bold" style={{ color: "#DC2626" }}>
                  {formatCurrency(latest.invoiced)}
                </p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "#79747E" }}>Collected</p>
                <p className="text-sm font-bold" style={{ color: "#16A34A" }}>
                  {formatCurrency(latest.paid)}
                </p>
              </div>
            </div>
          )}
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="rounded-lg border px-2 py-1 text-[11px] font-medium outline-none focus:border-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F", background: "#fff" }}
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {hasData ? (
        <div className="flex-1" style={{ minHeight: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filtered}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              barGap={3}
            >
              <defs>
                <linearGradient id="barInvoiced" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
                <linearGradient id="barPaid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#16A34A" />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="#F5F5F5" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "#9CA3AF", fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                dy={6}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: "#9CA3AF", fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={46}
                dx={-2}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />

              <Bar dataKey="invoiced" name="Invoiced" fill="url(#barInvoiced)" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="paid" name="Collected" fill="url(#barPaid)" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center" style={{ minHeight: 140 }}>
          <p className="text-sm" style={{ color: "#79747E" }}>
            No revenue data yet. Create and issue your first invoice.
          </p>
        </div>
      )}
    </div>
  );
}
