"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Users,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { DisconnectConfirmState } from "../../../types";
import { MailboxConnectFlow } from "../../mailbox-connect-flow";

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
              This will end this mailbox&apos;s connection on Slipwise and stop all new sync immediately. Slipwise will attempt to revoke its Google authorization — if that succeeds, no further access occurs. Existing thread data is retained.
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

interface FetchedConnection {
  id: string;
  displayName: string;
  emailAddress: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  connectedBy: string;
  provider: string;
  visibilityPolicy: string;
}

function formatVisibilityPolicy(policy: string): string {
  switch (policy) {
    case "org_shared":
      return "Shared with organization";
    case "admin_only":
      return "Admins only";
    case "restricted":
      return "Restricted";
    default:
      return policy;
  }
}

export function ConnectionDetailClient({ connectionId }: ConnectionDetailClientProps) {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<FetchedConnection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [disconnectState, setDisconnectState] = useState<DisconnectConfirmState>("idle");
  const [showReconnect, setShowReconnect] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const shouldOpenReconnect = searchParams.get("action") === "reconnect";

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [visibilityDraft, setVisibilityDraft] = useState("org_shared");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/mailbox/connections/${connectionId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setConnection(null);
          } else {
            throw new Error(`Failed to load connection: ${res.status}`);
          }
        } else {
          const data = (await res.json()) as { connection?: FetchedConnection };
          const conn = data.connection ?? null;
          if (!cancelled) {
            setConnection(conn);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [connectionId]);

  useEffect(() => {
    if (disconnectState !== "disconnecting") return;

    async function doDisconnect() {
      try {
        const res = await fetch("/api/mailbox/gmail/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Disconnect failed: ${res.status}` }));
          throw new Error(body.error ?? `Disconnect failed: ${res.status}`);
        }
        setDisconnectState("disconnected");
        window.setTimeout(() => {
          window.location.href = "/app/mailbox/settings";
        }, 1200);
      } catch (err) {
        setDisconnectError(err instanceof Error ? err.message : "Disconnect failed");
        setDisconnectState("idle");
      }
    }
    doDisconnect();
  }, [disconnectState, connectionId]);

  useEffect(() => {
    if (!connection || !shouldOpenReconnect) return;
    setShowReconnect(true);
  }, [connection, shouldOpenReconnect]);

  useEffect(() => {
    if (connection) {
      setDisplayNameDraft(connection.displayName);
      setVisibilityDraft(connection.visibilityPolicy);
    }
  }, [connection]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-detail-loading">
        <div className="flex items-center gap-2 text-sm text-[#64748B]">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading connection…
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-detail-error">
        <p className="text-sm text-red-700">{fetchError}</p>
        <Link href="/app/mailbox/settings" className="mt-2 text-sm font-medium text-[#16294D] underline">
          Back to mailbox settings
        </Link>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-not-found">
        <p className="text-sm text-[#64748B]">Mailbox connection not found.</p>
        <Link href="/app/mailbox/settings" className="mt-2 text-sm font-medium text-[#16294D] underline">
          Back to mailbox settings
        </Link>
      </div>
    );
  }

  const needsReconnect = connection.status === "reconnect_required" || connection.status === "RECONNECT_REQUIRED";
  const isDisconnected = connection.status === "disconnected" || connection.status === "DISCONNECTED";

  if (isDisconnected) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8" data-testid="connection-disconnected-state">
        <Link
          href="/app/mailbox/settings"
          className="mb-6 flex items-center gap-1.5 text-xs font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Mailbox connections
        </Link>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm font-semibold text-gray-700">This mailbox is no longer connected</p>
          <p className="mt-1 text-xs text-gray-500">
            This connection has been disconnected and is no longer active on Slipwise. If you want to use this mailbox again, connect a new mailbox.
          </p>
        </div>
      </div>
    );
  }

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
            Connected by {connection.connectedBy}
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
            <dd className="mt-0.5 font-medium text-[#334155] capitalize">{connection.status.replace("_", " ").toLowerCase()}</dd>
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
        </dl>
      </section>

      {/* Settings form — Display Name & Visibility Policy */}
      <section className="mb-6 rounded-xl border border-[#E2E5EA] bg-white p-5" aria-label="Mailbox settings form">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#16294D]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#0F172A]">Mailbox settings</h2>
        </div>

        {/* Display Name */}
        <div className="mb-5">
          <label htmlFor="display-name-input" className="mb-1.5 block text-xs font-semibold text-[#334155]">
            Display name
          </label>
          <input
            id="display-name-input"
            type="text"
            value={displayNameDraft}
            onChange={(e) => setDisplayNameDraft(e.target.value)}
            maxLength={100}
            className="w-full rounded-lg border border-[#E2E5EA] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#16294D] focus:ring-1 focus:ring-[#16294D]/20"
            data-testid="display-name-input"
            placeholder="Enter a display name"
          />
          <p className="mt-1 text-[11px] text-[#94A3B8]">{displayNameDraft.length}/100 characters</p>
        </div>

        {/* Visibility Policy */}
        <div>
          <p className="mb-2 text-xs font-semibold text-[#334155]">Mailbox visibility</p>
          <p className="mb-3 text-xs text-[#64748B]">
            Controls who in the organization can access this mailbox.
          </p>
          <div className="space-y-2.5">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                visibilityDraft === "org_shared"
                  ? "border-[#16294D] bg-[#F1F3F7]"
                  : "border-[#E2E5EA] bg-white hover:bg-[#F7F8FB]",
              )}
              data-testid="visibility-option-org_shared"
            >
              <input
                type="radio"
                name="visibilityPolicy"
                value="org_shared"
                checked={visibilityDraft === "org_shared"}
                onChange={() => setVisibilityDraft("org_shared")}
                className="mt-0.5 h-4 w-4 accent-[#16294D]"
              />
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">Shared with organization</p>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  Any authorized member of the organization can read and triage email threads.
                </p>
              </div>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                visibilityDraft === "admin_only"
                  ? "border-[#16294D] bg-[#F1F3F7]"
                  : "border-[#E2E5EA] bg-white hover:bg-[#F7F8FB]",
              )}
              data-testid="visibility-option-admin_only"
            >
              <input
                type="radio"
                name="visibilityPolicy"
                value="admin_only"
                checked={visibilityDraft === "admin_only"}
                onChange={() => setVisibilityDraft("admin_only")}
                className="mt-0.5 h-4 w-4 accent-[#16294D]"
              />
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">Admins only</p>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  Only organization administrators can access this mailbox.
                </p>
              </div>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                visibilityDraft === "restricted"
                  ? "border-[#16294D] bg-[#F1F3F7]"
                  : "border-[#E2E5EA] bg-white hover:bg-[#F7F8FB]",
              )}
              data-testid="visibility-option-restricted"
            >
              <input
                type="radio"
                name="visibilityPolicy"
                value="restricted"
                checked={visibilityDraft === "restricted"}
                onChange={() => setVisibilityDraft("restricted")}
                className="mt-0.5 h-4 w-4 accent-[#16294D]"
              />
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">Restricted</p>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  Limited to specifically designated users (access enforcement scoped to Sprint 7.2).
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={async () => {
              setIsSaving(true);
              setSaveError(null);
              try {
                const res = await fetch(`/api/mailbox/connections/${connectionId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    displayName: displayNameDraft,
                    visibilityPolicy: visibilityDraft,
                  }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({ error: `Save failed: ${res.status}` }));
                  throw new Error(body.error ?? `Save failed: ${res.status}`);
                }
                const data = (await res.json()) as { connection?: FetchedConnection };
                if (data.connection) {
                  setConnection(data.connection);
                }
                toast.success("Mailbox settings saved");
              } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to save settings";
                setSaveError(message);
                toast.error(message);
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-[#16294D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="save-settings-btn"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          {saveError && (
            <p className="text-xs text-red-600" data-testid="save-error">
              {saveError}
            </p>
          )}
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
          Disconnecting stops all sync immediately and ends this mailbox&apos;s session on Slipwise. Slipwise will attempt to revoke its Google authorization. Existing thread data is retained but will no longer update.
        </p>
        <DisconnectPanel
          displayName={connection.displayName}
          state={disconnectState}
          onInitiate={() => setDisconnectState("confirming")}
          onConfirm={() => setDisconnectState("disconnecting")}
          onCancel={() => {
            setDisconnectState("idle");
            setDisconnectError(null);
          }}
        />
        {disconnectError && (
          <p className="mt-2 text-xs text-red-600">{disconnectError}</p>
        )}
      </section>

      {/* Reconnect flow modal */}
      {showReconnect && (
        <MailboxConnectFlow
          reconnectEmail={connection.emailAddress}
          reconnectConnectionId={connection.id}
          onClose={() => setShowReconnect(false)}
        />
      )}
    </div>
  );
}
