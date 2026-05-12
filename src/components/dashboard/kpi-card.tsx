import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  className?: string;
}

export function KpiCard({ label, value, icon: Icon, trend, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "slipwise-panel flex flex-col gap-3 p-5 transition-colors hover:border-[var(--border-brand)]",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {label}
        </p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--brand-primary)]">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value}</p>
        {trend && (
          <p
            className={cn(
              "mt-1 text-xs font-medium",
              trend.direction === "up" && "text-[var(--state-success)]",
              trend.direction === "down" && "text-[var(--state-danger)]",
              trend.direction === "neutral" && "text-[var(--text-muted)]"
            )}
          >
            {trend.direction === "up" && "↑ "}
            {trend.direction === "down" && "↓ "}
            {trend.value}
          </p>
        )}
      </div>
    </div>
  );
}
