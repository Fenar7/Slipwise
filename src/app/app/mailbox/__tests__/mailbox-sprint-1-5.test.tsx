/**
 * Sprint 1.5 tests — Linked context, filters, and smart views.
 * Extends Sprint 1.1–1.4 coverage; does not replace them.
 */
import { render, screen, fireEvent } from "@testing-library/react";
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

import { MailboxContextPanel, MailboxContextPanelEmpty } from "../mailbox-context-panel";
import { FilterChipsBar } from "../mailbox-filter-chips";
import { MailboxWorkspace } from "../mailbox-workspace";
import { MOCK_LINKED_CONTEXT, SMART_VIEW_DEFS, MOCK_CONNECTIONS } from "../mock-data";
import type { LinkedContextState, ActiveFilterState } from "../types";

function renderWorkspaceAtPath(pathname = "/app/mailbox") {
  mockPathname = pathname;
  return render(<MailboxWorkspace />);
}

// ─── Sprint 1.1–1.4 regression ───────────────────────────────────────────────

describe("Sprint 1.1–1.4 regression", () => {
  it("workspace still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("left rail still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByRole("complementary", { name: /mailbox navigation/i })).toBeInTheDocument();
  });

  it("thread list pane still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-thread-list-pane")).toBeInTheDocument();
  });
});

// ─── Mock data integrity ──────────────────────────────────────────────────────

describe("MOCK_LINKED_CONTEXT integrity", () => {
  it("has context for all 6 threads", () => {
    expect(Object.keys(MOCK_LINKED_CONTEXT).length).toBe(6);
  });

  it("t1 has confirmed invoice link", () => {
    const ctx = MOCK_LINKED_CONTEXT["t1"];
    expect(ctx.links.some((l) => l.entityType === "invoice" && l.confidence === "confirmed")).toBe(true);
  });

  it("t2 has a suggested customer link", () => {
    const ctx = MOCK_LINKED_CONTEXT["t2"];
    expect(ctx.suggestions.some((s) => s.entityType === "customer" && s.confidence === "suggested")).toBe(true);
  });

  it("t5 has no links and no suggestions", () => {
    const ctx = MOCK_LINKED_CONTEXT["t5"];
    expect(ctx.links.length).toBe(0);
    expect(ctx.suggestions.length).toBe(0);
  });

  it("t6 has closed status", () => {
    expect(MOCK_LINKED_CONTEXT["t6"].status).toBe("closed");
  });
});

describe("SMART_VIEW_DEFS integrity", () => {
  it("every view has a href and description", () => {
    for (const view of SMART_VIEW_DEFS) {
      expect(view.href).toBeTruthy();
      expect(view.description).toBeTruthy();
    }
  });
});

// ─── MailboxContextPanel — linked state ──────────────────────────────────────

describe("MailboxContextPanel — linked state", () => {
  const linkedCtx = MOCK_LINKED_CONTEXT["t1"]; // has invoice + customer links

  it("renders with testid", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("context-panel")).toBeInTheDocument();
  });

  it("renders with correct aria-label", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByRole("complementary", { name: /thread context/i })).toBeInTheDocument();
  });

  it("renders linked invoice card", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("link-card-lnk_t1_inv")).toBeInTheDocument();
  });

  it("renders linked customer card", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("link-card-lnk_t1_cust")).toBeInTheDocument();
  });

  it("renders entity label and ref", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByText("Invoice #INV-2026-0412")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-0412")).toBeInTheDocument();
  });

  it("renders unlink button on confirmed links", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("unlink-lnk_t1_inv")).toBeInTheDocument();
  });

  it("calls onPatch when unlink clicked", () => {
    const onPatch = vi.fn();
    render(<MailboxContextPanel context={linkedCtx} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId("unlink-lnk_t1_inv"));
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ links: expect.any(Array) })
    );
  });

  it("renders add link button when links exist", () => {
    render(<MailboxContextPanel context={linkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("add-link-btn")).toBeInTheDocument();
  });
});

// ─── MailboxContextPanel — suggested state ────────────────────────────────────

describe("MailboxContextPanel — suggested state", () => {
  const suggestedCtx = MOCK_LINKED_CONTEXT["t2"]; // has confirmed quote + suggested customer

  it("renders suggested link card", () => {
    render(<MailboxContextPanel context={suggestedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("link-card-sug_t2_cust")).toBeInTheDocument();
  });

  it("renders confirm link button on suggested card", () => {
    render(<MailboxContextPanel context={suggestedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("confirm-link-sug_t2_cust")).toBeInTheDocument();
  });

  it("confirming suggestion moves it to links", () => {
    const onPatch = vi.fn();
    render(<MailboxContextPanel context={suggestedCtx} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId("confirm-link-sug_t2_cust"));
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        links: expect.arrayContaining([
          expect.objectContaining({ id: "sug_t2_cust", confidence: "confirmed" }),
        ]),
        suggestions: expect.not.arrayContaining([
          expect.objectContaining({ id: "sug_t2_cust" }),
        ]),
      })
    );
  });
});

// ─── MailboxContextPanel — unlinked state ────────────────────────────────────

describe("MailboxContextPanel — unlinked state", () => {
  const unlinkedCtx = MOCK_LINKED_CONTEXT["t5"]; // no links, no suggestions

  it("renders no-links state", () => {
    render(<MailboxContextPanel context={unlinkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("no-links-state")).toBeInTheDocument();
  });

  it("renders link a record button", () => {
    render(<MailboxContextPanel context={unlinkedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("link-record-btn")).toBeInTheDocument();
  });
});

// ─── Assignment block ─────────────────────────────────────────────────────────

describe("MailboxContextPanel — assignment block", () => {
  const assignedCtx = MOCK_LINKED_CONTEXT["t1"]; // assignee: "You"
  const unassignedCtx = MOCK_LINKED_CONTEXT["t5"]; // assignee: null

  it("renders assignment block", () => {
    render(<MailboxContextPanel context={assignedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("assignment-block")).toBeInTheDocument();
  });

  it("shows assignee name when assigned", () => {
    render(<MailboxContextPanel context={assignedCtx} onPatch={vi.fn()} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows assign button when unassigned", () => {
    render(<MailboxContextPanel context={unassignedCtx} onPatch={vi.fn()} />);
    expect(screen.getByTestId("assign-btn")).toBeInTheDocument();
  });

  it("clicking assign calls onPatch with assignee", () => {
    const onPatch = vi.fn();
    render(<MailboxContextPanel context={unassignedCtx} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId("assign-btn"));
    fireEvent.click(screen.getByTestId("assign-self-option"));
    expect(onPatch).toHaveBeenCalledWith({ assignee: "You", assigneeId: "" });
  });

  it("renders status buttons for all statuses", () => {
    render(<MailboxContextPanel context={assignedCtx} onPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /set status to open/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set status to pending/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set status to closed/i })).toBeInTheDocument();
  });

  it("active status button has aria-pressed=true", () => {
    render(<MailboxContextPanel context={assignedCtx} onPatch={vi.fn()} />);
    const openBtn = screen.getByRole("button", { name: /set status to open/i });
    expect(openBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a status calls onPatch", () => {
    const onPatch = vi.fn();
    render(<MailboxContextPanel context={assignedCtx} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: /set status to closed/i }));
    expect(onPatch).toHaveBeenCalledWith({ status: "closed" });
  });
});

// ─── MailboxContextPanelEmpty ─────────────────────────────────────────────────

describe("MailboxContextPanelEmpty", () => {
  it("renders with testid", () => {
    render(<MailboxContextPanelEmpty />);
    expect(screen.getByTestId("context-panel-empty")).toBeInTheDocument();
  });

  it("renders no thread selected message", () => {
    render(<MailboxContextPanelEmpty />);
    expect(screen.getByText(/no thread selected/i)).toBeInTheDocument();
  });
});

// ─── FilterChipsBar ───────────────────────────────────────────────────────────

describe("FilterChipsBar", () => {
  const emptyState: ActiveFilterState = { filters: [], searchQuery: "" };

  it("renders with testid", () => {
    render(
      <FilterChipsBar
        filterState={emptyState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByTestId("filter-chips-bar")).toBeInTheDocument();
  });

  it("renders all quick filter chips", () => {
    render(
      <FilterChipsBar
        filterState={emptyState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByTestId("filter-chip-unread-true")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-assignee-me")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-flagged-true")).toBeInTheDocument();
    // Sprint 4.4: linked/unlinked chips removed from live UI (mock-only filters)
    expect(screen.queryByTestId("filter-chip-linked-true")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-chip-linked-false")).not.toBeInTheDocument();
  });

  it("inactive chips have aria-pressed=false", () => {
    render(
      <FilterChipsBar
        filterState={emptyState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    const chip = screen.getByTestId("filter-chip-unread-true");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("active chip has aria-pressed=true", () => {
    const activeState: ActiveFilterState = {
      filters: [{ field: "unread", value: "true", label: "Unread" }],
      searchQuery: "",
    };
    render(
      <FilterChipsBar
        filterState={activeState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByTestId("filter-chip-unread-true")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking inactive chip calls onAddFilter", () => {
    const onAddFilter = vi.fn();
    render(
      <FilterChipsBar
        filterState={emptyState}
        onAddFilter={onAddFilter}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("filter-chip-unread-true"));
    expect(onAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({ field: "unread", value: "true" })
    );
  });

  it("clicking active chip calls onRemoveFilter", () => {
    const onRemoveFilter = vi.fn();
    const activeState: ActiveFilterState = {
      filters: [{ field: "unread", value: "true", label: "Unread" }],
      searchQuery: "",
    };
    render(
      <FilterChipsBar
        filterState={activeState}
        onAddFilter={vi.fn()}
        onRemoveFilter={onRemoveFilter}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("filter-chip-unread-true"));
    expect(onRemoveFilter).toHaveBeenCalledWith("unread", "true");
  });

  it("shows clear all button when filters are active", () => {
    const activeState: ActiveFilterState = {
      filters: [{ field: "unread", value: "true", label: "Unread" }],
      searchQuery: "",
    };
    render(
      <FilterChipsBar
        filterState={activeState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByTestId("clear-filters-btn")).toBeInTheDocument();
  });

  it("does not show clear all when no filters active", () => {
    render(
      <FilterChipsBar
        filterState={emptyState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.queryByTestId("clear-filters-btn")).not.toBeInTheDocument();
  });

  it("clicking clear all calls onClearAll", () => {
    const onClearAll = vi.fn();
    const activeState: ActiveFilterState = {
      filters: [{ field: "unread", value: "true", label: "Unread" }],
      searchQuery: "",
    };
    render(
      <FilterChipsBar
        filterState={activeState}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    fireEvent.click(screen.getByTestId("clear-filters-btn"));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});

// ─── Workspace filter integration ────────────────────────────────────────────

describe("MailboxWorkspace — Sprint 1.5 filter integration", () => {
  it("filter chips bar is shown initially so filters are reachable", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("filter-chips-bar")).toBeInTheDocument();
  });

  it("context panel container renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-context-panel-container")).toBeInTheDocument();
  });

  it("context panel empty state shown when no thread selected", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("context-panel-empty")).toBeInTheDocument();
  });

  it("selecting a thread shows context panel", () => {
    renderWorkspaceAtPath();
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]); // t1
    expect(screen.getByTestId("context-panel")).toBeInTheDocument();
  });

  it("context panel shows linked records for selected thread", () => {
    renderWorkspaceAtPath();
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]); // t1 — has invoice link
    expect(screen.getByTestId("link-card-lnk_t1_inv")).toBeInTheDocument();
  });

  // Sprint 4.4 review fix: linked/unlinked smart views removed from live nav

  it("workspace search input updates filter state", () => {
    renderWorkspaceAtPath();
    const searchInput = screen.getByRole("combobox", { name: /search mailbox threads/i });
    fireEvent.change(searchInput, { target: { value: "Sunita" } });
    // Sprint 4.4: search is backend-driven; UI state updates immediately
    expect(searchInput).toHaveValue("Sunita");
    expect(screen.getByTestId("clear-filters-btn")).toBeInTheDocument();
  });

  it("clearing search restores the current result set", () => {
    renderWorkspaceAtPath();
    const searchInput = screen.getByRole("combobox", { name: /search mailbox threads/i });
    fireEvent.change(searchInput, { target: { value: "Sunita" } });
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("supported quick filters show clear-filters button when applied", () => {
    renderWorkspaceAtPath();
    // Sprint 4.4: backend drives filtering; UI still shows active filter chips
    fireEvent.click(screen.getByTestId("filter-chip-assignee-none"));
    expect(screen.getByTestId("clear-filters-btn")).toBeInTheDocument();
  });

  // Sprint 4.4 review fix: linked/unlinked routes removed from live nav
});
