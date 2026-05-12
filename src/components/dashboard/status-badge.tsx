import { cn } from "@/lib/utils";

type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  default: "bg-[var(--surface-subtle)] text-[var(--text-secondary)]",
  success: "bg-[var(--state-success-soft)] text-[var(--state-success)]",
  warning: "bg-[var(--state-warning-soft)] text-[var(--state-warning)]",
  danger: "bg-[var(--state-danger-soft)] text-[var(--state-danger)]",
  info: "bg-[var(--state-info-soft)] text-[var(--state-info)]",
  neutral: "bg-[var(--surface-subtle)] text-[var(--text-muted)]",
};

export function StatusBadge({ children, variant = "default", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
