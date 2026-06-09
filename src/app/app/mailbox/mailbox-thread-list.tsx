"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MailboxSearchMeta } from "@/lib/mailbox/thread-service";
import { getFriendlyDegradedMessage } from "./mailbox-empty-states";
import {
  Paperclip,
  Flag,
  UserCircle2,
  Archive,
  Trash2,
  MailOpen,
  MoreHorizontal,
  Loader2,
  Mail,
} from "lucide-react";

export interface ThreadRowData {
  id: string;
  mailboxConnectionId: string;
  subject: string;
  snippet: string;
  from: string;
  fromInitial: string;
  fromColor: string;
  timestamp: string;
  isUnread: boolean;
  isFlagged: boolean;
  hasAttachment: boolean;
  mailboxLabel: string;
  mailboxColor: string;
  assignee?: string;
  status: "open" | "pending" | "closed" | "archived";
}

/** @deprecated Use real thread data from useMailboxThreads hook. Kept for reference. */
export const MOCK_THREADS: ThreadRowData[] = [
  {
    id: "t1",
    mailboxConnectionId: "conn_billing",
    subject: "Invoice #INV-2026-0412 — Payment overdue",
    snippet: "Hi, I wanted to follow up on the invoice we sent last week. Could you confirm the payment status?",
    from: "Priya Sharma",
    fromInitial: "P",
    fromColor: "#7C3AED",
    timestamp: "10:42 AM",
    isUnread: true,
    isFlagged: true,
    hasAttachment: false,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    assignee: "You",
    status: "open",
  },
  {
    id: "t2",
    mailboxConnectionId: "conn_billing",
    subject: "Re: Quote QT-2026-0089 — Revised pricing",
    snippet: "Thanks for the revised quote. We've reviewed it internally and have a few questions before we proceed.",
    from: "Arjun Mehta",
    fromInitial: "A",
    fromColor: "#0891B2",
    timestamp: "9:15 AM",
    isUnread: true,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    status: "open",
  },
  {
    id: "t3",
    mailboxConnectionId: "conn_accounts",
    subject: "Voucher VCH-2026-0031 — Approval needed",
    snippet: "Please find attached the voucher for the March services. Kindly approve at your earliest convenience.",
    from: "Neha Kapoor",
    fromInitial: "N",
    fromColor: "#C05092",
    timestamp: "Yesterday",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Accounts",
    mailboxColor: "#D97706",
    status: "pending",
  },
  {
    id: "t4",
    mailboxConnectionId: "conn_billing",
    subject: "Statement of account — April 2026",
    snippet: "Please find the attached statement of account for April 2026. Let us know if you have any queries.",
    from: "Ravi Nair",
    fromInitial: "R",
    fromColor: "#16A34A",
    timestamp: "Yesterday",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    assignee: "Meera",
    status: "open",
  },
  {
    id: "t5",
    mailboxConnectionId: "conn_support",
    subject: "Support: Unable to download invoice PDF",
    snippet: "Hi team, I'm trying to download the invoice PDF from the portal but keep getting an error. Can you help?",
    from: "Sunita Rao",
    fromInitial: "S",
    fromColor: "#DC2626",
    timestamp: "May 7",
    isUnread: true,
    isFlagged: false,
    hasAttachment: false,
    mailboxLabel: "Support",
    mailboxColor: "#2563EB",
    status: "open",
  },
  {
    id: "t6",
    mailboxConnectionId: "conn_accounts",
    subject: "Re: TDS certificate for FY 2025-26",
    snippet: "We've processed the TDS certificate. Please find it attached. Let us know if you need any corrections.",
    from: "Vikram Joshi",
    fromInitial: "V",
    fromColor: "#64748B",
    timestamp: "May 6",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Accounts",
    mailboxColor: "#D97706",
    status: "closed",
  },
];

const STATUS_STYLES: Record<ThreadRowData["status"], string> = {
  open: "bg-blue-50 text-blue-700",
  pending: "bg-amber-50 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
  archived: "bg-gray-100 text-gray-500",
};

import type { ThreadAction } from "./use-thread-action";
import type { MailboxMessageResultItem } from "./use-mailbox-threads";

interface QuickActionsProps {
  threadId: string;
  status: ThreadRowData["status"];
  isUnread: boolean;
  isFlagged: boolean;
  isLoading: boolean;
  onAction: (threadId: string, action: ThreadAction) => void;
}

function QuickActions({ threadId, status, isUnread, isFlagged, isLoading, onAction }: QuickActionsProps) {
  const isArchived = status === "archived";
  return (
    <div
      className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-[#E2E5EA] bg-white p-0.5 shadow-sm group-hover:flex"
      role="toolbar"
      aria-label={`Quick actions for thread ${threadId}`}
      // Stop click from propagating to the row button
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] disabled:opacity-50"
        title={isUnread ? "Mark as read" : "Mark as unread"}
        aria-label={isUnread ? "Mark as read" : "Mark as unread"}
        disabled={isLoading}
        onClick={() => onAction(threadId, isUnread ? "mark_read" : "mark_unread")}
      >
        <MailOpen className="h-3.5 w-3.5" />
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] disabled:opacity-50"
        title={isArchived ? "Unarchive" : "Archive"}
        aria-label={isArchived ? "Unarchive" : "Archive"}
        disabled={isLoading}
        onClick={() => onAction(threadId, isArchived ? "unarchive" : "archive")}
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-50",
          isFlagged
            ? "text-[#DC2626] hover:bg-red-50"
            : "text-[#64748B] hover:bg-[#F1F3F7] hover:text-[#0F172A]"
        )}
        title={isFlagged ? "Unflag" : "Flag"}
        aria-label={isFlagged ? "Unflag" : "Flag"}
        disabled={isLoading}
        onClick={() => onAction(threadId, isFlagged ? "unflag" : "flag")}
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-red-50 hover:text-[#DC2626] disabled:opacity-50"
        title="Delete"
        aria-label="Delete"
        disabled={isLoading}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] disabled:opacity-50"
        title="More actions"
        aria-label="More actions"
        disabled={isLoading}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ThreadRow({
  thread,
  isSelected,
  onClick,
  isActionLoading,
  onAction,
}: {
  thread: ThreadRowData;
  isSelected: boolean;
  onClick: () => void;
  isActionLoading: boolean;
  onAction: (threadId: string, action: ThreadAction) => void;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      data-thread-id={thread.id}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(22,41,77,0.25)]",
        isSelected
          ? "bg-[rgba(22,41,77,0.07)] ring-inset ring-1 ring-[rgba(22,41,77,0.12)]"
          : thread.isUnread
          ? "bg-white hover:bg-[#F7F8FB]"
          : "bg-[#FAFBFC] hover:bg-[#F7F8FB]"
      )}
      style={{ borderColor: "#E2E5EA" }}
    >
      {/* Unread dot */}
      <span
        className={cn(
          "absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-opacity",
          thread.isUnread ? "opacity-100" : "opacity-0"
        )}
        style={{ background: "#DC2626" }}
        aria-hidden="true"
      />

      {/* Sender avatar */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: thread.fromColor }}
        aria-hidden="true"
      >
        {thread.fromInitial}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-2">
        {/* Row 1: sender + mailbox badge + timestamp */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              thread.isUnread ? "font-bold text-[#0F172A]" : "font-medium text-[#334155]"
            )}
          >
            {thread.from}
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{
              background: `${thread.mailboxColor}18`,
              color: thread.mailboxColor,
            }}
          >
            {thread.mailboxLabel}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-[#94A3B8]">{thread.timestamp}</span>
        </div>

        {/* Row 2: subject */}
        <p
          className={cn(
            "mt-0.5 truncate text-sm",
            thread.isUnread ? "font-semibold text-[#0F172A]" : "text-[#334155]"
          )}
        >
          {thread.subject}
        </p>

        {/* Row 3: snippet + indicators */}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="flex-1 truncate text-xs text-[#64748B]">{thread.snippet}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {thread.hasAttachment && (
              <Paperclip className="h-3 w-3 text-[#94A3B8]" aria-label="Has attachment" />
            )}
            {thread.isFlagged && (
              <Flag className="h-3 w-3 text-[#DC2626]" aria-label="Flagged" />
            )}
            {thread.assignee && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#64748B]">
                <UserCircle2 className="h-3 w-3" aria-hidden="true" />
                {thread.assignee}
              </span>
            )}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                STATUS_STYLES[thread.status]
              )}
            >
              {thread.status}
            </span>
          </div>
        </div>
      </div>

      {/* Hover quick-action toolbar */}
      <QuickActions
        threadId={thread.id}
        status={thread.status}
        isUnread={thread.isUnread}
        isFlagged={thread.isFlagged}
        isLoading={isActionLoading}
        onAction={onAction}
      />
    </div>
  );
}

function MessageResultRow({
  message,
  isSelected,
  onClick,
}: {
  message: MailboxMessageResultItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const senderName = message.from?.displayName ?? message.from?.email ?? "Unknown";
  const senderInitial = senderName.charAt(0).toUpperCase();
  const timestamp = formatMessageTimestamp(message.sentAt);

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      data-message-id={message.providerMessageId}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(22,41,77,0.25)]",
        isSelected
          ? "bg-[rgba(22,41,77,0.07)] ring-inset ring-1 ring-[rgba(22,41,77,0.12)]"
          : "bg-white hover:bg-[#F7F8FB]"
      )}
      style={{ borderColor: "#E2E5EA" }}
    >
      {/* Message icon indicator */}
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF]">
        <Mail className="h-4 w-4 text-[#4F46E5]" />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-2">
        {/* Row 1: sender + mailbox badge + timestamp */}
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-[#0F172A]">
            {senderName}
          </span>
          {message.mailboxDisplayName && (
            <span className="shrink-0 rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B]">
              {message.mailboxDisplayName}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-[#94A3B8]">{timestamp}</span>
        </div>

        {/* Row 2: subject */}
        <p className="mt-0.5 truncate text-sm text-[#334155]">
          {message.subject}
        </p>

        {/* Row 3: snippet + indicators */}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="flex-1 truncate text-xs text-[#64748B]">{message.snippet}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {message.isShellResult && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                Loading…
              </span>
            )}
            <span className="rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F46E5]">
              in thread
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMessageTimestamp(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

interface MailboxThreadListProps {
  threads?: ThreadRowData[];
  /** Sprint B: Message-level results for messages mode. */
  messages?: MailboxMessageResultItem[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  /** Sprint B: Called when a message result is clicked. */
  onSelectMessage?: (message: MailboxMessageResultItem) => void;
  /** Shown as a banner above the list when a mailbox needs reconnection */
  reconnectBanner?: React.ReactNode;
  /** Shown when threads array is empty */
  emptyState?: React.ReactNode;
  totalCount?: number | null;
  loadedCount?: number;
  hasMore?: boolean;
  searchMeta?: MailboxSearchMeta | null;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  isActionLoading?: boolean;
  onThreadAction?: (threadId: string, action: ThreadAction) => void;
  connections?: Array<{ id: string; displayName: string; emailAddress: string }>;
}

export function MailboxThreadList({
  threads = MOCK_THREADS,
  messages = [],
  selectedThreadId,
  onSelectThread,
  onSelectMessage,
  reconnectBanner,
  emptyState,
  totalCount,
  loadedCount,
  hasMore = false,
  searchMeta,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  isActionLoading = false,
  onThreadAction,
  connections,
}: MailboxThreadListProps & { isLoading?: boolean }) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingAutoLoadRef = useRef(false);
  const resolvedLoadedCount = loadedCount ?? threads.length + messages.length;
  const resolvedTotalCount = totalCount ?? threads.length + messages.length;
  const showFooter =
    threads.length > 0 || messages.length > 0 || isLoadingMore || resolvedTotalCount > 0;

  useEffect(() => {
    if (!hasMore || !isLoadingMore) {
      pendingAutoLoadRef.current = false;
    }
  }, [hasMore, isLoadingMore]);

  useEffect(() => {
    if (
      typeof IntersectionObserver === "undefined" ||
      !hasMore ||
      !onLoadMore ||
      isLoading ||
      threads.length === 0
    ) {
      return;
    }

    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;

    if (!root || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const shouldLoad = entries.some((entry) => entry.isIntersecting);
        if (!shouldLoad || pendingAutoLoadRef.current) {
          return;
        }

        pendingAutoLoadRef.current = true;
        onLoadMore();
      },
      {
        root,
        rootMargin: "0px 0px 160px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, threads.length]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      role="listbox"
      aria-label="Thread list"
      aria-multiselectable="false"
    >
      {reconnectBanner}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        data-testid="mailbox-thread-list-scroll-container"
      >
        {isLoading && threads.length === 0 && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#94A3B8]" />
          </div>
        ) : messages.length > 0 ? (
          // Sprint B: Render message results in messages mode
          messages.map((msg) => (
            <MessageResultRow
              key={msg.providerMessageId}
              message={msg}
              isSelected={false}
              onClick={() => onSelectMessage?.(msg)}
            />
          ))
        ) : threads.length === 0 && emptyState ? (
          emptyState
        ) : (
          threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              isSelected={selectedThreadId === thread.id}
              onClick={() => onSelectThread(thread.id)}
              isActionLoading={isActionLoading}
              onAction={onThreadAction ?? (() => {})}
            />
          ))
        )}
        {threads.length > 0 ? (
          <div
            ref={sentinelRef}
            className="h-px w-full"
            data-testid="mailbox-thread-list-sentinel"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {showFooter ? (
        <div
          className="border-t bg-[#FAFBFC] px-4 py-3 text-xs text-[#64748B]"
          style={{ borderColor: "#E2E5EA" }}
          aria-live="polite"
          data-testid="mailbox-thread-list-footer"
        >
          <div className="flex items-center justify-between gap-3">
             <span data-testid="mailbox-thread-list-footer-count">
              {((searchMeta?.mode === "gmail_exact" || searchMeta?.mode === "hybrid") && !searchMeta.totalCountIsExact)
                ? `Loaded ${resolvedLoadedCount} result${resolvedLoadedCount === 1 ? "" : "s"}`
                : `Loaded ${Math.min(resolvedLoadedCount, resolvedTotalCount)} of ${resolvedTotalCount}`}
              {searchMeta?.searchMode === "messages" ? " messages" : ""}
            </span>
            {isLoadingMore ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading more
              </span>
            ) : hasMore && onLoadMore ? (
              <button
                type="button"
                className="rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1 font-medium text-[#16294D] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(22,41,77,0.25)]"
                onClick={onLoadMore}
                data-testid="mailbox-thread-list-load-more"
              >
                Load more
              </button>
            ) : (
              <span
                className="font-medium text-[#334155]"
                data-testid="mailbox-thread-list-end-of-results"
              >
                End of results
              </span>
            )}
          </div>
          {searchMeta?.partial && searchMeta.connectionStates ? (
            <div className="mt-1.5 space-y-1" data-testid="mailbox-search-degraded-banner">
              {searchMeta.connectionStates
                .filter((cs) => cs.status !== "ok")
                .map((cs) => {
                  const conn = connections?.find((c) => c.id === cs.connectionId);
                  const name = conn ? conn.displayName : cs.connectionId;
                  return (
                    <p key={cs.connectionId} className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                      {getFriendlyDegradedMessage(cs.status, name)}
                    </p>
                  );
                })}
            </div>
          ) : searchMeta?.partial ? (
            <p className="mt-1 text-[11px] text-amber-600" data-testid="mailbox-search-degraded-banner">
              Some mailbox connections could not return complete search results.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
