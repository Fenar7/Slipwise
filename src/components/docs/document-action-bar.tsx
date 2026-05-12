"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { StatusVariant } from "@/components/dashboard/status-badge";
import {
  ArrowLeft,
  Printer,
  Download,
  Link2,
  Pencil,
  Share2,
  Eye,
  FileText,
  MoreHorizontal,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Send,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DocActionVariant = "primary" | "secondary" | "subtle" | "danger";

export interface DocAction {
  id: string;
  label: string;
  icon?: "print" | "download" | "link" | "edit" | "share" | "preview" | "delete" | "duplicate" | "send" | "convert" | "cancel" | "confirm" | "more" | "archive" | "release";
  variant?: DocActionVariant;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "link" | "button" | "form";
  formAction?: () => Promise<void>;
  title?: string;
}

export interface DocumentActionBarProps {
  backHref?: string;
  backLabel?: string;
  documentType: string;
  documentNumber: string;
  title?: string;
  status: string;
  statusVariant?: StatusVariant;
  primaryActions?: DocAction[];
  secondaryActions?: DocAction[];
  contextMeta?: Array<{ label: string; value: React.ReactNode }>;
  children?: React.ReactNode;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<NonNullable<DocAction["icon"]>, React.ReactNode> = {
  print: <Printer className="h-3.5 w-3.5" />,
  download: <Download className="h-3.5 w-3.5" />,
  link: <Link2 className="h-3.5 w-3.5" />,
  edit: <Pencil className="h-3.5 w-3.5" />,
  share: <Share2 className="h-3.5 w-3.5" />,
  preview: <Eye className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  duplicate: <Copy className="h-3.5 w-3.5" />,
  send: <Send className="h-3.5 w-3.5" />,
  convert: <RotateCcw className="h-3.5 w-3.5" />,
  cancel: <XCircle className="h-3.5 w-3.5" />,
  confirm: <CheckCircle2 className="h-3.5 w-3.5" />,
  more: <MoreHorizontal className="h-3.5 w-3.5" />,
  archive: <ArchiveIcon />,
  release: <CheckCircle2 className="h-3.5 w-3.5" />,
};

function ArchiveIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  );
}

// ─── Action button styling ────────────────────────────────────────────────────

function actionClasses(variant: DocActionVariant = "subtle"): string {
  switch (variant) {
    case "primary":
      return "border border-transparent bg-[var(--brand-cta)] text-white shadow-[var(--shadow-xs)] hover:bg-[#B91C1C] hover:shadow-md";
    case "secondary":
      return "border border-[var(--border-default)] bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-subtle)]";
    case "danger":
      return "border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] text-[var(--state-danger)] hover:bg-[var(--state-danger)]/15";
    case "subtle":
    default:
      return "border border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-selected)] hover:text-[var(--text-primary)]";
  }
}

function ActionButton({ action }: { action: DocAction }) {
  const className = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
    actionClasses(action.variant)
  );

  const content = (
    <>
      {action.icon && ICON_MAP[action.icon]}
      <span>{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={className} title={action.title}>
        {content}
      </Link>
    );
  }

  if (action.formAction) {
    return (
      <form action={action.formAction} key={action.id}>
        <button
          type="submit"
          disabled={action.disabled}
          className={className}
          title={action.title}
        >
          {content}
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={className}
      title={action.title}
    >
      {content}
    </button>
  );
}

// ─── Overflow menu for excess actions ─────────────────────────────────────────

function OverflowMenu({ actions }: { actions: DocAction[] }) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium transition-all border border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-selected)]",
        )}
        title="More actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-[var(--border-default)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
            {actions.map((action) => (
              <div key={action.id} className="px-0.5 py-0.5">
                <ActionButton action={action} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentActionBar({
  backHref,
  backLabel = "Back",
  documentType,
  documentNumber,
  title,
  status,
  statusVariant = "neutral",
  primaryActions = [],
  secondaryActions = [],
  contextMeta,
  children,
}: DocumentActionBarProps) {
  const visiblePrimary = primaryActions.slice(0, 3);
  const overflowPrimary = primaryActions.slice(3);
  const allSecondary = [...secondaryActions, ...overflowPrimary];

  return (
    <div className="space-y-4">
      {/* Top row: back link + meta */}
      {(backHref || contextMeta) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          )}
          {contextMeta && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              {contextMeta.map((item) => (
                <span key={item.label}>
                  <span className="font-medium uppercase tracking-wider">{item.label}</span>{" "}
                  <span className="text-[var(--text-secondary)]">{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Identity card */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Identity */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <FileText className="h-3 w-3" />
                {documentType}
              </span>
              <StatusBadge variant={statusVariant}>{status.replace(/_/g, " ")}</StatusBadge>
            </div>
            <h1 className="mt-3 text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)] md:text-[2rem]">
              {documentNumber}
            </h1>
            {title && (
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                {title}
              </p>
            )}
          </div>

          {/* Actions */}
          {(visiblePrimary.length > 0 || allSecondary.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 md:pt-1">
              {allSecondary.length > 0 && (
                <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  {allSecondary.slice(0, 4).map((action) => (
                    <ActionButton key={action.id} action={action} />
                  ))}
                  {allSecondary.length > 4 && <OverflowMenu actions={allSecondary.slice(4)} />}
                </div>
              )}
              {visiblePrimary.map((action) => (
                <ActionButton key={action.id} action={action} />
              ))}
              {/* Mobile: collapse all non-primary into overflow */}
              <div className="flex flex-wrap items-center gap-2 sm:hidden">
                {allSecondary.length > 0 && <OverflowMenu actions={allSecondary} />}
              </div>
            </div>
          )}
        </div>

        {children && <div className="mt-5 border-t border-[var(--border-soft)] pt-5">{children}</div>}
      </div>
    </div>
  );
}

// ─── Compact action bar for rail / sidebar use ────────────────────────────────

export function DocumentActionRail({
  actions,
  className,
}: {
  actions: DocAction[];
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? actions : actions.slice(0, 6);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {visible.map((action) => (
          <ActionButton key={action.id} action={action} />
        ))}
      </div>
      {actions.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {showAll ? "Show less" : `+${actions.length - 6} more`}
        </button>
      )}
    </div>
  );
}
