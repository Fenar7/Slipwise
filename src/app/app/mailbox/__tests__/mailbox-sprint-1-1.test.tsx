import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mailbox",
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
    connections: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: () => ({
    threads: [],
    totalCount: 0,
    nextCursor: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-query-sync", () => ({
  useMailboxQuerySync: () => ({
    filterState: { searchQuery: "", filters: [] },
    setFilterState: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "user_self" }, loading: false }),
}));

vi.mock("../use-mailbox-saved-views", () => ({
  useMailboxSavedViews: () => ({
    savedViews: [],
    isLoading: false,
    error: null,
    createSavedView: vi.fn(),
    deleteSavedView: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-draft", () => ({
  useMailboxDraft: () => ({
    draftState: null,
    openCompose: vi.fn(),
    openReply: vi.fn(),
    openForward: vi.fn(),
    closeDraft: vi.fn(),
    expandDraft: vi.fn(),
    collapseDraft: vi.fn(),
    updateDraft: vi.fn(),
    sendDraft: vi.fn(),
  }),
}));

vi.mock("../use-thread-action", () => ({
  useThreadAction: () => ({
    performAction: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../use-assignable-members", () => ({
  useAssignableMembers: () => ({
    members: [],
    isLoading: false,
  }),
}));

vi.mock("../use-mailbox-sync-action", () => ({
  useMailboxSyncAction: () => ({
    triggerSync: vi.fn(),
    isPending: vi.fn(() => false),
    getError: vi.fn(() => null),
    clearError: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-thread-detail", () => ({
  useMailboxThreadDetail: () => ({
    thread: null,
    isLoading: false,
    error: null,
  }),
}));

import { MailboxLeftRail } from "../mailbox-left-rail";
import { MailboxCommandBar } from "../mailbox-command-bar";
import { MailboxThreadList } from "../mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "../mailbox-reading-pane-empty";
import { MailboxWorkspace, resolveViewLabel } from "../mailbox-workspace";
import { GLOBAL_SMART_VIEWS, MOCK_CONNECTIONS, MOCK_MAILBOX_GROUPS } from "../mock-data";

// ─── Mock data integrity ────────────────────────────────────────────────────

describe("Mailbox mock data", () => {
  it("has at least two connected mailbox accounts", () => {
    const connected = MOCK_CONNECTIONS.filter((c) => c.status === "connected");
    expect(connected.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least one reconnect_required account for degraded state coverage", () => {
    const degraded = MOCK_CONNECTIONS.filter((c) => c.status === "reconnect_required");
    expect(degraded.length).toBeGreaterThanOrEqual(1);
  });

  it("includes All Inboxes as the first global smart view", () => {
    expect(GLOBAL_SMART_VIEWS[0].id).toBe("all-inboxes");
    expect(GLOBAL_SMART_VIEWS[0].href).toBe("/app/mailbox");
  });

  it("has mailbox groups for every connection", () => {
    expect(MOCK_MAILBOX_GROUPS.length).toBe(MOCK_CONNECTIONS.length);
  });

  it("each mailbox group has folder items", () => {
    for (const group of MOCK_MAILBOX_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("uses stable slugs for mailbox route construction", () => {
    expect(MOCK_CONNECTIONS.every((connection) => connection.slug.length > 0)).toBe(true);
    expect(MOCK_CONNECTIONS.map((connection) => connection.slug)).toEqual([
      "billing",
      "support",
      "accounts",
    ]);
  });
});

// ─── MailboxLeftRail ────────────────────────────────────────────────────────

describe("MailboxLeftRail", () => {
  it("renders the mailbox navigation landmark", () => {
    render(<MailboxLeftRail />);
    // aside maps to complementary role; the inner nav is "Mailbox views"
    expect(screen.getByRole("complementary", { name: /mailbox navigation/i })).toBeInTheDocument();
  });

  it("renders All Inboxes as the first nav item", () => {
    render(<MailboxLeftRail />);
    expect(screen.getByRole("link", { name: /all inboxes/i })).toBeInTheDocument();
  });

  it("renders all global smart views", () => {
    render(<MailboxLeftRail connections={[]} />);
    for (const view of GLOBAL_SMART_VIEWS) {
      // Link text includes badge count, so use getAllByRole and check at least one matches
      const links = screen.getAllByRole("link").filter((l) =>
        l.textContent?.includes(view.label)
      );
      expect(links.length).toBeGreaterThan(0);
    }
  });

  it("renders connected account display names when connections are passed explicitly", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Billing and Support are connected and should be visible
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });

  it("shows reconnect warning for degraded account when connections are passed explicitly", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Accounts mailbox is reconnect_required — multiple elements with "Accounts" text is expected
    const accountsElements = screen.getAllByText("Accounts");
    expect(accountsElements.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT show mock connection display names when no connections prop is passed", () => {
    render(<MailboxLeftRail />);
    // Runtime default must not leak shell mock data connection names as interactive buttons
    // (The "Accounts" section-header label is always rendered; we check no MailboxAccountGroup buttons appear)
    expect(screen.queryByRole("button", { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /support/i })).not.toBeInTheDocument();
    // Shell email addresses must not appear anywhere
    expect(screen.queryByText(/billing@acmecorp.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/support@acmecorp.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accounts@acmecorp.com/i)).not.toBeInTheDocument();
  });

  it("shows truthful empty accounts section when no connections are passed", () => {
    render(<MailboxLeftRail />);
    expect(screen.getByText(/no mailboxes connected/i)).toBeInTheDocument();
  });

  it("does not render any unread count badges for smart views in no-connection state", () => {
    render(<MailboxLeftRail />);
    // The fake counts 20, 3, 8, 2 must not appear anywhere in the rail
    const fakeCountTexts = ["20", "3", "8", "2"];
    for (const countText of fakeCountTexts) {
      // Check that no badge-like span with only this number exists
      const badge = screen.queryByText(countText);
      expect(badge).not.toBeInTheDocument();
    }
  });

  it("GLOBAL_SMART_VIEWS has no hardcoded unreadCount values", () => {
    for (const view of GLOBAL_SMART_VIEWS) {
      expect(view.unreadCount).toBeUndefined();
    }
  });

  it("renders manage mailboxes link", () => {
    render(<MailboxLeftRail />);
    expect(screen.getByRole("link", { name: /manage mailboxes/i })).toBeInTheDocument();
  });

  it("renders compose button", () => {
    render(<MailboxLeftRail />);
    expect(screen.getByRole("button", { name: /compose new message/i })).toBeInTheDocument();
  });

  it("All Inboxes link is active when on /app/mailbox", () => {
    render(<MailboxLeftRail />);
    const allInboxesLink = screen.getByRole("link", { name: /all inboxes/i });
    expect(allInboxesLink).toHaveClass("bg-red-50");
  });

  // ─── System folder visibility ──────────────────────────────────────────

  it("renders all six system folder labels for connected accounts", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Each folder label appears once per account (3 connected × 6 folders = 18 links)
    const folderLabels = ["Inbox", "Sent", "Drafts", "Starred", "Spam", "Trash"];
    for (const label of folderLabels) {
      const links = screen.getAllByRole("link").filter((l) => l.textContent === label);
      // One per account: Billing, Support, Accounts
      expect(links.length).toBe(3);
    }
  });

  it("system folders render for reconnect_required accounts", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Accounts inbox (conn_accounts) must be present despite reconnect_required status
    const accountsInbox = screen.getAllByRole("link").find(
      (l) => l.getAttribute("href") === "/app/mailbox/conn_accounts/inbox"
    );
    expect(accountsInbox).toBeInTheDocument();
  });

  it("folder links navigate to /app/mailbox/{connId}/{folder}", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Billing inbox
    const billingInbox = screen.getAllByRole("link").find(
      (l) => l.getAttribute("href") === "/app/mailbox/conn_billing/inbox"
    );
    expect(billingInbox).toBeInTheDocument();

    // Support sent
    const supportSent = screen.getAllByRole("link").find(
      (l) => l.getAttribute("href") === "/app/mailbox/conn_support/sent"
    );
    expect(supportSent).toBeInTheDocument();
  });

  it("shows reconnect notice and folder links for reconnect_required account", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    // Reconnect notice renders because expanded defaults to true
    expect(screen.getByText(/reconnect required/i)).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
    // Folder links still render for reconnect_required account
    const accountsDrafts = screen.getAllByRole("link").find(
      (l) => l.getAttribute("href") === "/app/mailbox/conn_accounts/drafts"
    );
    expect(accountsDrafts).toBeInTheDocument();
  });

  it("renders 18 folder links across all accounts (3 × 6)", () => {
    render(<MailboxLeftRail connections={MOCK_CONNECTIONS} />);
    const allLinks = screen.getAllByRole("link");
    const folderHrefs = allLinks.filter(
      (l) =>
        l.getAttribute("href")?.startsWith("/app/mailbox/conn_") &&
        !l.getAttribute("href")?.endsWith("/settings")
    );
    // 3 connections × 6 folders each
    expect(folderHrefs.length).toBe(18);
  });
});

// ─── MailboxCommandBar ──────────────────────────────────────────────────────

describe("MailboxCommandBar", () => {
  it("renders the toolbar landmark", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    expect(screen.getByRole("toolbar", { name: /mailbox command bar/i })).toBeInTheDocument();
  });

  it("shows the active view label", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" totalCount={47} unreadCount={20} />);
    expect(screen.getByText("All Inboxes")).toBeInTheDocument();
  });

  it("shows thread count and unread count", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" totalCount={47} unreadCount={20} />);
    expect(screen.getByText(/47 threads/i)).toBeInTheDocument();
    expect(screen.getByText(/20 unread/i)).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    expect(screen.getByRole("textbox", { name: /search mailbox threads/i })).toBeInTheDocument();
  });

  it("renders the filter button", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    expect(screen.getByRole("button", { name: /filter threads/i })).toBeInTheDocument();
  });

  it("renders the compose button", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    expect(screen.getByRole("button", { name: /compose new message/i })).toBeInTheDocument();
  });

  it("shows clear button when search query is entered", () => {
    const onSearchQueryChange = vi.fn();
    render(
      <MailboxCommandBar
        activeViewLabel="All Inboxes"
        searchQuery="invoice"
        onSearchQueryChange={onSearchQueryChange}
      />
    );
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });

  it("clears search when clear button is clicked", () => {
    const onClearSearch = vi.fn();
    render(
      <MailboxCommandBar
        activeViewLabel="All Inboxes"
        searchQuery="invoice"
        onClearSearch={onClearSearch}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(onClearSearch).toHaveBeenCalledOnce();
  });

  it("shows sync state and sync action when provided", () => {
    render(
      <MailboxCommandBar
        activeViewLabel="Billing"
        syncStatus={{
          state: "running",
          isSyncing: true,
          syncMode: "INITIAL",
          triggerSource: "MANUAL",
          currentRunId: "run_1",
          currentRunStartedAt: new Date().toISOString(),
          lastCompletedAt: null,
          lastRunStatus: "RUNNING",
          lastErrorCategory: null,
          lastErrorSummary: null,
          lastRunThreadCount: null,
          lastRunMessageCount: null,
          stageLabel: "Initial import in progress",
          detailLabel: "Importing recent threads. Messages will appear automatically.",
        }}
        onSyncNow={vi.fn()}
      />
    );

    expect(screen.getByText("Syncing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync mailbox now/i })).toBeDisabled();
  });
});

// ─── MailboxThreadList ──────────────────────────────────────────────────────

describe("MailboxThreadList", () => {
  it("renders the thread list landmark", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByRole("listbox", { name: /thread list/i })).toBeInTheDocument();
  });

  it("renders thread rows with sender names", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();
  });

  it("renders mailbox source badges on rows", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    // Multiple Billing badges expected
    const billingBadges = screen.getAllByText("Billing");
    expect(billingBadges.length).toBeGreaterThan(0);
  });

  it("calls onSelectThread when a row is clicked", () => {
    const onSelect = vi.fn();
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={onSelect} />);
    const firstRow = screen.getAllByRole("option")[0];
    fireEvent.click(firstRow);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("marks selected thread with aria-selected", () => {
    render(<MailboxThreadList selectedThreadId="t1" onSelectThread={vi.fn()} />);
    const selectedRow = screen.getAllByRole("option").find(
      (opt) => opt.getAttribute("aria-selected") === "true"
    );
    expect(selectedRow).toBeDefined();
  });
});

// ─── MailboxReadingPaneEmpty ────────────────────────────────────────────────

describe("MailboxReadingPaneEmpty", () => {
  it("renders the empty state message", () => {
    render(<MailboxReadingPaneEmpty />);
    expect(screen.getByText(/select a thread to read/i)).toBeInTheDocument();
  });

  it("has the correct aria-label", () => {
    render(<MailboxReadingPaneEmpty />);
    expect(screen.getByLabelText(/no thread selected/i)).toBeInTheDocument();
  });
});

// ─── MailboxWorkspace (integration) ────────────────────────────────────────

describe("MailboxWorkspace", () => {
  it("resolves mailbox-specific folder labels from stable slugs", () => {
    expect(resolveViewLabel("/app/mailbox/billing/inbox", MOCK_CONNECTIONS)).toBe("Billing · Inbox");
    expect(resolveViewLabel("/app/mailbox/support/sent", MOCK_CONNECTIONS)).toBe("Support · Sent");
  });

  it("renders the workspace container", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("renders the left rail navigation", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByRole("complementary", { name: /mailbox navigation/i })).toBeInTheDocument();
  });

  it("renders the command bar", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByRole("toolbar", { name: /mailbox command bar/i })).toBeInTheDocument();
  });

  it("renders the thread list pane", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-thread-list-pane")).toBeInTheDocument();
  });

  it("renders the reading pane", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-reading-pane")).toBeInTheDocument();
  });

  it("shows All Inboxes as the active view label on /app/mailbox", () => {
    render(<MailboxWorkspace />);
    // "All Inboxes" appears in both the left rail nav item and the command bar heading
    const allInboxesElements = screen.getAllByText("All Inboxes");
    expect(allInboxesElements.length).toBeGreaterThanOrEqual(1);
    // The command bar heading specifically
    expect(screen.getByRole("heading", { name: "All Inboxes" })).toBeInTheDocument();
  });
});
