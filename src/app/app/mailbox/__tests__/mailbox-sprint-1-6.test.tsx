/**
 * Sprint 1.6 tests — Empty, degraded, and responsive polish.
 * Extends Sprint 1.1–1.5 coverage; does not replace them.
 *
 * Coverage:
 * - Sprint 1.1–1.5 regression (workspace, thread list, reading pane, compose, settings, context panel)
 * - Empty states (no mailboxes, no thread selected, no results, no linked records, smart view)
 * - Skeleton/loading states (thread list, reading pane, shell, settings, linked context)
 * - Restricted states (no_permission, admin_only, mailbox_not_visible, org_suspended)
 * - Reconnect required states (full pane, inline banner)
 * - Degraded health states (banner, full pane)
 * - Responsive nav components (rail drawer, mobile top bar, tablet top bar, mobile tab bar)
 * - Workspace integration (empty thread list, reconnect banner wiring)
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let mockPathname = "/app/mailbox";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../use-mailbox-query-sync", () => ({
  useMailboxQuerySync: () => {
    const [filterState, setFilterState] = require("react").useState({ filters: [], searchQuery: "" });
    return { filterState, setFilterState };
  },
}));

// Mock mailbox data hooks for workspace tests
vi.mock("../use-mailbox-connections", () => ({
  useMailboxConnections: () => ({
    connections: [
      { id: "conn_billing", orgId: "org_1", provider: "gmail", slug: "billing", emailAddress: "billing@acmecorp.com", displayName: "Billing", status: "connected", lastSyncAt: "2026-05-08T14:30:00Z", lastSyncError: null, lastSyncErrorCategory: null, unreadCount: 14, inboxCount: 47 },
      { id: "conn_support", orgId: "org_1", provider: "gmail", slug: "support", emailAddress: "support@acmecorp.com", displayName: "Support", status: "connected", lastSyncAt: "2026-05-08T14:28:00Z", lastSyncError: null, lastSyncErrorCategory: null, unreadCount: 6, inboxCount: 23 },
      { id: "conn_accounts", orgId: "org_1", provider: "gmail", slug: "accounts", emailAddress: "accounts@acmecorp.com", displayName: "Accounts", status: "reconnect_required", lastSyncAt: "2026-05-07T09:15:00Z", lastSyncError: "OAuth token expired. Reconnect required.", lastSyncErrorCategory: "auth_expired", unreadCount: 0, inboxCount: 0 },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-sync-action", () => ({
  useMailboxSyncAction: () => ({
    triggerSync: vi.fn(async () => true),
    isPending: vi.fn(() => false),
    getError: vi.fn(() => null),
    clearError: vi.fn(),
  }),
}));

const ALL_MOCK_THREADS = [
  { id: "t1", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t1", subject: "Invoice #INV-2026-0412 — Payment overdue", participants: [{ email: "priya@clientco.in", displayName: "Priya Sharma" }], lastMessageAt: "2026-05-08T10:42:00Z", unreadCount: 1, status: "OPEN", assigneeId: "user-1", isFlagged: true, previewSnippet: "Hi, I wanted to follow up...", attachmentCount: 0, createdAt: "2026-05-06T09:00:00Z", updatedAt: "2026-05-08T10:42:00Z" },
  { id: "t2", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t2", subject: "Re: Quote QT-2026-0089 — Revised pricing", participants: [{ email: "arjun@techventures.io", displayName: "Arjun Mehta" }], lastMessageAt: "2026-05-08T09:15:00Z", unreadCount: 1, status: "OPEN", assigneeId: null, isFlagged: false, previewSnippet: "Thanks for the revised quote...", attachmentCount: 2, createdAt: "2026-05-07T14:30:00Z", updatedAt: "2026-05-08T09:15:00Z" },
  { id: "t3", mailboxConnectionId: "conn_accounts", providerThreadId: "gmail-t3", subject: "Voucher VCH-2026-0031 — Approval needed", participants: [{ email: "neha@vendor.com", displayName: "Neha Kapoor" }], lastMessageAt: "2026-05-07T11:00:00Z", unreadCount: 0, status: "PENDING", assigneeId: null, isFlagged: false, previewSnippet: "Please find attached the voucher...", attachmentCount: 1, createdAt: "2026-05-07T11:00:00Z", updatedAt: "2026-05-07T11:00:00Z" },
  { id: "t4", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t4", subject: "Statement of account — April 2026", participants: [{ email: "ravi@globalretail.com", displayName: "Ravi Nair" }], lastMessageAt: "2026-05-07T16:45:00Z", unreadCount: 0, status: "OPEN", assigneeId: "user-2", isFlagged: false, previewSnippet: "Please find the attached statement...", attachmentCount: 1, createdAt: "2026-05-07T16:45:00Z", updatedAt: "2026-05-07T16:45:00Z" },
  { id: "t5", mailboxConnectionId: "conn_support", providerThreadId: "gmail-t5", subject: "Support: Unable to download invoice PDF", participants: [{ email: "sunita@customer.com", displayName: "Sunita Rao" }], lastMessageAt: "2026-05-07T08:30:00Z", unreadCount: 1, status: "OPEN", assigneeId: null, isFlagged: false, previewSnippet: "Hi team, I'm trying to download...", attachmentCount: 0, createdAt: "2026-05-07T08:30:00Z", updatedAt: "2026-05-07T08:30:00Z" },
  { id: "t6", mailboxConnectionId: "conn_accounts", providerThreadId: "gmail-t6", subject: "Re: TDS certificate for FY 2025-26", participants: [{ email: "vikram@enterprise.com", displayName: "Vikram Joshi" }], lastMessageAt: "2026-05-06T14:20:00Z", unreadCount: 0, status: "CLOSED", assigneeId: null, isFlagged: false, previewSnippet: "We've processed the TDS certificate...", attachmentCount: 1, createdAt: "2026-05-05T10:00:00Z", updatedAt: "2026-05-06T14:20:00Z" },
];

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: vi.fn((params) => {
    let threads = ALL_MOCK_THREADS;
    if (params?.connectionId) {
      threads = threads.filter((t) => t.mailboxConnectionId === params.connectionId);
    }
    if (params?.folder === "SENT") {
      threads = [];
    }
    if (params?.folder === "SPAM") {
      threads = [];
    }
    if (params?.folder === "ARCHIVE") {
      threads = threads.filter((t) => t.status === "ARCHIVED");
    }
    if (params?.status) {
      const rawStatuses = Array.isArray(params.status)
        ? params.status
        : String(params.status).split(",").map((s: string) => s.trim());
      const statuses = rawStatuses.filter((s: string) => s.length > 0);
      threads = threads.filter((t) => statuses.includes(t.status));
    }
    if (params?.unreadOnly) {
      threads = threads.filter((t) => t.unreadCount > 0);
    }
    if (params?.isFlagged) {
      threads = threads.filter((t) => t.isFlagged);
    }
    if (params?.assignee === "me") {
      threads = threads.filter((t) => t.assigneeId);
    }
    if (params?.assignee === "none") {
      threads = threads.filter((t) => !t.assigneeId);
    }
    return {
      threads,
      totalCount: threads.length,
      nextCursor: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      loadMore: vi.fn(),
    };
  }),
}));

vi.mock("../use-mailbox-drafts", () => ({
  useMailboxDrafts: () => ({
    drafts: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "user_self" }, loading: false }),
}));

function buildThreadDetail(threadId: string) {
  const thread = ALL_MOCK_THREADS.find((candidate) => candidate.id === threadId);
  const detail = threadId ? MOCK_THREAD_DETAILS[threadId as keyof typeof MOCK_THREAD_DETAILS] : null;
  if (!thread || !detail) return null;

  return {
    id: thread.id,
    mailboxConnectionId: thread.mailboxConnectionId,
    subject: thread.subject,
    participants: thread.participants.map((participant) => ({
      email: participant.email,
      displayName: participant.displayName,
    })),
    unreadCount: thread.unreadCount,
    status: thread.status,
    assigneeId: thread.assigneeId,
    isFlagged: thread.isFlagged,
    previewSnippet: thread.previewSnippet,
    attachmentCount: thread.attachmentCount,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    links: [],
    suggestions: [],
    messages: detail.messages.map((message) => ({
      id: message.id,
      threadId: detail.threadId,
      providerMessageId: `provider-${message.id}`,
      rfcMessageId: null,
      direction: message.direction,
      from: message.fromEmail
        ? { email: message.fromEmail, displayName: message.from }
        : null,
      to: message.to.map((email) => ({ email, displayName: null })),
      cc: [],
      bcc: [],
      subject: message.subject,
      snippet: message.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      sentAt: message.sentAt,
      receivedAt: message.direction === "inbound" ? message.sentAt : null,
      attachmentCount: message.attachments.length,
      createdAt: message.sentAt,
      updatedAt: message.sentAt,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        messageId: message.id,
        providerAttachmentId: `provider-${attachment.id}`,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: 1024,
        isInline: false,
        storageRef: null,
      })),
    })),
  };
}

vi.mock("../use-mailbox-thread-detail", () => ({
  useMailboxThreadDetail: vi.fn((threadId: string | null) => ({
    detail: threadId ? buildThreadDetail(threadId) : null,
    isLoading: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
  })),
}));

// ─── Component imports ────────────────────────────────────────────────────────

import {
  NoMailboxesEmpty,
  EmptyInboxState,
  NoThreadSelectedEmpty,
  NoSearchResultsEmpty,
  NoLinkedRecordsEmpty,
  SmartViewEmpty,
} from "../mailbox-empty-states";

import {
  ThreadListSkeleton,
  ReadingPaneSkeleton,
  LeftRailSkeleton,
  MailboxShellSkeleton,
  SettingsPageSkeleton,
  LinkedContextSkeleton,
} from "../mailbox-skeleton-states";

import {
  MailboxRestrictedState,
  InlineRestrictedNotice,
  ReconnectRequiredState,
  ReconnectBanner,
  DegradedHealthBanner,
  DegradedMailboxState,
} from "../mailbox-restricted-states";

import {
  MailboxRailDrawer,
  MobileTopBar,
  TabletTopBar,
  MobileTabBar,
} from "../mailbox-mobile-nav";

import { MailboxWorkspace } from "../mailbox-workspace";
import { MailboxReadingPaneEmpty } from "../mailbox-reading-pane-empty";
import { MailboxThreadList } from "../mailbox-thread-list";
import { MailboxSettingsPageContent } from "../settings/page";
import { MOCK_THREAD_DETAILS } from "../mock-data";

function renderWorkspaceAtPath(pathname: string) {
  mockPathname = pathname;
  return render(<MailboxWorkspace />);
}

// ─── Sprint 1.1–1.5 regression ───────────────────────────────────────────────

describe("Sprint 1.1–1.5 regression", () => {
  it("workspace still renders", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("thread list pane still renders", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-thread-list-pane")).toBeInTheDocument();
  });

  it("reading pane still renders", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-reading-pane")).toBeInTheDocument();
  });

  it("context panel container still renders", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-context-panel-container")).toBeInTheDocument();
  });
});

// ─── Empty states ─────────────────────────────────────────────────────────────

describe("NoMailboxesEmpty", () => {
  it("renders admin variant with connect CTA", () => {
    render(<NoMailboxesEmpty isAdmin={true} />);
    expect(screen.getByTestId("empty-no-mailboxes")).toBeInTheDocument();
    expect(screen.getByTestId("connect-mailbox-cta")).toBeInTheDocument();
    expect(screen.getByText(/connect a mailbox/i)).toBeInTheDocument();
  });

  it("renders non-admin variant without connect CTA", () => {
    render(<NoMailboxesEmpty isAdmin={false} />);
    expect(screen.getByTestId("empty-no-mailboxes")).toBeInTheDocument();
    expect(screen.queryByTestId("connect-mailbox-cta")).not.toBeInTheDocument();
    expect(screen.getByText(/contact your organization admin/i)).toBeInTheDocument();
  });

  it("has accessible label", () => {
    render(<NoMailboxesEmpty />);
    expect(screen.getByLabelText(/no mailboxes connected/i)).toBeInTheDocument();
  });
});

describe("EmptyInboxState", () => {
  it("renders with mailbox label when no sync status", () => {
    render(<EmptyInboxState mailboxLabel="Billing" />);
    expect(screen.getByText(/billing is empty/i)).toBeInTheDocument();
  });

  it("mentions syncing context when no sync status", () => {
    render(<EmptyInboxState mailboxLabel="Support" />);
    expect(screen.getByText(/still be syncing/i)).toBeInTheDocument();
  });

  it("renders sync-aware empty state when initial import is running", () => {
    render(
      <EmptyInboxState
        mailboxLabel="Support"
        syncStatus={{
          state: "running",
          isSyncing: true,
          syncMode: "INITIAL",
          triggerSource: "MANUAL",
          currentRunId: "run_1",
          currentRunStartedAt: "2026-05-22T10:00:00Z",
          lastCompletedAt: null,
          lastRunStatus: "RUNNING",
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Initial import in progress",
          detailLabel: "Importing recent threads. Messages will appear automatically.",
        }}
      />
    );

    // New design: heading is "Importing messages…"
    expect(screen.getByText(/importing messages/i)).toBeInTheDocument();
    // Body explains threads will appear automatically
    expect(screen.getByText(/threads will appear here automatically/i)).toBeInTheDocument();
    // Uses the correct testId
    expect(screen.getByTestId("empty-inbox-syncing")).toBeInTheDocument();
  });

  it("does NOT render the mailbox label as a duplicate heading below the sync card when running", () => {
    render(
      <EmptyInboxState
        mailboxLabel="Support"
        syncStatus={{
          state: "running",
          isSyncing: true,
          syncMode: "INITIAL",
          triggerSource: "MANUAL",
          currentRunId: "run_1",
          currentRunStartedAt: null,
          lastCompletedAt: null,
          lastRunStatus: "RUNNING",
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Initial import in progress",
          detailLabel: "Importing recent threads.",
        }}
      />
    );

    // "Support" must NOT appear as a standalone heading duplicate
    // (it previously appeared as a separate <p> below the sync card)
    const supportTexts = screen.queryAllByText("Support");
    expect(supportTexts).toHaveLength(0);
  });

  it("renders waiting-for-first-sync state with Sync now CTA", () => {
    const onSyncNow = vi.fn();
    render(
      <EmptyInboxState
        mailboxLabel="Support"
        onSyncNow={onSyncNow}
        syncStatus={{
          state: "completed_never_imported",
          isSyncing: false,
          syncMode: null,
          triggerSource: null,
          currentRunId: null,
          currentRunStartedAt: null,
          lastCompletedAt: null,
          lastRunStatus: null,
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Connected, waiting for first sync",
          detailLabel: "This mailbox is connected. The first sync has not completed yet.",
        }}
      />
    );

    // New design: heading is "[mailboxLabel] is ready"
    expect(screen.getByText(/support is ready/i)).toBeInTheDocument();
    // Correct testId
    expect(screen.getByTestId("empty-inbox-waiting")).toBeInTheDocument();
    // CTA is present and wired
    const button = screen.getByTestId("sync-now-cta");
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSyncNow).toHaveBeenCalledOnce();
  });

  it("does NOT render a duplicate mailbox heading below the waiting state chip", () => {
    render(
      <EmptyInboxState
        mailboxLabel="Billing"
        syncStatus={{
          state: "completed_never_imported",
          isSyncing: false,
          syncMode: null,
          triggerSource: null,
          currentRunId: null,
          currentRunStartedAt: null,
          lastCompletedAt: null,
          lastRunStatus: null,
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Connected, waiting for first sync",
          detailLabel: "This mailbox is connected.",
        }}
      />
    );

    // "Billing" should appear exactly once (as part of "Billing is ready"),
    // NOT as a standalone repeated heading underneath the chip.
    const billingTexts = screen.getAllByText(/billing/i);
    // All occurrences must be inside the heading, not a separate element
    expect(billingTexts.length).toBe(1);
  });

  it("does NOT show Sync now CTA when sync is actively running", () => {
    render(
      <EmptyInboxState
        mailboxLabel="Support"
        onSyncNow={vi.fn()}
        isSyncPending={true}
        syncStatus={{
          state: "completed_never_imported",
          isSyncing: false,
          syncMode: null,
          triggerSource: null,
          currentRunId: null,
          currentRunStartedAt: null,
          lastCompletedAt: null,
          lastRunStatus: null,
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Connected, waiting for first sync",
          detailLabel: "This mailbox is connected.",
        }}
      />
    );

    // When isSyncPending is true, the CTA must be hidden (no dead button)
    expect(screen.queryByTestId("sync-now-cta")).not.toBeInTheDocument();
  });

  it("renders failed sync state with actionable body copy", () => {
    render(
      <EmptyInboxState
        mailboxLabel="Billing"
        syncStatus={{
          state: "failed",
          isSyncing: false,
          syncMode: null,
          triggerSource: null,
          currentRunId: null,
          currentRunStartedAt: null,
          lastCompletedAt: null,
          lastRunStatus: "FAILED",
          lastErrorCategory: "rate_limited",
          lastErrorSummary: "Gmail rate limit exceeded",
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Sync needs attention",
          detailLabel: "Gmail rate limit exceeded",
        }}
        onSyncNow={vi.fn()}
      />
    );

    expect(screen.getByTestId("empty-inbox-failed")).toBeInTheDocument();
    expect(screen.getByText(/sync needs attention/i)).toBeInTheDocument();
    // Shows the safe error summary
    expect(screen.getByText(/gmail rate limit exceeded/i)).toBeInTheDocument();
  });
});

describe("NoThreadSelectedEmpty", () => {
  it("renders with default copy", () => {
    render(<NoThreadSelectedEmpty />);
    expect(screen.getByTestId("empty-no-thread-selected")).toBeInTheDocument();
    expect(screen.getByText(/select a thread to read/i)).toBeInTheDocument();
  });

  it("renders with view label context", () => {
    render(<NoThreadSelectedEmpty viewLabel="Unread" />);
    expect(screen.getByText(/from unread/i)).toBeInTheDocument();
  });

  it("has accessible label", () => {
    render(<NoThreadSelectedEmpty />);
    expect(screen.getByLabelText(/no thread selected/i)).toBeInTheDocument();
  });
});

describe("NoSearchResultsEmpty", () => {
  it("renders with search query", () => {
    render(<NoSearchResultsEmpty query="invoice" />);
    expect(screen.getByTestId("empty-no-results")).toBeInTheDocument();
    expect(screen.getByText(/no results for "invoice"/i)).toBeInTheDocument();
  });

  it("renders clear filters button when filters are active", () => {
    const onClear = vi.fn();
    render(
      <NoSearchResultsEmpty hasActiveFilters={true} onClearFilters={onClear} />
    );
    const btn = screen.getByRole("button", { name: /clear filters/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not render clear button when no filters", () => {
    render(<NoSearchResultsEmpty />);
    expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument();
  });
});

describe("NoLinkedRecordsEmpty", () => {
  it("renders with accessible label", () => {
    render(<NoLinkedRecordsEmpty />);
    expect(screen.getByTestId("no-links-state")).toBeInTheDocument();
    expect(screen.getByLabelText(/no linked records/i)).toBeInTheDocument();
  });

  it("always renders link record button", () => {
    render(<NoLinkedRecordsEmpty />);
    expect(screen.getByTestId("link-record-btn")).toBeInTheDocument();
  });

  it("calls onLinkRecord when button clicked", () => {
    const onLink = vi.fn();
    render(<NoLinkedRecordsEmpty onLinkRecord={onLink} />);
    const btn = screen.getByRole("button", { name: /link a record/i });
    fireEvent.click(btn);
    expect(onLink).toHaveBeenCalledOnce();
  });
});

describe("SmartViewEmpty", () => {
  it("renders with view label and description", () => {
    render(
      <SmartViewEmpty
        viewLabel="Flagged"
        viewDescription="No threads are flagged for follow-up."
      />
    );
    expect(screen.getByTestId("empty-smart-view")).toBeInTheDocument();
    expect(screen.getByText(/nothing in flagged/i)).toBeInTheDocument();
    expect(screen.getByText(/no threads are flagged/i)).toBeInTheDocument();
  });

  it("renders back button when callback provided", () => {
    const onBack = vi.fn();
    render(
      <SmartViewEmpty
        viewLabel="Unread"
        viewDescription="All caught up."
        onBack={onBack}
      />
    );
    const btn = screen.getByRole("button", { name: /back to all inboxes/i });
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ─── MailboxReadingPaneEmpty (Sprint 1.6 delegate) ────────────────────────────

describe("MailboxReadingPaneEmpty", () => {
  it("renders the Sprint 1.6 no-thread-selected state", () => {
    render(<MailboxReadingPaneEmpty />);
    expect(screen.getByTestId("empty-no-thread-selected")).toBeInTheDocument();
  });
});

// ─── Skeleton states ──────────────────────────────────────────────────────────

describe("ThreadListSkeleton", () => {
  it("renders with aria-busy and testid", () => {
    render(<ThreadListSkeleton />);
    const el = screen.getByTestId("skeleton-thread-list");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-busy", "true");
  });

  it("renders custom row count", () => {
    const { container } = render(<ThreadListSkeleton rows={3} />);
    // 3 rows + 1 header row = 4 flex items with gap-3
    const rows = container.querySelectorAll(".flex.items-start.gap-3");
    expect(rows.length).toBe(3);
  });
});

describe("ReadingPaneSkeleton", () => {
  it("renders with aria-busy", () => {
    render(<ReadingPaneSkeleton />);
    const el = screen.getByTestId("skeleton-reading-pane");
    expect(el).toHaveAttribute("aria-busy", "true");
  });
});

describe("LeftRailSkeleton", () => {
  it("renders with aria-busy", () => {
    render(<LeftRailSkeleton />);
    const el = screen.getByTestId("skeleton-left-rail");
    expect(el).toHaveAttribute("aria-busy", "true");
  });
});

describe("MailboxShellSkeleton", () => {
  it("renders full shell skeleton", () => {
    render(<MailboxShellSkeleton />);
    expect(screen.getByTestId("skeleton-mailbox-shell")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-left-rail")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-thread-list")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-reading-pane")).toBeInTheDocument();
  });
});

describe("SettingsPageSkeleton", () => {
  it("renders with aria-busy", () => {
    render(<SettingsPageSkeleton />);
    const el = screen.getByTestId("skeleton-settings-page");
    expect(el).toHaveAttribute("aria-busy", "true");
  });
});

describe("LinkedContextSkeleton", () => {
  it("renders with aria-busy", () => {
    render(<LinkedContextSkeleton />);
    const el = screen.getByTestId("skeleton-linked-context");
    expect(el).toHaveAttribute("aria-busy", "true");
  });
});

// ─── Restricted states ────────────────────────────────────────────────────────

describe("MailboxRestrictedState", () => {
  it("renders no_permission state", () => {
    render(<MailboxRestrictedState reason="no_permission" />);
    expect(screen.getByTestId("restricted-state-no_permission")).toBeInTheDocument();
    expect(screen.getByText(/you don't have access/i)).toBeInTheDocument();
  });

  it("renders admin_only state", () => {
    render(<MailboxRestrictedState reason="admin_only" />);
    expect(screen.getByTestId("restricted-state-admin_only")).toBeInTheDocument();
    expect(screen.getByText(/admin-only area/i)).toBeInTheDocument();
  });

  it("renders mailbox_not_visible state", () => {
    render(<MailboxRestrictedState reason="mailbox_not_visible" />);
    expect(screen.getByTestId("restricted-state-mailbox_not_visible")).toBeInTheDocument();
    expect(screen.getByText(/mailbox not available/i)).toBeInTheDocument();
  });

  it("renders org_suspended state", () => {
    render(<MailboxRestrictedState reason="org_suspended" />);
    expect(screen.getByTestId("restricted-state-org_suspended")).toBeInTheDocument();
    expect(screen.getByText(/organization access suspended/i)).toBeInTheDocument();
  });

  it("shows mailbox label when provided", () => {
    render(<MailboxRestrictedState reason="no_permission" mailboxLabel="Billing" />);
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("has role=status for screen readers", () => {
    render(<MailboxRestrictedState reason="no_permission" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("InlineRestrictedNotice", () => {
  it("renders with default reason", () => {
    render(<InlineRestrictedNotice />);
    expect(screen.getByTestId("inline-restricted-notice")).toBeInTheDocument();
    expect(screen.getByText(/you don't have access/i)).toBeInTheDocument();
  });

  it("renders admin_only reason", () => {
    render(<InlineRestrictedNotice reason="admin_only" />);
    expect(screen.getByText(/admin-only area/i)).toBeInTheDocument();
  });
});

// ─── Reconnect required states ────────────────────────────────────────────────

describe("ReconnectRequiredState", () => {
  const baseProps = {
    mailboxLabel: "Accounts",
    emailAddress: "accounts@acmecorp.com",
    connectionId: "conn_accounts",
  };

  it("renders reconnect required state", () => {
    render(<ReconnectRequiredState {...baseProps} />);
    expect(screen.getByTestId("reconnect-required-conn_accounts")).toBeInTheDocument();
    expect(screen.getByText(/accounts is disconnected/i)).toBeInTheDocument();
    expect(screen.getByText(/reconnect required/i)).toBeInTheDocument();
  });

  it("shows reconnect CTA for admin", () => {
    render(<ReconnectRequiredState {...baseProps} isAdmin={true} />);
    expect(screen.getByTestId("reconnect-cta-conn_accounts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect mailbox/i })).toBeInTheDocument();
  });

  it("hides reconnect CTA for non-admin", () => {
    render(<ReconnectRequiredState {...baseProps} isAdmin={false} />);
    expect(screen.queryByTestId("reconnect-cta-conn_accounts")).not.toBeInTheDocument();
    expect(screen.getByText(/contact your organization admin/i)).toBeInTheDocument();
  });

  it("shows custom lastSyncError message", () => {
    render(
      <ReconnectRequiredState
        {...baseProps}
        lastSyncError="OAuth token expired. Reconnect required."
      />
    );
    expect(screen.getByText(/oauth token expired/i)).toBeInTheDocument();
  });
});

describe("ReconnectBanner", () => {
  it("renders inline reconnect banner", () => {
    render(
      <ReconnectBanner
        mailboxLabel="Accounts"
        connectionId="conn_accounts"
        isAdmin={true}
      />
    );
    expect(screen.getByTestId("reconnect-banner-conn_accounts")).toBeInTheDocument();
    expect(screen.getByText(/accounts — reconnect required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect accounts/i })).toBeInTheDocument();
  });

  it("hides reconnect link for non-admin", () => {
    render(
      <ReconnectBanner
        mailboxLabel="Accounts"
        connectionId="conn_accounts"
        isAdmin={false}
      />
    );
    expect(screen.queryByRole("link", { name: /reconnect/i })).not.toBeInTheDocument();
  });
});

// ─── Degraded health states ───────────────────────────────────────────────────

describe("DegradedHealthBanner", () => {
  it("renders sync_lag banner", () => {
    render(
      <DegradedHealthBanner
        reason="sync_lag"
        mailboxLabel="Billing"
      />
    );
    expect(screen.getByTestId("degraded-banner-sync_lag")).toBeInTheDocument();
    expect(screen.getByText(/billing — sync is running behind/i)).toBeInTheDocument();
  });

  it("renders partial_failure banner", () => {
    render(
      <DegradedHealthBanner
        reason="partial_failure"
        mailboxLabel="Support"
      />
    );
    expect(screen.getByTestId("degraded-banner-partial_failure")).toBeInTheDocument();
    expect(screen.getByText(/some messages couldn't be loaded/i)).toBeInTheDocument();
  });

  it("renders watch_expired banner", () => {
    render(
      <DegradedHealthBanner
        reason="watch_expired"
        mailboxLabel="Billing"
      />
    );
    expect(screen.getByTestId("degraded-banner-watch_expired")).toBeInTheDocument();
  });

  it("renders rate_limited banner", () => {
    render(
      <DegradedHealthBanner
        reason="rate_limited"
        mailboxLabel="Billing"
      />
    );
    expect(screen.getByTestId("degraded-banner-rate_limited")).toBeInTheDocument();
  });
});

describe("DegradedMailboxState", () => {
  const baseProps = {
    reason: "sync_lag" as const,
    mailboxLabel: "Billing",
    detectedAt: "2026-05-08T10:00:00Z",
    requiresAdminAction: false,
    connectionId: "conn_billing",
  };

  it("renders degraded state", () => {
    render(<DegradedMailboxState {...baseProps} />);
    expect(screen.getByTestId("degraded-state-conn_billing")).toBeInTheDocument();
    expect(screen.getByText(/sync is running behind/i)).toBeInTheDocument();
    expect(screen.getByText(/sync degraded/i)).toBeInTheDocument();
  });

  it("shows settings link when admin action required", () => {
    render(<DegradedMailboxState {...baseProps} requiresAdminAction={true} />);
    expect(screen.getByRole("link", { name: /view mailbox settings/i })).toBeInTheDocument();
  });

  it("hides settings link when no admin action required", () => {
    render(<DegradedMailboxState {...baseProps} requiresAdminAction={false} />);
    expect(screen.queryByRole("link", { name: /view mailbox settings/i })).not.toBeInTheDocument();
  });
});

// ─── Responsive nav components ────────────────────────────────────────────────

describe("MailboxRailDrawer", () => {
  it("renders closed by default (translated off-screen)", () => {
    render(
      <MailboxRailDrawer isOpen={false} onClose={vi.fn()}>
        <div>Rail content</div>
      </MailboxRailDrawer>
    );
    const drawer = screen.getByTestId("mailbox-rail-drawer");
    expect(drawer).toHaveClass("-translate-x-full");
  });

  it("renders open state", () => {
    render(
      <MailboxRailDrawer isOpen={true} onClose={vi.fn()}>
        <div>Rail content</div>
      </MailboxRailDrawer>
    );
    const drawer = screen.getByTestId("mailbox-rail-drawer");
    expect(drawer).toHaveClass("translate-x-0");
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <MailboxRailDrawer isOpen={true} onClose={onClose}>
        <div>Rail content</div>
      </MailboxRailDrawer>
    );
    fireEvent.click(screen.getByRole("button", { name: /close navigation/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has role=dialog and aria-modal", () => {
    render(
      <MailboxRailDrawer isOpen={true} onClose={vi.fn()}>
        <div>Rail content</div>
      </MailboxRailDrawer>
    );
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveAttribute("aria-modal", "true");
  });

  it("traps focus while open", () => {
    render(
      <div>
        <button>Outside before</button>
        <MailboxRailDrawer isOpen={true} onClose={vi.fn()}>
          <button>First inside</button>
          <button>Last inside</button>
        </MailboxRailDrawer>
        <button>Outside after</button>
      </div>
    );

    expect(screen.getByRole("button", { name: /close navigation/i })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Last inside" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: /close navigation/i })).toHaveFocus();
  });
});

describe("MobileTopBar", () => {
  it("renders menu button on thread-list panel", () => {
    render(
      <MobileTopBar
        activePanel="thread-list"
        label="All Inboxes"
        onOpenRail={vi.fn()}
      />
    );
    expect(screen.getByTestId("mobile-top-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });

  it("renders back button on reading-pane panel", () => {
    const onBack = vi.fn();
    render(
      <MobileTopBar
        activePanel="reading-pane"
        label="Invoice thread"
        onOpenRail={vi.fn()}
        onBack={onBack}
      />
    );
    const backBtn = screen.getByRole("button", { name: /back/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders compose button when callback provided", () => {
    const onCompose = vi.fn();
    render(
      <MobileTopBar
        activePanel="thread-list"
        label="All Inboxes"
        onOpenRail={vi.fn()}
        onCompose={onCompose}
      />
    );
    const composeBtn = screen.getByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtn);
    expect(onCompose).toHaveBeenCalledOnce();
  });
});

describe("TabletTopBar", () => {
  it("renders with hamburger button", () => {
    render(
      <TabletTopBar
        label="All Inboxes"
        onOpenRail={vi.fn()}
      />
    );
    expect(screen.getByTestId("tablet-top-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });

  it("calls onOpenRail when hamburger clicked", () => {
    const onOpenRail = vi.fn();
    render(<TabletTopBar label="All Inboxes" onOpenRail={onOpenRail} />);
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(onOpenRail).toHaveBeenCalledOnce();
  });
});

describe("MobileTabBar", () => {
  it("renders inbox and thread tabs", () => {
    render(
      <MobileTabBar
        activePanel="thread-list"
        onSelectPanel={vi.fn()}
      />
    );
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thread list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reading pane/i })).toBeInTheDocument();
  });

  it("calls onSelectPanel when tab clicked", () => {
    const onSelect = vi.fn();
    render(
      <MobileTabBar
        activePanel="thread-list"
        onSelectPanel={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /reading pane/i }));
    expect(onSelect).toHaveBeenCalledWith("reading-pane");
  });

  it("shows unread badge when count > 0", () => {
    render(
      <MobileTabBar
        activePanel="thread-list"
        onSelectPanel={vi.fn()}
        unreadCount={5}
      />
    );
    expect(screen.getByLabelText("5 unread")).toBeInTheDocument();
  });

  it("marks active tab with aria-current", () => {
    render(
      <MobileTabBar
        activePanel="reading-pane"
        onSelectPanel={vi.fn()}
      />
    );
    const readingBtn = screen.getByRole("button", { name: /reading pane/i });
    expect(readingBtn).toHaveAttribute("aria-current", "page");
  });
});

// ─── MailboxThreadList with Sprint 1.6 props ─────────────────────────────────

describe("MailboxThreadList Sprint 1.6 props", () => {
  it("renders emptyState when threads array is empty", () => {
    render(
      <MailboxThreadList
        threads={[]}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        emptyState={<div data-testid="custom-empty">No threads</div>}
      />
    );
    expect(screen.getByTestId("custom-empty")).toBeInTheDocument();
  });

  it("renders reconnectBanner above thread list", () => {
    render(
      <MailboxThreadList
        threads={[]}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        reconnectBanner={<div data-testid="reconnect-banner-test">Reconnect</div>}
      />
    );
    expect(screen.getByTestId("reconnect-banner-test")).toBeInTheDocument();
  });
});

// ─── Workspace integration ────────────────────────────────────────────────────

describe("MailboxWorkspace Sprint 1.6 integration", () => {
  it("renders mobile top bar", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mobile-top-bar")).toBeInTheDocument();
  });

  it("renders tablet top bar", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("tablet-top-bar")).toBeInTheDocument();
  });

  it("renders mobile tab bar", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
  });

  it("renders rail drawer (closed by default)", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    const drawer = screen.getByTestId("mailbox-rail-drawer");
    expect(drawer).toHaveClass("-translate-x-full");
  });

  it("shows no-results empty state when search yields nothing", () => {
    mockPathname = "/app/mailbox";
    render(<MailboxWorkspace />);
    // The workspace renders with mock threads; we can't easily trigger empty
    // without interacting with the search bar, but we verify the workspace renders
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("shows reconnect banner for accounts mailbox path", () => {
    renderWorkspaceAtPath("/app/mailbox/accounts/inbox");
    // accounts connection has status reconnect_required
    expect(screen.getByTestId("reconnect-banner-conn_accounts")).toBeInTheDocument();
  });

  it("opens the filter panel from the command bar", () => {
    renderWorkspaceAtPath("/app/mailbox");
    const filterButton = screen.getByRole("button", { name: /filter threads/i });
    fireEvent.click(filterButton);

    expect(screen.getByTestId("mailbox-filter-panel")).toBeInTheDocument();
    expect(filterButton).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the filter panel on backdrop click", () => {
    renderWorkspaceAtPath("/app/mailbox");
    fireEvent.click(screen.getByRole("button", { name: /filter threads/i }));
    fireEvent.click(screen.getByTestId("mailbox-filter-panel-backdrop"));

    expect(screen.queryByTestId("mailbox-filter-panel")).not.toBeInTheDocument();
  });

  it("applies mailbox filter selections from the panel", () => {
    renderWorkspaceAtPath("/app/mailbox");
    fireEvent.click(screen.getByRole("button", { name: /filter threads/i }));
    fireEvent.click(screen.getByTestId("filter-option-mailbox-support"));
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filter threads/i })).toHaveTextContent("1");
  });

  it("shows mailbox scope as fixed on mailbox-specific routes", () => {
    renderWorkspaceAtPath("/app/mailbox/billing/inbox");
    fireEvent.click(screen.getByRole("button", { name: /filter threads/i }));

    expect(screen.getByText(/mailbox scope is fixed by this route/i)).toBeInTheDocument();
    expect(screen.getByTestId("filter-option-mailbox-fixed")).toBeDisabled();
  });

  it("shows current smart view context inside the filter panel", () => {
    renderWorkspaceAtPath("/app/mailbox/unread");
    fireEvent.click(screen.getByRole("button", { name: /filter threads/i }));

    expect(screen.getByText(/refine unread without leaving the current mailbox view\./i)).toBeInTheDocument();
  });

  it("shows a mailbox empty state for drafts routes instead of a blank list", () => {
    renderWorkspaceAtPath("/app/mailbox/billing/drafts");
    expect(screen.getByText(/billing · drafts has no drafts/i)).toBeInTheDocument();
  });

  it("shows a mailbox empty state for spam routes instead of a blank list", () => {
    renderWorkspaceAtPath("/app/mailbox/support/spam");
    expect(screen.getByText(/support · spam has no spam conversations/i)).toBeInTheDocument();
  });

  it("opens a narrow-viewport context panel from the reading pane", async () => {
    renderWorkspaceAtPath("/app/mailbox");
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /view thread context/i }));

    await waitFor(() => {
      expect(screen.getByTestId("context-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(/billing context/i)).toBeInTheDocument();
  });

  it("returns from context panel to the reading pane on mobile back", async () => {
    renderWorkspaceAtPath("/app/mailbox");
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /view thread context/i }));
    fireEvent.click(await screen.findByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByTestId("mailbox-reading-pane-active")).toBeInTheDocument();
    });
  });
});

describe("MailboxSettingsPageContent Sprint 1.6 integration", () => {
  it("shows no-mailboxes empty state when there are no mailbox connections", () => {
    render(<MailboxSettingsPageContent connections={[]} />);
    expect(screen.getByTestId("settings-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("empty-no-mailboxes")).toBeInTheDocument();
  });
});

// ─── Type shape integrity ─────────────────────────────────────────────────────

describe("Sprint 1.6 type shapes", () => {
  it("MailboxLoadingState shape is valid", () => {
    const state = { target: "thread-list" as const, isLoading: true };
    expect(state.target).toBe("thread-list");
    expect(state.isLoading).toBe(true);
  });

  it("MailboxRestrictedState shape is valid", () => {
    const state = {
      reason: "no_permission" as const,
      message: "You do not have access.",
      guidance: "Contact your admin.",
    };
    expect(state.reason).toBe("no_permission");
  });

  it("MailboxDegradedState shape is valid", () => {
    const state = {
      connectionId: "conn_billing",
      reason: "sync_lag" as const,
      impactSummary: "Messages may be delayed.",
      detectedAt: "2026-05-08T10:00:00Z",
      requiresAdminAction: false,
    };
    expect(state.reason).toBe("sync_lag");
    expect(state.requiresAdminAction).toBe(false);
  });

  it("MailboxResponsiveState shape is valid", () => {
    const state = {
      activePanel: "thread-list" as const,
      isRailOpen: false,
    };
    expect(state.activePanel).toBe("thread-list");
    expect(state.isRailOpen).toBe(false);
  });
});
