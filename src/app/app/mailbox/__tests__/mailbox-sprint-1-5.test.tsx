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
  it("includes linked and unlinked views", () => {
    const ids = SMART_VIEW_DEFS.map((v) => v.id);
    expect(ids).toContain("linked");
    expect(ids).toContain("unlinked");
  });

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
    expect(onPatch).toHaveBeenCalledWith({ assignee: "You" });
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
    expect(screen.getByTestId("filter-chip-linked-true")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-linked-false")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-flagged-true")).toBeInTheDocument();
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

  it("left rail includes Linked smart view", () => {
    renderWorkspaceAtPath();
    expect(screen.getByRole("link", { name: /^linked$/i })).toBeInTheDocument();
  });

  it("left rail includes Unlinked smart view", () => {
    renderWorkspaceAtPath();
    expect(screen.getByRole("link", { name: /^unlinked$/i })).toBeInTheDocument();
  });

  it("workspace search filters visible thread rows", () => {
    renderWorkspaceAtPath();
    fireEvent.change(screen.getByRole("textbox", { name: /search mailbox threads/i }), {
      target: { value: "Sunita" },
    });
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("clearing search restores the current result set", () => {
    renderWorkspaceAtPath();
    const searchInput = screen.getByRole("textbox", { name: /search mailbox threads/i });
    fireEvent.change(searchInput, { target: { value: "Sunita" } });
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("quick filters are usable from the real workspace zero state", () => {
    renderWorkspaceAtPath();
    fireEvent.click(screen.getByTestId("filter-chip-linked-false"));
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    expect(screen.getByTestId("clear-filters-btn")).toBeInTheDocument();
  });

  it("linked route marks linked active without also marking all inboxes active", () => {
    renderWorkspaceAtPath("/app/mailbox/linked");
    const linked = screen.getByRole("link", { name: /^linked$/i });
    const allInboxes = screen.getByRole("link", { name: /^all inboxes/i });
    expect(linked.className).toContain("bg-red-50");
    expect(allInboxes.className).not.toContain("bg-red-50");
  });

  it("unlinked route marks unlinked active without also marking all inboxes active", () => {
    renderWorkspaceAtPath("/app/mailbox/unlinked");
    const unlinked = screen.getByRole("link", { name: /^unlinked$/i });
    const allInboxes = screen.getByRole("link", { name: /^all inboxes/i });
    expect(unlinked.className).toContain("bg-red-50");
    expect(allInboxes.className).not.toContain("bg-red-50");
  });
});
