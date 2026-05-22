/**
 * Sprint 1.2 tests — Thread list and reading pane.
 * Extends Sprint 1.1 coverage; does not replace it.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: () => ({
    threads: [
      { id: "t1", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t1", subject: "Invoice #INV-2026-0412 — Payment overdue", participants: [{ email: "priya@clientco.in", displayName: "Priya Sharma" }], lastMessageAt: "2026-05-08T10:42:00Z", unreadCount: 1, status: "OPEN", assigneeId: "user-1", isFlagged: true, previewSnippet: "Hi, I wanted to follow up...", attachmentCount: 0, createdAt: "2026-05-06T09:00:00Z", updatedAt: "2026-05-08T10:42:00Z" },
      { id: "t2", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t2", subject: "Re: Quote QT-2026-0089 — Revised pricing", participants: [{ email: "arjun@techventures.io", displayName: "Arjun Mehta" }], lastMessageAt: "2026-05-08T09:15:00Z", unreadCount: 1, status: "OPEN", assigneeId: null, isFlagged: false, previewSnippet: "Thanks for the revised quote...", attachmentCount: 2, createdAt: "2026-05-07T14:30:00Z", updatedAt: "2026-05-08T09:15:00Z" },
      { id: "t3", mailboxConnectionId: "conn_accounts", providerThreadId: "gmail-t3", subject: "Voucher VCH-2026-0031 — Approval needed", participants: [{ email: "neha@vendor.com", displayName: "Neha Kapoor" }], lastMessageAt: "2026-05-07T11:00:00Z", unreadCount: 0, status: "PENDING", assigneeId: null, isFlagged: false, previewSnippet: "Please find attached the voucher...", attachmentCount: 1, createdAt: "2026-05-07T11:00:00Z", updatedAt: "2026-05-07T11:00:00Z" },
      { id: "t4", mailboxConnectionId: "conn_billing", providerThreadId: "gmail-t4", subject: "Statement of account — April 2026", participants: [{ email: "ravi@globalretail.com", displayName: "Ravi Nair" }], lastMessageAt: "2026-05-07T16:45:00Z", unreadCount: 0, status: "OPEN", assigneeId: "user-2", isFlagged: false, previewSnippet: "Please find the attached statement...", attachmentCount: 1, createdAt: "2026-05-07T16:45:00Z", updatedAt: "2026-05-07T16:45:00Z" },
      { id: "t5", mailboxConnectionId: "conn_support", providerThreadId: "gmail-t5", subject: "Support: Unable to download invoice PDF", participants: [{ email: "sunita@customer.com", displayName: "Sunita Rao" }], lastMessageAt: "2026-05-07T08:30:00Z", unreadCount: 1, status: "OPEN", assigneeId: null, isFlagged: false, previewSnippet: "Hi team, I'm trying to download...", attachmentCount: 0, createdAt: "2026-05-07T08:30:00Z", updatedAt: "2026-05-07T08:30:00Z" },
      { id: "t6", mailboxConnectionId: "conn_accounts", providerThreadId: "gmail-t6", subject: "Re: TDS certificate for FY 2025-26", participants: [{ email: "vikram@enterprise.com", displayName: "Vikram Joshi" }], lastMessageAt: "2026-05-06T14:20:00Z", unreadCount: 0, status: "CLOSED", assigneeId: null, isFlagged: false, previewSnippet: "We've processed the TDS certificate...", attachmentCount: 1, createdAt: "2026-05-05T10:00:00Z", updatedAt: "2026-05-06T14:20:00Z" },
    ],
    totalCount: 6,
    nextCursor: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-thread-detail", () => ({
  useMailboxThreadDetail: (threadId: string | null) => {
    const details = (globalThis as any).__mockThreadDetails;
    const rawDetail = threadId ? details?.[threadId] : null;
    const participantsMap: Record<string, any[]> = {
      t1: [{ displayName: "Priya Sharma", email: "priya@clientco.in" }],
      t2: [{ displayName: "Arjun Mehta", email: "arjun@techventures.io" }],
      t3: [{ displayName: "Neha Kapoor", email: "neha@vendor.com" }],
      t4: [{ displayName: "Ravi Nair", email: "ravi@globalretail.com" }],
      t5: [{ displayName: "Sunita Rao", email: "sunita@customer.com" }],
      t6: [{ displayName: "Vikram Joshi", email: "vikram@enterprise.com" }],
    };
    return {
      detail: rawDetail
        ? {
            participants: participantsMap[threadId!] ?? [],
            ...rawDetail,
          }
        : null,
      isLoading: false,
      error: null,
      isNotFound: false,
      refetch: vi.fn(),
    };
  },
}));

import { MailboxThreadList, MOCK_THREADS } from "../mailbox-thread-list";
import { MailboxReadingPane } from "../mailbox-reading-pane";
import { MailboxReadingPaneEmpty } from "../mailbox-reading-pane-empty";
import { MailboxWorkspace } from "../mailbox-workspace";
import { MOCK_THREAD_DETAILS } from "../mock-data";

(globalThis as any).__mockThreadDetails = MOCK_THREAD_DETAILS;

// ─── Sprint 1.1 regression: workspace still renders ─────────────────────────

describe("Sprint 1.1 regression", () => {
  it("mailbox workspace still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("left rail still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByRole("complementary", { name: /mailbox navigation/i })).toBeInTheDocument();
  });

  it("command bar still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByRole("toolbar", { name: /mailbox command bar/i })).toBeInTheDocument();
  });
});

// ─── Thread list ─────────────────────────────────────────────────────────────

describe("MailboxThreadList — Sprint 1.2", () => {
  it("renders as a listbox with correct aria label", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByRole("listbox", { name: /thread list/i })).toBeInTheDocument();
  });

  it("renders all mock threads", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();
    expect(screen.getByText("Neha Kapoor")).toBeInTheDocument();
    expect(screen.getByText("Ravi Nair")).toBeInTheDocument();
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.getByText("Vikram Joshi")).toBeInTheDocument();
  });

  it("renders mailbox source badges on rows", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    const billingBadges = screen.getAllByText("Billing");
    expect(billingBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badges on rows", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getAllByText("open").length).toBeGreaterThan(0);
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("unread threads have aria-selected=false when not selected", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    const options = screen.getAllByRole("option");
    options.forEach((opt) => {
      expect(opt).toHaveAttribute("aria-selected", "false");
    });
  });

  it("selected thread has aria-selected=true", () => {
    render(<MailboxThreadList selectedThreadId="t1" onSelectThread={vi.fn()} />);
    const selected = screen.getAllByRole("option").find(
      (o) => o.getAttribute("aria-selected") === "true"
    );
    expect(selected).toBeDefined();
    expect(selected).toHaveAttribute("data-thread-id", "t1");
  });

  it("calls onSelectThread with correct id when row clicked", () => {
    const onSelect = vi.fn();
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={onSelect} />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("renders quick-action toolbar for each thread", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    const toolbars = screen.getAllByRole("toolbar");
    expect(toolbars.length).toBe(MOCK_THREADS.length);
  });

  it("quick-action toolbar contains Archive, Mark as read/unread, Delete, Flag, More actions", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    // Each toolbar has these buttons — check first thread's toolbar
    const readBtns = screen.getAllByRole("button", { name: /mark as (read|unread)/i });
    expect(readBtns.length).toBeGreaterThan(0);
    const archiveBtns = screen.getAllByRole("button", { name: /^(archive|unarchive)$/i });
    expect(archiveBtns.length).toBeGreaterThan(0);
    const deleteBtns = screen.getAllByRole("button", { name: /^delete$/i });
    expect(deleteBtns.length).toBeGreaterThan(0);
    const flagBtns = screen.getAllByRole("button", { name: /^(flag|unflag)$/i });
    expect(flagBtns.length).toBeGreaterThan(0);
  });

  it("quick-action click does not propagate to row selection", () => {
    const onSelect = vi.fn();
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={onSelect} />);
    const archiveBtns = screen.getAllByRole("button", { name: /^archive$/i });
    fireEvent.click(archiveBtns[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("has attachment indicator on threads with attachments", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    const attachmentIcons = screen.getAllByLabelText("Has attachment");
    expect(attachmentIcons.length).toBeGreaterThan(0);
  });

  it("has flagged indicator on flagged threads", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();
  });
});

// ─── Reading pane empty state ─────────────────────────────────────────────────

describe("MailboxReadingPaneEmpty — Sprint 1.2 regression", () => {
  it("renders the no-thread-selected state", () => {
    render(<MailboxReadingPaneEmpty />);
    expect(screen.getByText(/select a thread to read/i)).toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    render(<MailboxReadingPaneEmpty />);
    expect(screen.getByLabelText(/no thread selected/i)).toBeInTheDocument();
  });
});

// ─── Reading pane with thread detail ─────────────────────────────────────────

describe("MailboxReadingPane", () => {
  const detail = MOCK_THREAD_DETAILS["t1"];

  it("renders with correct aria-label", () => {
    render(<MailboxReadingPane detail={detail} />);
    expect(
      screen.getByLabelText(`Thread: ${detail.subject}`)
    ).toBeInTheDocument();
  });

  it("renders the thread subject in the header", () => {
    render(<MailboxReadingPane detail={detail} />);
    expect(
      screen.getByRole("heading", { name: detail.subject })
    ).toBeInTheDocument();
  });

  it("renders mailbox source badge in header", () => {
    render(<MailboxReadingPane detail={detail} />);
    // "Billing" appears in header meta
    expect(screen.getAllByText("Billing").length).toBeGreaterThan(0);
  });

  it("renders thread status badge", () => {
    render(<MailboxReadingPane detail={detail} />);
    expect(screen.getAllByText("open").length).toBeGreaterThan(0);
  });

  it("renders assignee when present", () => {
    render(<MailboxReadingPane detail={detail} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders thread action buttons (archive, flag, delete, more)", () => {
    render(<MailboxReadingPane detail={detail} />);
    expect(screen.getByRole("button", { name: /archive thread/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /flag thread/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete thread/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more thread actions/i })).toBeInTheDocument();
  });

  it("renders all messages in the thread", () => {
    render(<MailboxReadingPane detail={detail} />);
    // t1 has 2 messages: outbound from Billing Team, inbound from Priya Sharma
    expect(screen.getByText("Billing Team")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });

  it("latest message is expanded by default", () => {
    render(<MailboxReadingPane detail={detail} />);
    // The last message (m1b, isCollapsed: false) should show its body
    expect(screen.getByText(/follow up on the invoice/i)).toBeInTheDocument();
  });

  it("older messages are collapsed by default", () => {
    render(<MailboxReadingPane detail={detail} />);
    // m1a is collapsed — its body text should not be visible
    expect(screen.queryByText(/reminder that Invoice/i)).not.toBeInTheDocument();
  });

  it("clicking a collapsed message expands it", () => {
    render(<MailboxReadingPane detail={detail} />);
    const expandBtn = screen.getByRole("button", { name: /expand message/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/reminder that Invoice/i)).toBeInTheDocument();
  });

  it("renders inline reply/reply-all/forward buttons on expanded message", () => {
    render(<MailboxReadingPane detail={detail} />);
    // The expanded message (m1b) has these buttons
    expect(screen.getByRole("button", { name: /reply to this message/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reply all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forward/i })).toBeInTheDocument();
  });

  it("renders attachment count in thread header when attachments exist", () => {
    const detailWithAtt = MOCK_THREAD_DETAILS["t2"]; // 2 attachments
    render(<MailboxReadingPane detail={detailWithAtt} />);
    expect(screen.getByText(/2 attachments/i)).toBeInTheDocument();
  });

  it("renders attachment chips with download buttons", () => {
    const detailWithAtt = MOCK_THREAD_DETAILS["t2"];
    render(<MailboxReadingPane detail={detailWithAtt} />);
    // Expand the collapsed message that has attachments
    const expandBtns = screen.getAllByRole("button", { name: /expand message/i });
    fireEvent.click(expandBtns[0]);
    expect(screen.getByText("QT-2026-0089-revised.pdf")).toBeInTheDocument();
    expect(screen.getByText("pricing-breakdown.xlsx")).toBeInTheDocument();
  });

  it("renders no-assignee state gracefully", () => {
    const detailNoAssignee = MOCK_THREAD_DETAILS["t2"]; // assignee: null
    render(<MailboxReadingPane detail={detailNoAssignee} />);
    // Should not throw; assignee section simply absent
    expect(screen.getByRole("heading", { name: detailNoAssignee.subject })).toBeInTheDocument();
  });
});

// ─── Workspace integration: selection drives reading pane ────────────────────

describe("MailboxWorkspace — Sprint 1.2 selection integration", () => {
  it("shows empty state when no thread is selected", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByLabelText(/no thread selected/i)).toBeInTheDocument();
  });

  it("shows reading pane when a thread is selected", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]); // select t1
    expect(screen.getByTestId("mailbox-reading-pane-active")).toBeInTheDocument();
  });

  it("reading pane shows correct thread subject after selection", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]); // t1
    expect(
      screen.getByRole("heading", {
        name: "Invoice #INV-2026-0412 — Payment overdue",
      })
    ).toBeInTheDocument();
  });

  it("switching thread selection updates the reading pane", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]); // t1
    fireEvent.click(options[1]); // t2
    expect(
      screen.getByRole("heading", {
        name: "Re: Quote QT-2026-0089 — Revised pricing",
      })
    ).toBeInTheDocument();
  });

  it("all-inboxes mailbox source badges are visible in thread list", () => {
    render(<MailboxWorkspace />);
    // Multiple mailbox labels should be present in the thread list
    expect(screen.getAllByText("Billing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Support").length).toBeGreaterThan(0);
  });
});

// ─── Mock data integrity ─────────────────────────────────────────────────────

describe("MOCK_THREAD_DETAILS integrity", () => {
  it("has a detail entry for every mock thread", () => {
    for (const thread of MOCK_THREADS) {
      expect(MOCK_THREAD_DETAILS[thread.id]).toBeDefined();
    }
  });

  it("every detail has at least one message", () => {
    for (const detail of Object.values(MOCK_THREAD_DETAILS)) {
      expect(detail.messages.length).toBeGreaterThan(0);
    }
  });

  it("totalAttachments matches sum of message attachments", () => {
    for (const detail of Object.values(MOCK_THREAD_DETAILS)) {
      const sum = detail.messages.reduce((acc, m) => acc + m.attachments.length, 0);
      expect(detail.totalAttachments).toBe(sum);
    }
  });

  it("latest message in each thread is not collapsed", () => {
    for (const detail of Object.values(MOCK_THREAD_DETAILS)) {
      const last = detail.messages[detail.messages.length - 1];
      expect(last.isCollapsed).toBe(false);
    }
  });
});
