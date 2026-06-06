"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Users,
  Lock,
  Trash2,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { MOCK_ADMIN_SUMMARIES } from "../../../mock-data";
import type { MailboxPermissionPolicy, DisconnectConfirmState } from "../../../types";
import { MailboxConnectFlow } from "../../mailbox-connect-flow";

// ─── Permission row ───────────────────────────────────────────────────────────

type AccessLevel = MailboxPermissionPolicy["readAccess"];

const ACCESS_LABELS: Record<AccessLevel, string> = {
  org_admins_only: "Admins only",
  all_members: "All members",
  specific_roles: "Specific roles",
};

function PermissionRow({
  label,
  description,
  value,
  onChange,
  adminOnly = false,
}: {
  label: string;
  description: string;
  value: AccessLevel;
  onChange: (v: AccessLevel) => void;
  adminOnly?: boolean;
}) {
  const options: AccessLevel[] = ["org_admins_only", "all_members", "specific_roles"];
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0" style={{ borderColor: "#F1F3F7" }}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#0F172A]">{label}</p>
        <p className="mt-0.5 text-xs text-[#64748B]">{description}</p>
      </div>
      {adminOnly ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-3 py-1.5">
          <Lock className="h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
          <span className="text-xs font-semibold text-[#64748B]">Admins only</span>
        </div>
      ) : (
        <div className="relative shrink-0">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as AccessLevel)}
            className="appearance-none rounded-lg border border-[#D1D5DB] bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-[#0F172A] outline-none focus:border-[#16294D] focus:ring-2 focus:ring-[rgba(22,41,77,0.12)]"
            aria-label={`${label} access level`}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{ACCESS_LABELS[opt]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

// ─── Disconnect confirmation ──────────────────────────────────────────────────

function DisconnectPanel({
  displayName,
  state,
  onConfirm,
  onCancel,
  onInitiate,
}: {
  displayName: string;
  state: DisconnectConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
  onInitiate: () => void;
}) {
  if (state === "idle") {
    return (
      <button
        onClick={onInitiate}
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
        aria-label={`Disconnect ${displayName} mailbox`}
        data-testid="disconnect-btn"
      >
        <Trash2 className="h-4 w-4" />
        Disconnect mailbox
      </button>
    );
  }

  if (state === "confirming") {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-5"
        data-testid="disconnect-confirm-panel"
        role="alertdialog"
        aria-label="Confirm disconnect"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-red-900">Disconnect {displayName}?</p>
            <p className="mt-1 text-sm text-red-800">
              This will remove Slipwise&apos;s access to this Gmail mailbox. Existing thread data will be retained, but new sync will stop immediately. This action requires re-authorization to undo.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            aria-label="Confirm disconnect"
            data-testid="confirm-disconnect-btn"
          >
            Yes, disconnect
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-[#E2E5EA] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
            aria-label="Cancel disconnect"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state === "disconnecting") {
    return (
      <div className="flex items-center gap-2 text-sm text-[#64748B]" data-testid="disconnect-progress">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Disconnecting…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-4 py-2.5" data-testid="disconnect-done">
      <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
      <span className="text-sm text-[#334155]">Mailbox disconnected. Redirecting…</span>
    </div>
  );
}

// ─── Connection detail page ───────────────────────────────────────────────────

interface ConnectionDetailClientProps {
  connectionId: string;
}

export function ConnectionDetailClient({ connectionId }: ConnectionDetailClientProps) {
  const summary = MOCK_ADMIN_SUMMARIES.find((s) => s.connection.id === connectionId);

  const [policy, setPolicy] = useState(summary?.policy ?? null);
  const [disconnectState, setDisconnectState] = useState<DisconnectConfirmState>("idle");
  const [showReconnect, setShowReconnect] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (disconnectState !== "disconnecting") return;

    const timeout = window.setTimeout(() => {
      setDisconnectState("disconnected");
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [disconnectState]);

  if (!summary || !policy) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-not-found">
        <p className="text-sm text-[#64748B]">Mailbox connection not found.</p>
        <Link href="/app/mailbox/settings" className="mt-2 text-sm font-medium text-[#16294D] underline">
          Back to mailbox settings
        </Link>
      </div>
    );
  }

  const { connection } = summary;
  const needsReconnect = connection.status === "reconnect_required";

  const handleSavePermissions = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const patchPolicy = (patch: Partial<typeof policy>) =>
    setPolicy((prev) => prev ? { ...prev, ...patch } : prev);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-detail-page">
      {/* Back link */}
      <Link
        href="/app/mailbox/settings"
        className="mb-6 flex items-center gap-1.5 text-xs font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Mailbox connections
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ background: needsReconnect ? "#D97706" : "#16294D" }}
          aria-hidden="true"
        >
          {connection.displayName.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">{connection.displayName}</h1>
          <p className="text-sm text-[#64748B]">{connection.emailAddress}</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Connected by {summary.connectedBy}
          </p>
        </div>
      </div>

      {/* Reconnect required banner */}
      {needsReconnect && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Authorization expired</p>
            <p className="mt-0.5 text-sm text-amber-800">{connection.lastSyncError}</p>
          </div>
          <button
            onClick={() => setShowReconnect(true)}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            aria-label="Reconnect this mailbox"
            data-testid="reconnect-btn"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Connection status */}
      <section className="mb-6 rounded-xl border border-[#E2E5EA] bg-white p-5" aria-label="Connection status">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className={cn("h-4 w-4", needsReconnect ? "text-amber-500" : "text-green-600")} aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#0F172A]">Connection status</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Status</dt>
            <dd className="mt-0.5 font-medium text-[#334155] capitalize">{connection.status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Provider</dt>
            <dd className="mt-0.5 font-medium text-[#334155]">Gmail (Google Workspace)</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Last sync</dt>
            <dd className="mt-0.5 font-medium text-[#334155]">
              {connection.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Threads</dt>
            <dd className="mt-0.5 font-medium text-[#334155]">
              {connection.status === "connected" ? `${connection.inboxCount} in inbox` : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Permissions */}
      <section className="mb-6 rounded-xl border border-[#E2E5EA] bg-white p-5" aria-label="Mailbox permissions">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#16294D]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#0F172A]">Permissions</h2>
        </div>
        <p className="mb-4 text-xs text-[#64748B]">
          Control who in your organization can access and use this mailbox.
        </p>

        <div>
          <PermissionRow
            label="Read access"
            description="Who can read threads in this mailbox"
            value={policy.readAccess}
            onChange={(v) => patchPolicy({ readAccess: v })}
          />
          <PermissionRow
            label="Reply / send access"
            description="Who can reply and send from this mailbox"
            value={policy.sendAccess}
            onChange={(v) => patchPolicy({ sendAccess: v })}
          />
          <PermissionRow
            label="Manage access"
            description="Who can change settings and disconnect this mailbox"
            value={policy.manageAccess}
            onChange={() => {}}
            adminOnly
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSavePermissions}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: "#16294D" }}
            aria-label="Save permission changes"
            data-testid="save-permissions-btn"
          >
            Save changes
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-700" data-testid="saved-indicator">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
      </section>

      {/* Visibility note */}
      <section className="mb-6 rounded-xl border border-[#E2E5EA] bg-white p-5" aria-label="Visibility">
        <div className="mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-[#16294D]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#0F172A]">Visibility</h2>
        </div>
        <p className="text-xs text-[#64748B]">
          This mailbox is visible to members based on the read access setting above. Members without read access will not see this mailbox in their left rail or thread views.
        </p>
        <div className="mt-3 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-3 py-2.5 text-xs text-[#334155]">
          <span className="font-semibold">Current visibility:</span>{" "}
          {ACCESS_LABELS[policy.readAccess]}
        </div>
      </section>

      {/* Danger zone */}
      <section
        className="rounded-xl border border-red-100 bg-white p-5"
        aria-label="Danger zone"
        data-testid="danger-zone"
      >
        <h2 className="mb-1 text-sm font-bold text-red-700">Danger zone</h2>
        <p className="mb-4 text-xs text-[#64748B]">
          Disconnecting this mailbox will stop all sync and remove Slipwise&apos;s access. Existing thread data is retained but will no longer update.
        </p>
        <DisconnectPanel
          displayName={connection.displayName}
          state={disconnectState}
          onInitiate={() => setDisconnectState("confirming")}
          onConfirm={() => setDisconnectState("disconnecting")}
          onCancel={() => setDisconnectState("idle")}
        />
      </section>

      {/* Reconnect flow modal */}
      {showReconnect && (
        <MailboxConnectFlow
          reconnectEmail={connection.emailAddress}
          onClose={() => setShowReconnect(false)}
        />
      )}
    </div>
  );
}
