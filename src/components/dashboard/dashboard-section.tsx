import Link from "next/link";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  title?: string;
  subtitle?: string;
  action?: {
    href: string;
    label: string;
  };
  children: React.ReactNode;
  className?: string;
}

export function DashboardSection({
  title,
  subtitle,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>
            )}
          </div>
          {action && (
            <Link
              href={action.href}
              className="shrink-0 text-sm font-medium text-[var(--brand-primary)] hover:text-[var(--brand-primary)] hover:underline transition-colors"
            >
              {action.label}
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

interface ContentPanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: "normal" | "none";
}

export function ContentPanel({ children, className, padding = "normal" }: ContentPanelProps) {
  return (
    <div
      className={cn(
        "slipwise-panel overflow-hidden",
        padding === "normal" && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}
