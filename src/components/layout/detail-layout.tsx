import { cn } from "@/lib/utils";

interface DetailLayoutProps {
  children: React.ReactNode;
  rail?: React.ReactNode;
  topBar?: React.ReactNode;
  className?: string;
  railWidth?: string;
}

export function DetailLayout({
  children,
  rail,
  topBar,
  className,
  railWidth = "320px",
}: DetailLayoutProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {topBar && <div className="shrink-0">{topBar}</div>}
      <div className="flex flex-col gap-6 lg:flex-row">
        <main className="min-w-0 flex-1">{children}</main>
        {rail && (
          <aside
            className="w-full shrink-0 space-y-4 lg:w-[var(--detail-rail-width,320px)]"
            style={{ "--detail-rail-width": railWidth } as React.CSSProperties}
          >
            {rail}
          </aside>
        )}
      </div>
    </div>
  );
}

interface DetailRailCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  padding?: "normal" | "none";
}

export function DetailRailCard({
  title,
  children,
  className,
  padding = "normal",
}: DetailRailCardProps) {
  return (
    <div
      className={cn(
        "slipwise-panel",
        padding === "normal" && "p-4",
        className
      )}
    >
      {title && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

interface DetailTopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  className?: string;
}

export function DetailTopBar({ title, subtitle, actions, className }: DetailTopBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

interface MetadataFieldProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function MetadataField({ label, value, className }: MetadataFieldProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
