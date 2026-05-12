"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

interface DocCounts {
  invoice: number;
  voucher: number;
  salarySlip: number;
}

interface DocBreakdownData {
  type: string;
  count: number;
}

const DOC_COLORS: Record<string, string> = {
  Invoice: "#DC2626",
  Voucher: "#2563EB",
  "Salary Slip": "#16A34A",
};

const DOC_GRADIENTS: Record<string, [string, string]> = {
  Invoice: ["#EF4444", "#DC2626"],
  Voucher: ["#3B82F6", "#2563EB"],
  "Salary Slip": ["#22C55E", "#16A34A"],
};

const DOC_LABELS: Record<string, string> = {
  Invoice: "Invoices",
  Voucher: "Vouchers",
  "Salary Slip": "Salary Slips",
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DocBreakdownData }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl border px-3.5 py-2.5 text-xs"
      style={{
        background: "rgba(255,255,255,0.96)",
        borderColor: "#E0E0E0",
        boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
      }}
    >
      <p className="mb-1 text-[11px] font-semibold" style={{ color: "#1C1B1F" }}>
        {DOC_LABELS[d.type] || d.type}
      </p>
      <p style={{ color: "#79747E" }}>
        Count: <span className="font-semibold" style={{ color: "#1C1B1F" }}>{d.count}</span>
      </p>
    </div>
  );
}

interface DocBreakdownChartProps {
  counts: DocCounts;
}

export function DocBreakdownChart({ counts }: DocBreakdownChartProps) {
  const data: DocBreakdownData[] = [
    { type: "Invoice", count: counts.invoice },
    { type: "Voucher", count: counts.voucher },
    { type: "Salary Slip", count: counts.salarySlip },
  ].filter((d) => d.count > 0);

  const totalCount = data.reduce((s, d) => s + d.count, 0);

  return (
    <div
      className="flex h-full flex-col rounded-2xl border bg-white p-4"
      style={{ borderColor: "#E0E0E0" }}
    >
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Document Breakdown
        </h3>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center" style={{ minHeight: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {data.map((d) => {
                const colors = DOC_GRADIENTS[d.type] || ["#94A3B8", "#64748B"];
                return (
                  <linearGradient
                    key={d.type}
                    id={`donut-${d.type.replace(/\s/g, "")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={colors[0]} />
                    <stop offset="100%" stopColor={colors[1]} />
                  </linearGradient>
                );
              })}
            </defs>

            <Pie
              data={data}
              dataKey="count"
              nameKey="type"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              cornerRadius={5}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.type}
                  fill={`url(#donut-${entry.type.replace(/\s/g, "")})`}
                />
              ))}
            </Pie>

            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-medium" style={{ color: "#79747E" }}>
              Total
            </span>
            <span className="text-lg font-bold" style={{ color: "#1C1B1F" }}>
              {totalCount}
            </span>
            <span className="text-[10px] font-medium" style={{ color: "#79747E" }}>
              docs
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-1 flex items-center justify-center gap-4">
        {data.map((d) => (
          <div key={d.type} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: DOC_COLORS[d.type] || "#94A3B8" }}
            />
            <span className="text-[11px] font-medium" style={{ color: "#49454F" }}>
              {DOC_LABELS[d.type] || d.type}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "#1C1B1F" }}>
              {Math.round((d.count / Math.max(totalCount, 1)) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
