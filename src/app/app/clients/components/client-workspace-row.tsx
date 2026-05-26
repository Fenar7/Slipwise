import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  ArrowUpRight,
  Receipt,
  Quote,
  FileText,
  Mail,
  Phone,
} from "lucide-react";
import type { ClientWorkspaceRow } from "./client-workspace-mock-data";
import {
  LIFECYCLE_VARIANTS,
  PORTAL_STATUS_VARIANTS,
  PORTAL_STATUS_LABELS,
} from "./client-workspace-mock-data";

interface ClientWorkspaceRowProps {
  client: ClientWorkspaceRow;
}

function formatCurrency(amount: number) {
  if (amount === 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatLastActivity(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Just now";
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ClientWorkspaceRowView({
  client,
}: ClientWorkspaceRowProps) {
  const lifecycle = client.lifecycleStage ?? "PROSPECT";
  const lifecycleVariant = LIFECYCLE_VARIANTS[lifecycle] ?? "neutral";

  return (
    <tr className="group transition-colors hover:bg-[var(--surface-selected)]">
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          disabled
          className="h-3.5 w-3.5 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--focus-ring)]"
          aria-label={`Select ${client.name}`}
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/app/clients/${client.id}`}
              className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
            >
              {client.name}
            </Link>
            <Link
              href={`/app/clients/${client.id}`}
              className="inline-flex items-center text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
              title="Open client detail"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {client.contactName && (
            <span className="text-xs text-[var(--text-muted)]">
              {client.contactName}
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <Mail className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate max-w-[180px]">{client.email || "—"}</span>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <Phone className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate max-w-[130px]">{client.phone || "—"}</span>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <StatusBadge
          variant={PORTAL_STATUS_VARIANTS[client.portalStatus] ?? "neutral"}
        >
          {PORTAL_STATUS_LABELS[client.portalStatus] ?? client.portalStatus}
        </StatusBadge>
      </td>

      <td className="px-3 py-2.5">
        <StatusBadge variant={lifecycleVariant}>
          {lifecycle.replace(/_/g, " ")}
        </StatusBadge>
      </td>

      <td className="px-3 py-2.5 text-right">
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            client.outstandingBalance > 0
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-muted)]"
          )}
        >
          {formatCurrency(client.outstandingBalance)}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1" title="Invoices">
            <Receipt className="h-3 w-3" />
            {client.invoiceCount}
          </span>
          <span className="inline-flex items-center gap-1" title="Quotes">
            <Quote className="h-3 w-3" />
            {client.quoteCount}
          </span>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {formatLastActivity(client.lastActivityAt)}
        </span>
      </td>

      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100">
          <Link
            href={`/app/docs/invoices/new?customerId=${client.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
            title="Create invoice"
          >
            <Receipt className="h-3 w-3" />
            Invoice
          </Link>
          <Link
            href={`/app/docs/quotes/new?customerId=${client.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
            title="Create quote"
          >
            <Quote className="h-3 w-3" />
            Quote
          </Link>
          <Link
            href={`/app/clients/${client.id}/edit`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--surface-selected)]"
            title="Edit client"
          >
            <FileText className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}
