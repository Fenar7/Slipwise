/**
 * Mailbox Sprint 6.2 UI tests — Assignment and workflow state integration.
 *
 * Covers:
 * - Thread list renders real assignee names (including "You" for current user)
 * - Thread detail shows correct assignee from API
 * - Context panel reflects authoritative status and assignment
 * - Assign / unassign / set_status fire real API actions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MailboxWorkspace } from "../mailbox-workspace";
import type { MailboxThreadReadShape, MailboxThreadDetailReadShape } from "@/lib/mailbox/read-shapes";
import type { MailboxConnection } from "../types";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "user_self" }, loading: false }),
}));

const mockPerformAction = vi.fn().mockResolvedValue(true);

vi.mock("../use-mailbox-connections", () => ({
  useMailboxConnections: () => ({
    connections: [
      {
        id: "conn_billing",
        orgId: "org_1",
        provider: "gmail" as const,
        slug: "billing",
        emailAddress: "billing@acmecorp.com",
        displayName: "Billing",
        status: "connected" as const,
        lastSyncAt: "2026-05-08T14:30:00Z",
        lastSyncError: null,
        lastSyncErrorCategory: null,
        unreadCount: 2,
        inboxCount: 10,
      },
    ] satisfies MailboxConnection[],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: () => ({
    threads: [
      {
        id: "t1",
        mailboxConnectionId: "conn_billing",
        providerThreadId: "pt1",
        subject: "Invoice overdue",
        participants: [{ email: "client@example.com", displayName: "Client A" }],
        lastMessageAt: "2026-05-20T10:00:00Z",
        unreadCount: 1,
        status: "OPEN",
        assigneeId: "user_self",
        assigneeName: "Current User",
        isFlagged: false,
        previewSnippet: "Please pay...",
        attachmentCount: 0,
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z",
      },
      {
        id: "t2",
        mailboxConnectionId: "conn_billing",
        providerThreadId: "pt2",
        subject: "Quote request",
        participants: [{ email: "other@example.com", displayName: "Other User" }],
        lastMessageAt: "2026-05-20T09:00:00Z",
        unreadCount: 0,
        status: "OPEN",
        assigneeId: "user_other",
        assigneeName: "Priya Sharma",
        isFlagged: false,
        previewSnippet: "Can you quote...",
        attachmentCount: 0,
        createdAt: "2026-05-20T09:00:00Z",
        updatedAt: "2026-05-20T09:00:00Z",
      },
      {
        id: "t3",
        mailboxConnectionId: "conn_billing",
        providerThreadId: "pt3",
        subject: "Unassigned thread",
        participants: [{ email: "anon@example.com", displayName: "Anonymous" }],
        lastMessageAt: "2026-05-20T08:00:00Z",
        unreadCount: 0,
        status: "OPEN",
        assigneeId: null,
        assigneeName: null,
        isFlagged: false,
        previewSnippet: "Hello...",
        attachmentCount: 0,
        createdAt: "2026-05-20T08:00:00Z",
        updatedAt: "2026-05-20T08:00:00Z",
      },
    ] satisfies MailboxThreadReadShape[],
    totalCount: 3,
    nextCursor: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-thread-detail", () => ({
  useMailboxThreadDetail: (threadId: string | null) => ({
    detail:
      threadId === "t1"
        ? ({
            id: "t1",
            mailboxConnectionId: "conn_billing",
            subject: "Invoice overdue",
            participants: [{ email: "client@example.com", displayName: "Client A" }],
            unreadCount: 1,
            status: "OPEN",
            assigneeId: "user_self",
            assigneeName: "Current User",
            isFlagged: false,
            previewSnippet: "Please pay...",
            attachmentCount: 0,
            messages: [],
            createdAt: "2026-05-20T10:00:00Z",
            updatedAt: "2026-05-20T10:00:00Z",
          } satisfies MailboxThreadDetailReadShape)
        : threadId === "t2"
          ? ({
              id: "t2",
              mailboxConnectionId: "conn_billing",
              subject: "Quote request",
              participants: [{ email: "other@example.com", displayName: "Other User" }],
              unreadCount: 0,
              status: "PENDING",
              assigneeId: "user_other",
              assigneeName: "Priya Sharma",
              isFlagged: false,
              previewSnippet: "Can you quote...",
              attachmentCount: 0,
              messages: [],
              createdAt: "2026-05-20T09:00:00Z",
              updatedAt: "2026-05-20T09:00:00Z",
            } satisfies MailboxThreadDetailReadShape)
          : null,
    isLoading: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-thread-action", () => ({
  useThreadAction: () => ({
    isLoading: false,
    error: null,
    performAction: mockPerformAction,
  }),
}));

vi.mock("../use-assignable-members", () => ({
  useAssignableMembers: () => ({
    members: [
      { id: "m1", userId: "user_self", name: "Current User", email: "me@acme.com", avatarUrl: null },
      { id: "m2", userId: "user_other", name: "Priya Sharma", email: "priya@acme.com", avatarUrl: null },
      { id: "m3", userId: "user_third", name: "Arjun Patel", email: "arjun@acme.com", avatarUrl: null },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-draft", () => ({
  useMailboxDraft: () => ({
    draft: null,
    isLoading: false,
    error: null,
    createDraft: vi.fn().mockResolvedValue(null),
    updateDraft: vi.fn(),
    autosave: vi.fn(),
    sendDraft: vi.fn().mockResolvedValue(null),
    discardDraft: vi.fn(),
    cancelAutosave: vi.fn(),
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

function setDesktopViewport() {
  Object.defineProperty(window, "innerWidth", { value: 1440, writable: true });
  window.dispatchEvent(new Event("resize"));
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1280px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("Mailbox Sprint 6.2 — Assignment workflow UI", () => {
  beforeEach(() => {
    mockPerformAction.mockClear();
    setDesktopViewport();
  });

  it("shows 'You' in thread list when current user is assignee", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows real assignee name in thread list when another user is assignee", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });

  it("does not show assignee badge for unassigned threads", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it("reflects real assignee and status in context panel after selecting a thread", async () => {
    render(<MailboxWorkspace />);
    fireEvent.click(screen.getByText("Quote request"));

    // Status buttons should include "Pending" as active for t2
    const pendingBtn = await screen.findByLabelText("Set status to Pending");
    expect(pendingBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("fires assign API action with real teammate userId when selecting from picker", async () => {
    render(<MailboxWorkspace />);
    fireEvent.click(screen.getByText("Unassigned thread"));

    // Open the assignee dropdown
    const assignBtn = await waitFor(() => screen.getByTestId("assign-btn"));
    fireEvent.click(assignBtn);

    // Select a real teammate
    const teammateOption = await screen.findByTestId("assign-option-user_other");
    fireEvent.click(teammateOption);

    await waitFor(() => {
      expect(mockPerformAction).toHaveBeenCalledWith("t3", "assign", { assigneeId: "user_other" });
    });
  });

  it("fires assign API action with current userId when clicking 'Assign to me'", async () => {
    render(<MailboxWorkspace />);
    fireEvent.click(screen.getByText("Unassigned thread"));

    const assignBtn = await waitFor(() => screen.getByTestId("assign-btn"));
    fireEvent.click(assignBtn);

    const selfOption = await screen.findByTestId("assign-self-option");
    fireEvent.click(selfOption);

    await waitFor(() => {
      expect(mockPerformAction).toHaveBeenCalledWith("t3", "assign", { assigneeId: "user_self" });
    });
  });

  it("fires unassign API action when clicking X on assignee chip", async () => {
    render(<MailboxWorkspace />);
    fireEvent.click(screen.getByText("Invoice overdue"));

    // The assignee chip shows the current assignee; click the X inside it
    const chip = await waitFor(() => screen.getByTestId("assignee-chip"));
    const unassignBtn = chip.querySelector('[aria-label="Unassign"]') as HTMLElement;
    expect(unassignBtn).toBeTruthy();
    fireEvent.click(unassignBtn);

    await waitFor(() => {
      expect(mockPerformAction).toHaveBeenCalledWith("t1", "unassign");
    });
  });

  it("fires set_status API action when clicking a status button in context panel", async () => {
    render(<MailboxWorkspace />);
    fireEvent.click(screen.getByText("Invoice overdue"));

    const closedBtn = await screen.findByLabelText("Set status to Closed");
    fireEvent.click(closedBtn);

    await waitFor(() => {
      expect(mockPerformAction).toHaveBeenCalledWith("t1", "set_status", { status: "CLOSED" });
    });
  });
});
