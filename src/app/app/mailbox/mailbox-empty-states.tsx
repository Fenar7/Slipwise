"use client";

/**
 * Sprint 1.6 — Empty state components for all major mailbox surfaces.
 *
 * Each state is distinct: no-mailboxes, no-threads, no-results, no-selection,
 * and no-linked-records all have different causes and different next actions.
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
} from "lucide-react";

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
 */
export function NoMailboxesEmpty({ isAdmin = false }: { isAdmin?: boolean }) {
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
        <Link
          href="/app/mailbox/settings"
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: "#16294D" }}
          data-testid="connect-mailbox-cta"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Connect a mailbox
        </Link>
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
 */
export function EmptyInboxState({ mailboxLabel }: { mailboxLabel: string }) {
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

// ─── Folder-specific empty states ─────────────────────────────────────────────

export function EmptySentState({ mailboxLabel }: { mailboxLabel: string }) {
  return (
    <EmptyStateShell
      icon={MailOpen}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} is empty`}
      body="No sent conversations yet. Messages you send will appear here."
    />
  );
}

export function EmptyDraftsState({ mailboxLabel }: { mailboxLabel: string }) {
  return (
    <EmptyStateShell
      icon={MailOpen}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} is empty`}
      body="No active drafts. Start composing a new message to create a draft."
    />
  );
}

export function EmptySpamState({ mailboxLabel }: { mailboxLabel: string }) {
  return (
    <EmptyStateShell
      icon={MailOpen}
      iconBg="rgba(22,41,77,0.07)"
      iconColor="#16294D"
      heading={`${mailboxLabel} is empty`}
      body="No spam conversations. Messages marked as spam by your provider will appear here."
    />
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
