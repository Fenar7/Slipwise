"use client";

import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";
import { formatSyncElapsed } from "./mailbox-sync-ui";

export function MailboxSyncStateChip({
  sync,
  className,
}: {
  sync: MailboxSyncPresentation;
  className?: string;
}) {
  const config =
    sync.state === "running"
      ? {
          icon: Loader2,
          label: "Syncing",
          className: "border-blue-100 bg-blue-50 text-blue-700",
          iconClassName: "animate-spin",
        }
      : sync.state === "failed"
        ? {
            icon: AlertTriangle,
            label: "Needs attention",
            className: "border-amber-100 bg-amber-50 text-amber-700",
            iconClassName: "",
          }
        : sync.state === "completed_never_imported"
          ? {
              icon: Clock3,
              label: "Waiting",
              className: "border-slate-200 bg-slate-50 text-slate-700",
              iconClassName: "",
            }
          : sync.state === "completed"
            ? {
                icon: CheckCircle2,
                label: "Up to date",
                className: "border-emerald-100 bg-emerald-50 text-emerald-700",
                iconClassName: "",
              }
            : {
                icon: RefreshCw,
                label: "Unavailable",
                className: "border-slate-200 bg-slate-50 text-slate-600",
                iconClassName: "",
              };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        config.className,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", config.iconClassName)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

export function MailboxSyncProgressBar({ sync }: { sync: MailboxSyncPresentation }) {
  const toneClassName =
    sync.state === "failed"
      ? "bg-amber-500"
      : sync.state === "completed"
        ? "bg-emerald-500"
        : "bg-blue-500";

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]" aria-hidden="true">
      {sync.state === "running" ? (
        <div className="h-full w-2/5 animate-pulse rounded-full bg-blue-500" />
      ) : (
        <div className={cn("h-full w-full rounded-full", toneClassName)} />
      )}
    </div>
  );
}

export function MailboxSyncSummary({
  sync,
  action,
  error,
}: {
  sync: MailboxSyncPresentation;
  action?: React.ReactNode;
  error?: string | null;
}) {
  const elapsedLabel = formatSyncElapsed(sync.currentRunStartedAt);
  const showStats =
    sync.state === "completed" &&
    sync.lastRunThreadCount !== null &&
    sync.lastRunMessageCount !== null;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        sync.state === "failed"
          ? "border-amber-200 bg-amber-50/70"
          : sync.state === "running"
            ? "border-blue-100 bg-blue-50/70"
            : "border-[#E2E8F0] bg-[#F8FAFC]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MailboxSyncStateChip sync={sync} />
            {elapsedLabel ? (
              <span className="text-[11px] font-medium text-[#64748B]">{elapsedLabel}</span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-[#0F172A]">{sync.stageLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">{sync.detailLabel}</p>
          {showStats ? (
            <p className="mt-2 text-[11px] font-medium text-[#475569]">
              {sync.lastRunThreadCount} threads · {sync.lastRunMessageCount} messages
            </p>
          ) : null}
          {error ? <p className="mt-2 text-[11px] font-medium text-red-700">{error}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {(sync.state === "running" || sync.state === "completed" || sync.state === "failed") && (
        <div className="mt-3">
          <MailboxSyncProgressBar sync={sync} />
        </div>
      )}
    </div>
  );
}
