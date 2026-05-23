"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { MailboxAdminConnection, MailboxConnectionStatus } from "../types";
import { NoMailboxesEmpty } from "../mailbox-empty-states";
import { MailboxConnectFlow } from "./mailbox-connect-flow";
import { useMailboxAdminConnections } from "../use-mailbox-admin-connections";
import { SettingsPageSkeleton } from "../mailbox-skeleton-states";
import {
  MailboxSyncStateChip,
  MailboxSyncSummary,
} from "../mailbox-sync-status";
import {
  canManuallySyncMailbox,
  resolveMailboxSyncPresentation,
  withPendingSyncPresentation,
} from "../mailbox-sync-ui";
import { useMailboxSyncAction } from "../use-mailbox-sync-action";

// ─── Callback feedback banner ─────────────────────────────────────────────────

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  gmail_wrong_account:
    "The Google account you authorized does not match the mailbox being reconnected. Please sign in with the same account that was originally connected.",
  gmail_invalid_state:
    "The authorization request was invalid or expired. Please try connecting again.",
  gmail_state_expired:
    "The authorization session expired. Please try connecting again.",
  gmail_auth_required:
    "You must be signed in to connect a mailbox.",
  gmail_rate_limited:
    "Too many connection attempts. Please wait a moment and try again.",
  gmail_auth_failed:
    "Google rejected the authorization or token exchange. Please try connecting again.",
  gmail_internal_error:
    "Slipwise could not save the Gmail mailbox connection. Please try again.",
  gmail_provider_error:
    "Gmail returned an unexpected provider error. Please try again.",
  gmail_duplicate_account:
    "This Gmail account is already connected. Reconnect the existing mailbox instead of creating a duplicate.",
  gmail_failed:
    "Gmail authorization failed. Please try again.",
  gmail_missing_params:
    "The authorization response from Google was incomplete. Please try again.",
  gmail_connection_not_found:
    "The mailbox you were trying to reconnect was not found. It may have been removed.",
  gmail_not_configured:
    "Gmail OAuth is not configured on this server. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI to your environment variables, then restart the server.",
  gmail_connect_failed:
    "The Gmail connection could not be started. Please check server configuration and try again.",
};

function CallbackFeedbackBanner() {
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");

  if (connectedParam === "gmail" || connectedParam === "gmail_reconnected") {
    const isReconnect = connectedParam === "gmail_reconnected";
    return (
      <div
        className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3"
        data-testid="callback-success-banner"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <p className="text-sm font-medium text-green-800">
          {isReconnect
            ? "Mailbox reconnected successfully. Sync will resume shortly."
            : "Gmail mailbox connected. Initial sync will begin shortly."}
        </p>
      </div>
    );
  }

  if (errorParam) {
    const message =
      CALLBACK_ERROR_MESSAGES[errorParam] ??
      "An error occurred during Gmail authorization. Please try again.";
    return (
      <div
        className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        data-testid="callback-error-banner"
        role="alert"
        aria-live="assertive"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        <p className="text-sm font-medium text-red-800">{message}</p>
      </div>
    );
  }

  return null;
}

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

function formatVisibilityPolicy(policy: string): string {
  switch (policy) {
    case "org_shared":
      return "Shared with org";
    case "admin_only":
      return "Admins only";
    case "restricted":
      return "Restricted";
    default:
      return policy;
  }
}

function ConnectionCard({
  connection,
  onSyncNow,
  isSyncPending = false,
  syncError = null,
}: {
  connection: MailboxAdminConnection;
  onSyncNow?: (connectionId: string) => void;
  isSyncPending?: boolean;
  syncError?: string | null;
}) {
  const needsReconnect = connection.status === "reconnect_required";
  const sync = withPendingSyncPresentation(
    resolveMailboxSyncPresentation(connection),
    isSyncPending,
  );
  const canSync = canManuallySyncMailbox(connection.status);

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

      {/* Sync status */}
      {!needsReconnect && (
        <div className="mt-4">
          <MailboxSyncSummary
            sync={sync}
            error={syncError}
            action={
              canSync ? (
                <button
                  type="button"
                  onClick={() => onSyncNow?.(connection.id)}
                  disabled={sync.isSyncing || isSyncPending}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    sync.isSyncing || isSyncPending
                      ? "cursor-not-allowed bg-[#E2E8F0] text-[#64748B]"
                      : "bg-[#16294D] text-white hover:opacity-90",
                  )}
                  data-testid={`sync-now-${connection.id}`}
                >
                  {sync.isSyncing || isSyncPending ? "Syncing…" : "Sync now"}
                </button>
              ) : undefined
            }
          />
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
            {formatVisibilityPolicy(connection.visibilityPolicy)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

import type { MailboxAdminConnectionsErrorType } from "../use-mailbox-admin-connections";

export function MailboxSettingsPageContent({
  connections = [],
  isLoading = false,
  error = null,
  errorType = null,
  onSyncNow,
  isSyncPending,
  getSyncError,
}: {
  connections?: MailboxAdminConnection[];
  isLoading?: boolean;
  error?: string | null;
  errorType?: MailboxAdminConnectionsErrorType;
  onSyncNow?: (connectionId: string) => void;
  isSyncPending?: (connectionId: string) => boolean;
  getSyncError?: (connectionId: string) => string | null;
}) {
  const [showConnectFlow, setShowConnectFlow] = useState(false);
  const hasConnections = connections.length > 0;
  const syncingConnections = connections.filter(
    (connection) => resolveMailboxSyncPresentation(connection).isSyncing,
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
        <SettingsPageSkeleton />
      </div>
    );
  }

  // Auth/permission errors: show truthful message, not the red failure banner.
  if (errorType === "forbidden") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Admins only</p>
          <p className="mt-1 text-xs text-amber-700">
            You do not have permission to manage mailbox connections. Contact your organization admin.
          </p>
        </div>
      </div>
    );
  }

  if (errorType === "unauthorized") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Sign in required</p>
          <p className="mt-1 text-xs text-amber-700">
            Please sign in to view mailbox settings.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-800">Failed to load mailbox connections</p>
          <p className="mt-1 text-xs text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8" data-testid="mailbox-settings-page">
      {/* Callback feedback banner (from OAuth redirect) */}
      <CallbackFeedbackBanner />

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

      {hasConnections ? (
        <>
          {syncingConnections.length > 0 && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-blue-900">Mailbox sync in progress</p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-800">
                    Slipwise is importing messages from {syncingConnections.length} connected mailbox{syncingConnections.length !== 1 ? "es" : ""}. New threads will appear automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

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
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                onSyncNow={onSyncNow}
                isSyncPending={isSyncPending?.(connection.id) ?? false}
                syncError={getSyncError?.(connection.id) ?? null}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E2E5EA] bg-white" data-testid="settings-empty-state">
          <NoMailboxesEmpty isAdmin={true} onConnect={() => setShowConnectFlow(true)} />
        </div>
      )}

      {/* Connect flow modal */}
      {showConnectFlow && (
        <MailboxConnectFlow onClose={() => setShowConnectFlow(false)} />
      )}
    </div>
  );
}

export default function MailboxSettingsPage() {
  const searchParams = useSearchParams();
  const { connections, isLoading, error, errorType, refetch } = useMailboxAdminConnections();
  const { triggerSync, isPending, getError } = useMailboxSyncAction({
    onSuccess: async () => {
      refetch();
    },
  });
  const autoSyncTriggeredRef = useRef(false);

  useEffect(() => {
    if (autoSyncTriggeredRef.current) return;
    if (searchParams.get("connected") !== "gmail") return;
    if (isLoading || connections.length === 0) return;

    const initialImportCandidate = [...connections]
      .filter((connection) => resolveMailboxSyncPresentation(connection).state === "completed_never_imported")
      .sort((a, b) => {
        const aUpdatedAt = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bUpdatedAt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bUpdatedAt - aUpdatedAt;
      })[0];

    if (!initialImportCandidate) return;

    autoSyncTriggeredRef.current = true;
    void triggerSync(initialImportCandidate.id);
  }, [connections, isLoading, searchParams, triggerSync]);

  return (
    <MailboxSettingsPageContent
      connections={connections}
      isLoading={isLoading}
      error={error}
      errorType={errorType}
      onSyncNow={(connectionId) => {
        void triggerSync(connectionId);
      }}
      isSyncPending={isPending}
      getSyncError={getError}
    />
  );
}
