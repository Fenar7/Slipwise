"use client";

/**
 * Sprint 1.6 — Restricted, degraded, and reconnect-required state components.
 *
 * These are distinct from empty states:
 * - Restricted: user lacks permission (not a data absence)
 * - Degraded: mailbox exists and is connected but sync is unreliable
 * - Reconnect required: auth expired; admin action needed
 *
 * Each state is honest about the cause and points to the right next action.
 */

import Link from "next/link";
import { ShieldOff, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import type { MailboxRestrictedReason, MailboxDegradedReason } from "./types";

// ─── Restricted access ────────────────────────────────────────────────────────

const RESTRICTED_COPY: Record<
  MailboxRestrictedReason,
  { heading: string; body: string; guidance: string | null }
> = {
  no_permission: {
    heading: "You don't have access to this mailbox",
    body: "This mailbox is restricted to specific roles. You can view threads you're assigned to, but you can't browse this inbox.",
    guidance: "Contact your organization admin to request access.",
  },
  admin_only: {
    heading: "Admin-only area",
    body: "This section is only accessible to organization admins. It contains mailbox connection settings and governance controls.",
    guidance: "If you need to make changes here, ask an admin.",
  },
  mailbox_not_visible: {
    heading: "Mailbox not available",
    body: "This mailbox isn't visible to your account. It may be restricted to a specific team or role.",
    guidance: "Contact your admin if you believe you should have access.",
  },
  org_suspended: {
    heading: "Organization access suspended",
    body: "Mailbox access is currently suspended for your organization. This is typically due to a billing or compliance issue.",
    guidance: "Contact your organization owner to resolve this.",
  },
};

/**
 * Full-pane restricted state — used when the entire mailbox or surface is inaccessible.
 */
export function MailboxRestrictedState({
  reason,
  mailboxLabel,
}: {
  reason: MailboxRestrictedReason;
  mailboxLabel?: string;
}) {
  const copy = RESTRICTED_COPY[reason];

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label={copy.heading}
      data-testid={`restricted-state-${reason}`}
      role="status"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(220,38,38,0.07)" }}
        aria-hidden="true"
      >
        {reason === "admin_only" ? (
          <Lock className="h-7 w-7 text-[#DC2626]" />
        ) : (
          <ShieldOff className="h-7 w-7 text-[#DC2626]" />
        )}
      </div>
      <div className="max-w-sm">
        {mailboxLabel && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
            {mailboxLabel}
          </p>
        )}
        <p className="text-sm font-semibold text-[#0F172A]">{copy.heading}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{copy.body}</p>
        {copy.guidance && (
          <p className="mt-2 text-xs text-[#94A3B8]">{copy.guidance}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Inline restricted notice — used inside a panel or card when only part of a surface is restricted.
 */
export function InlineRestrictedNotice({
  reason = "no_permission",
}: {
  reason?: MailboxRestrictedReason;
}) {
  const copy = RESTRICTED_COPY[reason];
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-3 py-3"
      role="status"
      data-testid="inline-restricted-notice"
    >
      <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-[#94A3B8]" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold text-[#334155]">{copy.heading}</p>
        {copy.guidance && (
          <p className="mt-0.5 text-[11px] text-[#94A3B8]">{copy.guidance}</p>
        )}
      </div>
    </div>
  );
}

// ─── Reconnect required ───────────────────────────────────────────────────────

/**
 * Full-pane reconnect state — shown when a mailbox's auth has expired.
 * This is an admin-actionable state, not a user error.
 */
export function ReconnectRequiredState({
  mailboxLabel,
  emailAddress,
  connectionId,
  lastSyncError,
  isAdmin = false,
}: {
  mailboxLabel: string;
  emailAddress: string;
  connectionId: string;
  lastSyncError?: string | null;
  isAdmin?: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label={`${mailboxLabel} requires reconnection`}
      data-testid={`reconnect-required-${connectionId}`}
      role="status"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(217,119,6,0.09)" }}
        aria-hidden="true"
      >
        <AlertTriangle className="h-7 w-7 text-amber-600" />
      </div>
      <div className="max-w-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Reconnect required
        </p>
        <p className="mt-1 text-sm font-semibold text-[#0F172A]">
          {mailboxLabel} is disconnected
        </p>
        <p className="mt-1 text-xs text-[#64748B]">{emailAddress}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
          {lastSyncError ??
            "The authorization for this mailbox has expired. No new messages are being received until it's reconnected."}
        </p>
        {!isAdmin && (
          <p className="mt-2 text-xs text-[#94A3B8]">
            Contact your organization admin to reconnect this mailbox.
          </p>
        )}
      </div>
      {isAdmin && (
        <Link
          href={`/app/mailbox/settings/connections/${connectionId}?action=reconnect`}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          data-testid={`reconnect-cta-${connectionId}`}
        >
          Reconnect mailbox
        </Link>
      )}
    </div>
  );
}

/**
 * Inline reconnect banner — used in the thread list or left rail when a mailbox
 * needs reconnection but the user is still viewing other content.
 */
export function ReconnectBanner({
  mailboxLabel,
  connectionId,
  isAdmin = false,
}: {
  mailboxLabel: string;
  connectionId: string;
  isAdmin?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5"
      role="status"
      aria-label={`${mailboxLabel} requires reconnection`}
      data-testid={`reconnect-banner-${connectionId}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-800">
          {mailboxLabel} — reconnect required
        </p>
        <p className="text-[11px] text-amber-700">
          No new messages until this mailbox is reconnected.
        </p>
      </div>
      {isAdmin && (
        <Link
          href={`/app/mailbox/settings/connections/${connectionId}?action=reconnect`}
          className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
          aria-label={`Reconnect ${mailboxLabel}`}
        >
          Reconnect
        </Link>
      )}
    </div>
  );
}

// ─── Degraded mailbox health ──────────────────────────────────────────────────

const DEGRADED_COPY: Record<
  MailboxDegradedReason,
  { heading: string; body: string }
> = {
  sync_lag: {
    heading: "Sync is running behind",
    body: "Messages may be delayed. The mailbox is connected but sync is taking longer than expected.",
  },
  partial_failure: {
    heading: "Some messages couldn't be loaded",
    body: "A portion of recent messages failed to sync. The mailbox is partially available. Older threads are unaffected.",
  },
  watch_expired: {
    heading: "Real-time updates paused",
    body: "The push subscription for this mailbox has expired. New messages will still arrive, but with a short delay while polling catches up.",
  },
  rate_limited: {
    heading: "Sync temporarily throttled",
    body: "The mailbox provider has rate-limited sync requests. Messages will continue to arrive, but updates may be slower than usual.",
  },
};

/**
 * Inline degraded health banner — shown at the top of the thread list or reading pane.
 * Does not block the UI; the mailbox is still usable.
 */
export function DegradedHealthBanner({
  reason,
  mailboxLabel,
  detectedAt,
}: {
  reason: MailboxDegradedReason;
  mailboxLabel: string;
  detectedAt?: string;
}) {
  const copy = DEGRADED_COPY[reason];

  const timeLabel = detectedAt
    ? new Date(detectedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 px-4 py-2.5"
      role="status"
      aria-label={`${mailboxLabel} sync degraded`}
      data-testid={`degraded-banner-${reason}`}
    >
      <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-800">
          {mailboxLabel} — {copy.heading.toLowerCase()}
        </p>
        <p className="text-[11px] text-amber-700">
          {copy.body}
          {timeLabel && ` Detected at ${timeLabel}.`}
        </p>
      </div>
    </div>
  );
}

/**
 * Full-pane degraded state — used when the mailbox is so degraded that
 * showing stale content would be misleading.
 */
export function DegradedMailboxState({
  reason,
  mailboxLabel,
  detectedAt,
  requiresAdminAction,
  connectionId,
}: {
  reason: MailboxDegradedReason;
  mailboxLabel: string;
  detectedAt: string;
  requiresAdminAction: boolean;
  connectionId: string;
}) {
  const copy = DEGRADED_COPY[reason];

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label={`${mailboxLabel} is degraded`}
      data-testid={`degraded-state-${connectionId}`}
      role="status"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(217,119,6,0.09)" }}
        aria-hidden="true"
      >
        <RefreshCw className="h-7 w-7 text-amber-500" />
      </div>
      <div className="max-w-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Sync degraded
        </p>
        <p className="mt-1 text-sm font-semibold text-[#0F172A]">{copy.heading}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#64748B]">{copy.body}</p>
        <p className="mt-1.5 text-[11px] text-[#94A3B8]">
          Detected{" "}
          {new Date(detectedAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {requiresAdminAction && (
          <p className="mt-2 text-xs text-[#94A3B8]">
            An admin may need to reconnect or review this mailbox.
          </p>
        )}
      </div>
      {requiresAdminAction && (
        <Link
          href={`/app/mailbox/settings/connections/${connectionId}`}
          className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
        >
          View mailbox settings
        </Link>
      )}
    </div>
  );
}
