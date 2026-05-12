import Link from "next/link";
import { cn } from "@/lib/utils";

interface ActivityItemProps {
  href: string;
  title: string;
  meta?: string;
  badge?: React.ReactNode;
  detail?: string;
  rightText?: string;
  rightSubtext?: string;
}

export function ActivityItem({
  href,
  title,
  meta,
  badge,
  detail,
  rightText,
  rightSubtext,
}: ActivityItemProps) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface-subtle)]"
    >
      <div className="flex items-center gap-3 min-w-0">
        {badge && <span className="shrink-0">{badge}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
            {title}
          </p>
          {meta && <p className="truncate text-xs text-[var(--text-muted)]">{meta}</p>}
          {detail && <p className="truncate text-xs text-[var(--text-muted)]">{detail}</p>}
        </div>
      </div>
      {(rightText || rightSubtext) && (
        <div className="flex flex-col items-end shrink-0 ml-4">
          {rightText && (
            <p className="text-sm font-medium text-[var(--text-primary)]">{rightText}</p>
          )}
          {rightSubtext && <p className="text-xs text-[var(--text-muted)]">{rightSubtext}</p>}
        </div>
      )}
    </Link>
  );
}

interface ActivityListProps {
  children: React.ReactNode;
  emptyMessage?: string;
  emptyDescription?: string;
  className?: string;
}

export function ActivityList({
  children,
  emptyMessage,
  emptyDescription,
  className,
}: ActivityListProps) {
  const hasChildren = Array.isArray(children)
    ? children.filter(Boolean).length > 0
    : Boolean(children);

  if (!hasChildren && emptyMessage) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>
        {emptyDescription && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return <div className={cn("divide-y divide-[var(--border-soft)]", className)}>{children}</div>;
}
