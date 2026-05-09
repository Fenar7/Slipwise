"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Settings2,
  Plus,
  MoreHorizontal,
  ShieldCheck,
  Clock,
  Mail,
} from "lucide-react";
import { MOCK_ADMIN_SUMMARIES } from "../mock-data";
import type { MailboxAdminSummary, MailboxConnectionStatus } from "../types";
import { MailboxConnectFlow } from "./mailbox-connect-flow";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MailboxConnectionStatus }) {
  const configs = {
    connected: {
      icon: CheckCircle2,
      label: "Connected",
      className: "bg-green-50 text-green-700 border-green-100",
    },
    reconnect_required: {
      icon: AlertTriangle,
      label: "Reconnect required",
      className: "bg-amber-50 text-amber-700 border-amber-100",
    },
    degraded: {
      icon: RefreshCw,
      label: "Sync degraded",
      className: "bg-amber-50 text-amber-700 border-amber-100",
    },
    disconnected: {
      icon: XCircle,
      label: "Disconnected",
      className: "bg-gray-100 text-gray-500 border-gray-200",
    },
  };
  const { icon: Icon, label, className } = configs[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Connection card ──────────────────────────────────────────────────────────

function formatLastSync(iso: string | null): string {
  if (!iso) return "Never synced";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConnectionCard({ summary }: { summary: MailboxAdminSummary }) {
  const { connection, policy } = summary;
  const isHealthy = connection.status === "connected";
  const needsReconnect = connection.status === "reconnect_required";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 transition-shadow hover:shadow-sm",
        needsReconnect ? "border-amber-200" : "border-[#E2E5EA]"
      )}
      data-testid={`connection-card-${connection.id}`}
      aria-label={`${connection.displayName} mailbox connection`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Mailbox avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: needsReconnect ? "#D97706" : "#16294D" }}
          aria-hidden="true"
        >
          {connection.displayName.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#0F172A]">{connection.displayName}</h3>
            <StatusBadge status={connection.status} />
          </div>
          <p className="mt-0.5 text-xs text-[#64748B]">{connection.emailAddress}</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/app/mailbox/settings/connections/${connection.id}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            title="Manage connection"
            aria-label={`Manage ${connection.displayName} connection`}
          >
            <Settings2 className="h-4 w-4" />
          </Link>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            title="More actions"
            aria-label={`More actions for ${connection.displayName}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reconnect required banner */}
      {needsReconnect && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-800">Authorization expired</p>
            <p className="mt-0.5 text-xs text-amber-700">
              {connection.lastSyncError ?? "This mailbox needs to be reconnected to resume syncing."}
            </p>
          </div>
          <Link
            href={`/app/mailbox/settings/connections/${connection.id}?action=reconnect`}
            className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
            aria-label={`Reconnect ${connection.displayName}`}
          >
            Reconnect
          </Link>
        </div>
      )}

      {/* Meta grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "#F1F3F7" }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Provider</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[#334155]">
            <Mail className="h-3 w-3" aria-hidden="true" />
            Gmail
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Last sync</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[#334155]">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatLastSync(connection.lastSyncAt)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Access</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[#334155]">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {policy.accessSummary}
          </p>
        </div>
        {isHealthy && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Threads</p>
            <p className="mt-0.5 text-xs font-medium text-[#334155]">
              {connection.inboxCount} in inbox · {connection.unreadCount} unread
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

export default function MailboxSettingsPage() {
  const [showConnectFlow, setShowConnectFlow] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
            Mailbox · Admin
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#0F172A]">
            Mailbox connections
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#64748B]">
            Manage Gmail mailboxes connected to your organization. Only admins can connect, disconnect, or change mailbox permissions.
          </p>
        </div>
        <button
          onClick={() => setShowConnectFlow(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          aria-label="Connect a new Gmail mailbox"
          data-testid="connect-mailbox-btn"
        >
          <Plus className="h-4 w-4" />
          Connect mailbox
        </button>
      </div>

      {/* Admin notice */}
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-[#E2E5EA] bg-white px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#16294D]" aria-hidden="true" />
        <p className="text-xs text-[#334155]">
          <span className="font-semibold">Admin-only area.</span>{" "}
          Changes here affect all members who have access to these mailboxes.
        </p>
      </div>

      {/* Connection cards */}
      <div className="space-y-4" data-testid="connection-list">
        {MOCK_ADMIN_SUMMARIES.map((summary) => (
          <ConnectionCard key={summary.connection.id} summary={summary} />
        ))}
      </div>

      {/* Connect flow modal */}
      {showConnectFlow && (
        <MailboxConnectFlow onClose={() => setShowConnectFlow(false)} />
      )}
    </div>
  );
}
