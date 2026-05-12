"use client";

import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ─────────────────────────────────────────────────────────────────────────── */

interface UsageRow {
  label: string;
  current: number;
  limit: number | null;
  unit?: string;
  isBytes?: boolean;
}

interface Props {
  rows: UsageRow[];
  planName: string;
  periodLabel: string;
}

/* ─────────────────────────────────────────────────────────────────────────── */

function toNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function pct(current: unknown, limit: unknown): number {
  const c = toNumber(current);
  const l = toNumber(limit);
  if (l === 0) return 0;
  return Math.min(100, Math.round((c / l) * 100));
}

function displayValue(value: unknown, isBytes?: boolean): string {
  const n = toNumber(value);
  if (isBytes) return formatBytes(n);
  return n.toLocaleString("en-IN");
}

function displayLimit(limit: unknown, isBytes?: boolean): string {
  if (limit === null || limit === undefined) return "∞";
  const l = toNumber(limit);
  if (isBytes) return formatBytes(l);
  return l.toLocaleString("en-IN");
}

/* ── Color themes per metric ─────────────────────────────────────────────── */

interface MetricTheme {
  label: string;
  icon: ReactNode;
  group: string;
  color: string;
  bg: string;
  bar: string;
}

const THEMES: Record<string, MetricTheme> = {
  "Invoices (active)": {
    group: "Documents",
    color: "#DC2626",
    bg: "#FEF2F2",
    bar: "#DC2626",
    label: "Invoices",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M9 12h.01M9 16h.01M13 16h.01M13 12h.01M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Quotes (active)": {
    group: "Documents",
    color: "#2563EB",
    bg: "#EFF6FF",
    bar: "#2563EB",
    label: "Quotes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M9 7h6M9 11h6M9 15h4M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  Vouchers: {
    group: "Documents",
    color: "#7C3AED",
    bg: "#F5F3FF",
    bar: "#7C3AED",
    label: "Vouchers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Salary Slips": {
    group: "Documents",
    color: "#059669",
    bg: "#ECFDF5",
    bar: "#059669",
    label: "Salary Slips",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Team Members": {
    group: "Team",
    color: "#4F46E5",
    bg: "#EEF2FF",
    bar: "#4F46E5",
    label: "Team Members",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Active Portal Sessions": {
    group: "Team",
    color: "#0891B2",
    bg: "#ECFEFF",
    bar: "#0891B2",
    label: "Portal Sessions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M15 7h.01M15 11h.01M15 15h.01M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Storage Used": {
    group: "Storage",
    color: "#B45309",
    bg: "#FFFBEB",
    bar: "#B45309",
    label: "Storage",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7zM4 7h16M12 11v6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Pixel Jobs Saved": {
    group: "Storage",
    color: "#BE185D",
    bg: "#FFF1F2",
    bar: "#BE185D",
    label: "Pixel Jobs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Webhook Calls (this month)": {
    group: "Platform",
    color: "#4338CA",
    bg: "#E0E7FF",
    bar: "#4338CA",
    label: "Webhooks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  "Active Share Bundles": {
    group: "Platform",
    color: "#C2410C",
    bg: "#FFF7ED",
    bar: "#C2410C",
    label: "Share Bundles",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
};

const GROUP_ORDER = ["Documents", "Team", "Storage", "Platform"];

/* ── UI helpers ──────────────────────────────────────────────────────────── */

function MetricCard({ row }: { row: UsageRow }) {
  const meta = THEMES[row.label] ?? {
    group: "Platform",
    color: "#79747E",
    bg: "#F5F5F5",
    bar: "#79747E",
    label: row.label,
    icon: null,
  };

  const p = pct(row.current, row.limit);
  const isUnlimited = row.limit === null;
  const isWarning = !isUnlimited && p >= 70;
  const isDanger = !isUnlimited && p >= 90;

  return (
    <div
      className="rounded-2xl border bg-white p-4 transition-all hover:border-[#DC2626]"
      style={{ borderColor: "#E0E0E0" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" style={{ color: "#79747E" }}>
            {meta.label}
          </p>
          <p className="mt-0.5 text-lg font-bold" style={{ color: "#1C1B1F" }}>
            {displayValue(row.current, row.isBytes)}
          </p>
        </div>
        {isUnlimited ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ background: "#F5F5F5", color: "#79747E" }}
          >
            Unlimited
          </span>
        ) : (
          <span
            className="shrink-0 text-xs font-bold"
            style={{ color: isDanger ? "#DC2626" : isWarning ? "#B45309" : "#16A34A" }}
          >
            {p}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "#F5F5F5" }}>
        {isUnlimited ? (
          <div className="h-full w-full" style={{ background: "#E0E0E0" }} />
        ) : (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${p}%`,
              background: isDanger ? "#DC2626" : isWarning ? "#B45309" : meta.bar,
            }}
          />
        )}
      </div>

      {/* Limit info */}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px]" style={{ color: "#79747E" }}>
          {isUnlimited ? "No limit" : `of ${displayLimit(row.limit, row.isBytes)}`}
        </p>
        {isDanger && (
          <a
            href="/app/settings/billing"
            className="text-[11px] font-semibold hover:underline"
            style={{ color: "#DC2626" }}
          >
            Upgrade
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */

export function UsageDashboardClient({ rows, planName, periodLabel }: Props) {
  /* Group rows */
  const groups: Record<string, UsageRow[]> = {};
  for (const row of rows) {
    const g = THEMES[row.label]?.group ?? "Platform";
    groups[g] = groups[g] ?? [];
    groups[g].push(row);
  }

  /* Summary stats */
  const limitedRows = rows.filter((r) => r.limit !== null);
  const totalLimits = limitedRows.length;
  const nearLimit = limitedRows.filter((r) => pct(r.current, r.limit) >= 70).length;
  const dangerLimit = limitedRows.filter((r) => pct(r.current, r.limit) >= 90).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "#1C1B1F" }}>
            Usage &amp; Limits
          </h1>
          <p className="text-xs" style={{ color: "#79747E" }}>
            {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dangerLimit > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: "#FEF2F2", color: "#DC2626" }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              {dangerLimit} at limit
            </span>
          )}
          {nearLimit > 0 && dangerLimit === 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: "#FFFBEB", color: "#B45309" }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              {nearLimit} near limit
            </span>
          )}
          <span
            className="rounded-full border px-3 py-1 text-sm font-semibold capitalize"
            style={{ borderColor: "#E0E0E0", color: "#1C1B1F", background: "#fff" }}
          >
            {planName} Plan
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E0E0E0" }}>
          <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>Total Limits</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "#1C1B1F" }}>{totalLimits}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E0E0E0" }}>
          <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>Near Limit</p>
          <p className={`mt-1 text-2xl font-bold ${nearLimit > 0 ? "text-amber-600" : ""}`} style={nearLimit > 0 ? { color: "#B45309" } : { color: "#1C1B1F" }}>{nearLimit}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E0E0E0" }}>
          <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>Unlimited</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "#1C1B1F" }}>{rows.filter((r) => r.limit === null).length}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E0E0E0" }}>
          <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>Active Metrics</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "#1C1B1F" }}>{rows.filter((r) => r.current > 0).length}</p>
        </div>
      </div>

      {/* Grouped metric cards */}
      <div className="space-y-6">
        {GROUP_ORDER.filter((g) => groups[g]?.length > 0).map((groupName) => (
          <section key={groupName}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
              {groupName}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups[groupName].map((row) => (
                <MetricCard key={row.label} row={row} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <div
        className="rounded-2xl border p-4 text-center"
        style={{ borderColor: "#E0E0E0", background: "#FAFAFA" }}
      >
        <p className="text-sm" style={{ color: "#79747E" }}>
          Need more capacity?{" "}
          <a
            href="/app/settings/billing"
            className="font-semibold hover:underline"
            style={{ color: "#DC2626" }}
          >
            Compare plans and upgrade →
          </a>
        </p>
      </div>
    </div>
  );
}
