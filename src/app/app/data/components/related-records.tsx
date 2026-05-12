import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface RelatedItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  href?: string;
  date: Date;
}

interface RelatedRecordsProps {
  title: string;
  items: RelatedItem[];
  emptyMessage?: string;
  action?: {
    href: string;
    label: string;
  };
}

function statusVariant(status?: string): Parameters<typeof StatusBadge>[0]["variant"] {
  if (!status) return "neutral";
  const s = status.toLowerCase();
  if (s.includes("paid") || s.includes("active") || s.includes("verified") || s.includes("won")) return "success";
  if (s.includes("pending") || s.includes("draft") || s.includes("prospect")) return "warning";
  if (s.includes("overdue") || s.includes("declined") || s.includes("blocked") || s.includes("churned")) return "danger";
  return "neutral";
}

export function RelatedRecords({ title, items, emptyMessage = "No records yet.", action }: RelatedRecordsProps) {
  return (
    <div className="slipwise-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-medium text-[var(--brand-primary)] hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</div>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-subtle)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {item.href ? (
                    <Link href={item.href} className="truncate text-sm font-medium text-[var(--brand-primary)] hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">{item.title}</span>
                  )}
                  {item.status && (
                    <StatusBadge variant={statusVariant(item.status)}>
                      {item.status.replace(/_/g, " ")}
                    </StatusBadge>
                  )}
                </div>
                {item.subtitle && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.subtitle}</p>
                )}
              </div>
              <span className="ml-4 shrink-0 text-xs text-[var(--text-muted)]">
                {new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
