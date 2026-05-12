"use client";

import { StatusBadge } from "@/components/dashboard/status-badge";

const LIFECYCLE_STAGES = [
  "PROSPECT",
  "QUALIFIED",
  "NEGOTIATION",
  "WON",
  "ACTIVE",
  "AT_RISK",
  "CHURNED",
] as const;

const VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

interface LifecycleSelectProps {
  value: string;
  onChange: (stage: string) => void;
  label?: string;
}

export function LifecycleSelect({ value, onChange, label = "Lifecycle Stage" }: LifecycleSelectProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[var(--border-default)] bg-white py-2 pl-3 pr-8 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        >
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <div className="mt-2">
        <StatusBadge variant={VARIANTS[value] ?? "neutral"}>
          {value.replace(/_/g, " ")}
        </StatusBadge>
      </div>
    </div>
  );
}
