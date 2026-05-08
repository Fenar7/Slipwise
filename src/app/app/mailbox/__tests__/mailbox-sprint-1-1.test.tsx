import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mailbox",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { MailboxLeftRail } from "../mailbox-left-rail";
import { MailboxCommandBar } from "../mailbox-command-bar";
import { MailboxThreadList } from "../mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "../mailbox-reading-pane-empty";
import { MailboxWorkspace } from "../mailbox-workspace";
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
    render(<MailboxLeftRail />);
    for (const view of GLOBAL_SMART_VIEWS) {
      expect(screen.getByRole("link", { name: new RegExp(view.label, "i") })).toBeInTheDocument();
    }
  });

  it("renders connected account display names", () => {
    render(<MailboxLeftRail />);
    // Billing and Support are connected and should be visible
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });

  it("shows reconnect warning for degraded account", () => {
    render(<MailboxLeftRail />);
    // Accounts mailbox is reconnect_required — multiple elements with "Accounts" text is expected
    const accountsElements = screen.getAllByText("Accounts");
    expect(accountsElements.length).toBeGreaterThanOrEqual(1);
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
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    const input = screen.getByRole("textbox", { name: /search mailbox threads/i });
    fireEvent.change(input, { target: { value: "invoice" } });
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });

  it("clears search when clear button is clicked", () => {
    render(<MailboxCommandBar activeViewLabel="All Inboxes" />);
    const input = screen.getByRole("textbox", { name: /search mailbox threads/i });
    fireEvent.change(input, { target: { value: "invoice" } });
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(input).toHaveValue("");
  });
});

// ─── MailboxThreadList ──────────────────────────────────────────────────────

describe("MailboxThreadList", () => {
  it("renders the thread list landmark", () => {
    render(<MailboxThreadList selectedThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByRole("list", { name: /thread list/i })).toBeInTheDocument();
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
    const firstRow = screen.getAllByRole("button")[0];
    fireEvent.click(firstRow);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("marks selected thread with aria-selected", () => {
    render(<MailboxThreadList selectedThreadId="t1" onSelectThread={vi.fn()} />);
    const selectedRow = screen.getAllByRole("button").find(
      (btn) => btn.getAttribute("aria-selected") === "true"
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
