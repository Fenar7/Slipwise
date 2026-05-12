"use client";

import { useState, useEffect } from "react";
import {
  getExecutiveKpisAction,
  generateFlashReportAction,
  getFlashReportSchedulesAction,
  upsertFlashReportScheduleAction,
  sendFlashReportNowAction,
} from "./actions";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { KpiResult } from "@/lib/intel/kpi";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = "MTD" | "QTD" | "YTD";

interface KpiCardProps {
  kpi: KpiResult;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ kpi }: KpiCardProps) {
  const trendArrow = kpi.trend === "UP" ? "↑" : kpi.trend === "DOWN" ? "↓" : "→";
  const trendColor = kpi.trendIsPositive ? "text-[var(--state-success)]" : "text-[var(--state-danger)]";
  const sparkData = kpi.sparkline.map((v, i) => ({ i, v }));

  function formatValue(): string {
    switch (kpi.unit) {
      case "currency":
        return `₹${kpi.currentValue.toLocaleString("en-IN")}`;
      case "%":
        return `${kpi.currentValue}%`;
      case "months":
        return `${kpi.currentValue} mo`;
      case "days":
        return `${kpi.currentValue}d`;
      default:
        return String(kpi.currentValue);
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {kpi.label}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">{formatValue()}</p>
            <p className={`text-sm ${trendColor} font-medium`}>
              {trendArrow} {kpi.changePct >= 0 ? "+" : ""}
              {kpi.changePct}%
            </p>
          </div>
          <div className="w-20 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                 <Area
                   type="monotone"
                   dataKey="v"
                   stroke={kpi.trendIsPositive ? "var(--state-success)" : "var(--state-danger)"}
                   fill={kpi.trendIsPositive ? "var(--state-success-soft)" : "var(--state-danger-soft)"}
                   strokeWidth={1.5}
                 />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard Component ───────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [arr, setArr] = useState(0);
  const [period, setPeriod] = useState<Period>("MTD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashSending, setFlashSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await getExecutiveKpisAction(period);
      if (cancelled) return;
      if (result.success) {
        setKpis(result.data.kpis);
        setArr(result.data.arr);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [period]);

  async function handleSendFlashReport() {
    setFlashSending(true);
    const schedulesResult = await getFlashReportSchedulesAction();
    if (schedulesResult.success && schedulesResult.data.length > 0) {
      const schedule = schedulesResult.data[0];
      await sendFlashReportNowAction(schedule.id, period);
    } else {
      await generateFlashReportAction(period);
    }
    setFlashSending(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Real-time business intelligence &amp; KPI tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period Toggle */}
          <div className="flex rounded-md border">
            {(["MTD", "QTD", "YTD"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={handleSendFlashReport}
            disabled={flashSending}
          >
            {flashSending ? "Sending…" : "Send Flash Report"}
          </Button>
        </div>
      </div>

      {/* ARR Highlight */}
      {arr > 0 && (
        <div className="rounded-lg border bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
          <p className="text-sm text-muted-foreground">
            Annual Recurring Revenue (ARR)
          </p>
          <p className="text-3xl font-bold text-blue-700">
            ₹{arr.toLocaleString("en-IN")}
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      {!loading && kpis.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && kpis.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p className="text-lg font-medium">No data available</p>
          <p className="text-sm mt-1">
            Start creating invoices and recording payments to see your KPIs.
          </p>
        </div>
      )}
    </div>
  );
}
