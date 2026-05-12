import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "soon" | "success" | "warning" | "danger";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em]",
        {
          "bg-[var(--surface-subtle)] text-[var(--text-muted)]": variant === "default",
          "bg-[rgba(156,163,175,0.12)] text-[var(--text-muted)]": variant === "soon",
          "bg-[var(--state-success-soft)] text-[var(--state-success)]": variant === "success",
          "bg-[var(--state-warning-soft)] text-[var(--state-warning)]": variant === "warning",
          "bg-[var(--state-danger-soft)] text-[var(--state-danger)]": variant === "danger",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
