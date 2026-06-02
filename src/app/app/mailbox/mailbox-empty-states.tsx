"use client";

/**
 * Sprint 1.6 — Empty state components for all major mailbox surfaces.
 *
 * Each state is distinct: no-mailboxes, no-threads, no-results, no-selection,
 * and no-linked-records all have different causes and different next actions.
 *
 * Phase 6 update: EmptyInboxState is redesigned as a single cohesive
 * thread-list-native component — no duplicated copy, no admin-widget chrome.
 */

import Link from "next/link";
import {
  Inbox,
  MailOpen,
  Search,
  Link2Off,
  Plus,
  Filter,
  ArrowLeft,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";
import { MailboxSyncStateChip } from "./mailbox-sync-status";
import { formatSyncElapsed } from "./mailbox-sync-ui";

// ─── Shared primitive ─────────────────────────────────────────────────────────

function EmptyStateShell({
  icon: Icon,
  iconBg,
  iconColor,
  heading,
  body,
  action,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  heading: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: iconBg }}
        aria-hidden="true"
      >
        <Icon className="h-7 w-7" style={{ color: iconColor }} />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-[#0F172A]">{heading}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{body}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ─── No mailboxes connected ───────────────────────────────────────────────────

/**
 * Shown when the org has no connected mailboxes at all.
 * Admin path: connect a mailbox. Non-admin path: contact admin.
 *
 * When `onConnect` is provided (e.g. inside the settings page), the CTA
 * renders as a button that opens the connect flow inline instead of
 * navigating to the settings page — which would be a no-op when already
 * on settings.
 */
export function NoMailboxesEmpty({
  isAdmin = false,
  onConnect,
}: {
  isAdmin?: boolean;
  onConnect?: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      data-testid="empty-no-mailboxes"
      aria-label="No mailboxes connected"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(22,41,77,0.07)" }}
        aria-hidden="true"
      >
        <Inbox className="h-7 w-7" style={{ color: "#16294D" }} />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-[#0F172A]">No mailboxes connected</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">
          {isAdmin
            ? "Connect a Gmail mailbox to start receiving and managing customer email inside Slipwise."
            : "Your organization hasn't connected a mailbox yet. Ask an admin to connect one to get started."}
        </p>
      </div>
      {isAdmin ? (
        onConnect ? (
          <button
            type="button"
            onClick={onConnect}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: "#16294D" }}
            data-testid="connect-mailbox-cta"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Connect a mailbox
          </button>
        ) : (
          <Link
            href="/app/mailbox/settings"
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: "#16294D" }}
            data-testid="connect-mailbox-cta"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Connect a mailbox
          </Link>
        )
      ) : (
        <p className="text-xs text-[#94A3B8]">
          Contact your organization admin to connect a mailbox.
        </p>
      )}
    </div>
  );
}

// ─── Mailbox connected but inbox is empty ─────────────────────────────────────

/**
 * Shown when a mailbox is connected and healthy but has no threads yet.
 * Distinct from "no results" — this is a genuinely empty inbox.
 *
 * When syncStatus is provided, the entire state is one cohesive component:
 * - A compact status pill
 * - A contextual icon
 * - A strong heading
 * - One concise support paragraph
 * - A single optional CTA (Sync now) only when relevant and not running
 *
 * No duplicated copy. No "admin settings card dropped into the workspace" feel.
 * This component is designed for the narrow thread-list column.
 */
export function EmptyInboxState({
  mailboxLabel,
  syncStatus,
  onSyncNow,
  isSyncPending = false,
  syncError = null,
}: {
  mailboxLabel: string;
  syncStatus?: MailboxSyncPresentation;
  onSyncNow?: () => void;
  isSyncPending?: boolean;
  syncError?: string | null;
}) {
  // ── Sync-aware variants ────────────────────────────────────────────────────

  if (syncStatus?.state === "running") {
    return (
      <SyncAwareInboxEmpty
        mailboxLabel={mailboxLabel}
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
        syncError={syncError}
        testId="empty-inbox-syncing"
      />
    );
  }

  if (syncStatus?.state === "completed_never_imported") {
    return (
      <SyncAwareInboxEmpty
        mailboxLabel={mailboxLabel}
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
        syncError={syncError}
        testId="empty-inbox-waiting"
      />
    );
  }

  if (syncStatus?.state === "failed") {
    return (
      <SyncAwareInboxEmpty
        mailboxLabel={mailboxLabel}
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
        syncError={syncError}
        testId="empty-inbox-failed"
      />
    );
  }

  // ── Standard empty inbox (synced, genuinely empty) ─────────────────────────

  return (
    <EmptyStateShell
      icon={MailOpen}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} is empty`}
      body="No threads here yet. New messages will appear as they arrive. If you expect messages, the mailbox may still be syncing."
    />
  );
}

export function EmptySentState({
  mailboxLabel,
  syncStatus,
  onSyncNow,
  isSyncPending = false,
}: {
  mailboxLabel: string;
  syncStatus?: MailboxSyncPresentation;
  onSyncNow?: () => void;
  isSyncPending?: boolean;
}) {
  if (syncStatus?.state === "running" || syncStatus?.state === "completed_never_imported" || syncStatus?.state === "failed") {
    return (
      <SyncAwareFolderEmpty
        mailboxLabel={mailboxLabel}
        folder="sent mail"
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
      />
    );
  }

  return (
    <EmptyStateShell
      icon={MailOpen}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} has no sent mail`}
      body="Messages you send from this mailbox will appear here. If this mailbox has sent messages, they will appear once syncing completes."
    />
  );
}

export function EmptyDraftsState({
  mailboxLabel,
  syncStatus,
  fetchError,
  onSyncNow,
  isSyncPending = false,
}: {
  mailboxLabel: string;
  syncStatus?: MailboxSyncPresentation;
  fetchError?: string | null;
  onSyncNow?: () => void;
  isSyncPending?: boolean;
}) {
  // Draft-specific degraded state: overall sync completed but draft sync failed
  if (syncStatus?.state === "completed" && syncStatus.draftErrorSummary) {
    const isActivelyRunning = syncStatus.isSyncing || isSyncPending;
    return (
      <EmptyStateShell
        icon={AlertTriangle}
        iconBg="rgba(245,158,11,0.08)"
        iconColor="#F59E0B"
        heading={`${mailboxLabel} drafts are currently unavailable`}
        body={syncStatus.draftErrorSummary}
        action={
          onSyncNow && !isActivelyRunning ? (
            <button
              type="button"
              onClick={onSyncNow}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
              style={{ background: "#16294D" }}
              aria-label="Sync now to retry draft sync"
            >
              Sync now to retry
            </button>
          ) : undefined
        }
      />
    );
  }

  // Fetch-time error: the API call to /api/mailbox/drafts failed
  if (fetchError && !syncStatus?.draftErrorSummary) {
    return (
      <EmptyStateShell
        icon={AlertTriangle}
        iconBg="rgba(245,158,11,0.08)"
        iconColor="#F59E0B"
        heading={`${mailboxLabel} drafts could not be loaded`}
        body={fetchError}
      />
    );
  }

  if (syncStatus?.state === "running" || syncStatus?.state === "completed_never_imported" || syncStatus?.state === "failed") {
    return (
      <SyncAwareFolderEmpty
        mailboxLabel={mailboxLabel}
        folder="drafts"
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
      />
    );
  }

  return (
    <EmptyStateShell
      icon={Inbox}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} has no drafts`}
      body="Gmail drafts and active Slipwise drafts for this mailbox will appear here when available."
    />
  );
}

export function EmptySpamState({
  mailboxLabel,
  syncStatus,
  onSyncNow,
  isSyncPending = false,
}: {
  mailboxLabel: string;
  syncStatus?: MailboxSyncPresentation;
  onSyncNow?: () => void;
  isSyncPending?: boolean;
}) {
  if (syncStatus?.state === "running" || syncStatus?.state === "completed_never_imported" || syncStatus?.state === "failed") {
    return (
      <SyncAwareFolderEmpty
        mailboxLabel={mailboxLabel}
        folder="spam"
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        isSyncPending={isSyncPending}
      />
    );
  }

  return (
    <EmptyStateShell
      icon={AlertTriangle}
      iconBg="rgba(245,158,11,0.08)"
      iconColor="#F59E0B"
      heading={`${mailboxLabel} has no spam conversations`}
      body="Messages marked as spam will appear here when they are available from the mailbox sync."
    />
  );
}

/**
 * Internal: compact, thread-list-native sync state component.
 *
 * Renders a single visual unit:
 *   [status pill]
 *   [icon]
 *   heading
 *   body
 *   [elapsed time — running only]
 *   [Sync now CTA — only when not running and handler is provided]
 *
 * No MailboxSyncSummary card — that is for the settings admin surface.
 */
/**
 * Internal: sync-aware empty state for Sent, Spam, Drafts, and Starred folders.
 * Shows import-in-progress or never-imported states to prevent false empties.
 */
function SyncAwareFolderEmpty({
  mailboxLabel,
  folder,
  syncStatus,
  onSyncNow,
  isSyncPending,
}: {
  mailboxLabel: string;
  folder: string;
  syncStatus: MailboxSyncPresentation;
  onSyncNow?: () => void;
  isSyncPending: boolean;
}) {
  const isActivelyRunning = syncStatus.isSyncing || isSyncPending;
  const heading = (() => {
    if (syncStatus.state === "running") return `Importing ${folder}…`;
    if (syncStatus.state === "failed") return "Sync needs attention";
    return `${mailboxLabel} ${folder} is waiting`;
  })();
  const body = (() => {
    if (syncStatus.state === "running") {
      return `Importing ${folder} from this mailbox. They will appear here automatically.`;
    }
    if (syncStatus.state === "failed") {
      return syncStatus.lastErrorSummary ?? "Sync encountered a problem. Try syncing again.";
    }
    return `Your mailbox is connected but ${folder} haven't been imported yet. Click Sync now to start importing.`;
  })();
  const showSyncCta = !!onSyncNow && !isActivelyRunning;

  const iconBg = syncStatus.state === "failed"
    ? "rgba(245,158,11,0.08)"
    : "rgba(59,130,246,0.08)";

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-5 px-6 py-12 text-center"
      style={{ background: "#F7F8FB" }}
    >
      <MailboxSyncStateChip sync={syncStatus} />
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: iconBg }}
        aria-hidden="true"
      >
        {syncStatus.state === "failed" ? (
          <AlertTriangle className="h-7 w-7" style={{ color: "#F59E0B" }} />
        ) : (
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#3B82F6" }} />
        )}
      </div>
      <div className="max-w-[260px]">
        <p className="text-sm font-semibold text-[#0F172A]">{heading}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{body}</p>
      </div>
      {showSyncCta && (
        <button
          type="button"
          onClick={onSyncNow}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          aria-label="Sync now"
        >
          Sync now
        </button>
      )}
    </div>
  );
}

function SyncAwareInboxEmpty({
  mailboxLabel,
  syncStatus,
  onSyncNow,
  isSyncPending,
  syncError,
  testId,
}: {
  mailboxLabel: string;
  syncStatus: MailboxSyncPresentation;
  onSyncNow?: () => void;
  isSyncPending: boolean;
  syncError?: string | null;
  testId: string;
}) {
  const isActivelyRunning = syncStatus.isSyncing || isSyncPending;

  const heading = (() => {
    if (syncStatus.state === "running") return "Importing messages…";
    if (syncStatus.state === "failed") return "Sync needs attention";
    // completed_never_imported
    return `${mailboxLabel} is ready`;
  })();

  const body = (() => {
    if (syncStatus.state === "running") {
      const threadCount = syncStatus.lastRunThreadCount;
      const messageCount = syncStatus.lastRunMessageCount;
      if (threadCount && threadCount > 0) {
        return `Importing messages (${threadCount} threads, ${messageCount ?? 0} messages so far). Threads will appear here automatically.`;
      }
      return "We're importing recent messages. Threads will appear here automatically.";
    }
    if (syncStatus.state === "failed") {
      return (
        syncError ??
        syncStatus.lastErrorSummary ??
        "Sync encountered a problem. Try syncing again or check mailbox settings."
      );
    }
    // completed_never_imported
    return "Your mailbox is connected. The first sync hasn't completed yet — click Sync now to start importing.";
  })();

  const iconBg = (() => {
    if (syncStatus.state === "failed") return "rgba(245,158,11,0.08)";
    if (syncStatus.state === "running") return "rgba(59,130,246,0.08)";
    return "rgba(22,41,77,0.07)";
  })();

  const elapsed = syncStatus.state === "running"
    ? formatSyncElapsed(syncStatus.currentRunStartedAt)
    : null;

  // Show "Sync now" CTA when not running and not pending — including when
  // the run is stalled/failed so the user can retry.
  const showSyncCta =
    !!onSyncNow &&
    !isActivelyRunning &&
    syncStatus.state !== "running";

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-5 px-6 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      data-testid={testId}
    >
      {/* Status pill — truth-anchored, not decorative */}
      <MailboxSyncStateChip sync={syncStatus} />

      {/* Contextual icon */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: iconBg }}
        aria-hidden="true"
      >
        {syncStatus.state === "running" ? (
          <Loader2
            className="h-7 w-7 animate-spin"
            style={{ color: "#3B82F6" }}
          />
        ) : syncStatus.state === "failed" ? (
          <AlertTriangle className="h-7 w-7" style={{ color: "#F59E0B" }} />
        ) : (
          <Inbox className="h-7 w-7" style={{ color: "#16294D" }} />
        )}
      </div>

      {/* Copy block — single source of truth, no duplicates */}
      <div className="max-w-[260px]">
        <p className="text-sm font-semibold text-[#0F172A]">{heading}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{body}</p>
        {elapsed && (
          <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">{elapsed}</p>
        )}
      </div>

      {/* Single CTA — only when not running and a handler is wired */}
      {showSyncCta && (
        <button
          type="button"
          onClick={onSyncNow}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          data-testid="sync-now-cta"
          aria-label="Sync now"
        >
          Sync now
        </button>
      )}
    </div>
  );
}

// ─── No thread selected ───────────────────────────────────────────────────────

/**
 * Shown in the reading pane when no thread is selected.
 * Already exists as MailboxReadingPaneEmpty — this is the canonical Sprint 1.6 version
 * with richer context.
 */
export function NoThreadSelectedEmpty({ viewLabel }: { viewLabel?: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="No thread selected"
      data-testid="empty-no-thread-selected"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "rgba(22,41,77,0.06)" }}
        aria-hidden="true"
      >
        <MailOpen className="h-6 w-6" style={{ color: "#16294D" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">Select a thread to read</p>
        <p className="mt-1 text-xs text-[#64748B]">
          {viewLabel
            ? `Choose a conversation from ${viewLabel} to view its messages here.`
            : "Choose a conversation from the list to view its messages here."}
        </p>
      </div>
    </div>
  );
}

export function NoDraftSelectedEmpty({ mailboxLabel }: { mailboxLabel?: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="No draft selected"
      data-testid="empty-no-draft-selected"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "rgba(22,41,77,0.06)" }}
        aria-hidden="true"
      >
        <Inbox className="h-6 w-6" style={{ color: "#16294D" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">Select a draft to edit</p>
        <p className="mt-1 text-xs text-[#64748B]">
          {mailboxLabel
            ? `Choose a saved draft from ${mailboxLabel} to continue editing it here.`
            : "Choose a saved draft from the list to continue editing it here."}
        </p>
      </div>
    </div>
  );
}

// ─── No search / filter results ───────────────────────────────────────────────

/**
 * Shown when search or active filters return zero threads.
 * Distinct from empty inbox — the data exists, just nothing matches.
 */
export function NoSearchResultsEmpty({
  query,
  hasActiveFilters,
  onClearFilters,
}: {
  query?: string;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}) {
  const isFiltered = hasActiveFilters || !!query;

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="No results"
      data-testid="empty-no-results"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(100,116,139,0.08)" }}
        aria-hidden="true"
      >
        <Search className="h-7 w-7 text-[#94A3B8]" />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-[#0F172A]">
          {query ? `No results for "${query}"` : "No threads match"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">
          {isFiltered
            ? "Try adjusting your search or removing active filters to see more threads."
            : "There are no threads in this view right now."}
        </p>
      </div>
      {isFiltered && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── No linked records ────────────────────────────────────────────────────────

/**
 * Shown in the context panel when a thread has no linked records and no suggestions.
 */
export function NoLinkedRecordsEmpty({ onLinkRecord }: { onLinkRecord?: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-4 py-8 text-center"
      aria-label="No linked records"
      data-testid="no-links-state"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: "rgba(100,116,139,0.08)" }}
        aria-hidden="true"
      >
        <Link2Off className="h-5 w-5 text-[#94A3B8]" />
      </div>
      <div>
        <p className="text-xs font-semibold text-[#334155]">No linked records</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
          Link this thread to a customer, invoice, quote, or voucher to track it in context.
        </p>
      </div>
      <button
        onClick={onLinkRecord}
        className="flex items-center gap-1 rounded-lg border border-[#E2E5EA] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
        data-testid="link-record-btn"
        aria-label="Link a record to this thread"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Link a record
      </button>
    </div>
  );
}

// ─── Thread not found or unavailable ───────────────────────────────────────────

/**
 * Shown when a thread ID is selected but the thread is not found,
 * inaccessible, or no longer belongs to the current result set.
 */
export function ThreadNotFoundEmpty({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="Thread not found"
      data-testid="empty-thread-not-found"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "rgba(220,38,38,0.06)" }}
        aria-hidden="true"
      >
        <MailOpen className="h-6 w-6" style={{ color: "#DC2626" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">Thread unavailable</p>
        <p className="mt-1 text-xs text-[#64748B]">
          This thread was not found or you no longer have access to it. It may have been moved, deleted, or removed from this view.
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="mt-1 flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          data-testid="dismiss-thread-not-found"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to thread list
        </button>
      )}
    </div>
  );
}

export function ThreadLoadErrorEmpty({
  message,
  onRetry,
  onDismiss,
}: {
  message?: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="Thread could not be loaded"
      data-testid="empty-thread-load-error"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "rgba(245,158,11,0.12)" }}
        aria-hidden="true"
      >
        <AlertTriangle className="h-6 w-6 text-amber-600" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-[#0F172A]">This thread couldn&apos;t be loaded</p>
        <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
          {message?.trim() || "Try again. If the problem continues, refresh the mailbox and retry."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[#16294D] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-[#D7DDE6] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            Back to list
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Smart view empty (no threads in view) ────────────────────────────────────

/**
 * Shown when a smart view (Assigned to me, Flagged, etc.) has no threads.
 * Explains the view semantics rather than implying the inbox is empty.
 */
export function SmartViewEmpty({
  viewLabel,
  viewDescription,
  onBack,
}: {
  viewLabel: string;
  viewDescription: string;
  onBack?: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label={`${viewLabel} is empty`}
      data-testid="empty-smart-view"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(22,41,77,0.06)" }}
        aria-hidden="true"
      >
        <Inbox className="h-7 w-7" style={{ color: "#16294D" }} />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-[#0F172A]">Nothing in {viewLabel}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{viewDescription}</p>
      </div>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to All Inboxes
        </button>
      )}
    </div>
  );
}
