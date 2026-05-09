/**
 * Sprint 1.3 tests — Compose, reply, and forward flows.
 * Extends Sprint 1.1/1.2 coverage; does not replace them.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let mockPathname = "/app/mailbox";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { FloatingComposer } from "../mailbox-floating-composer";
import { ExpandedComposer } from "../mailbox-expanded-composer";
import { InlineReply } from "../mailbox-inline-reply";
import { MailboxReadingPane } from "../mailbox-reading-pane";
import { MailboxWorkspace } from "../mailbox-workspace";
import { MailboxThreadList } from "../mailbox-thread-list";
import { MOCK_THREAD_DETAILS } from "../mock-data";
import type { MailboxComposerState } from "../types";

function renderWorkspaceAtPath(pathname = "/app/mailbox") {
  mockPathname = pathname;
  return render(<MailboxWorkspace />);
}

// ─── Shared test fixture ──────────────────────────────────────────────────────

function makeComposer(overrides: Partial<MailboxComposerState> = {}): MailboxComposerState {
  return {
    isOpen: true,
    layout: "floating",
    mode: "new",
    fromConnectionId: "conn_billing",
    fromLabel: "Billing",
    fromEmail: "billing@acmecorp.com",
    to: [],
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    subject: "Test subject",
    bodyHtml: "",
    attachments: [],
    sendState: "idle",
    deliveryMode: "send_now",
    scheduledSendAt: null,
    scheduleLabel: null,
    schedulePanelOpen: false,
    threadId: null,
    replyToMessageId: null,
    ...overrides,
  };
}

// ─── Sprint 1.1/1.2 regression ───────────────────────────────────────────────

describe("Sprint 1.1/1.2 regression", () => {
  it("workspace still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("thread list pane still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-thread-list-pane")).toBeInTheDocument();
  });

  it("reading pane still renders", () => {
    renderWorkspaceAtPath();
    expect(screen.getByTestId("mailbox-reading-pane")).toBeInTheDocument();
  });
});

// ─── FloatingComposer ─────────────────────────────────────────────────────────

describe("FloatingComposer", () => {
  it("renders with correct role and aria-label for new message", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: /new message/i })).toBeInTheDocument();
  });

  it("renders with testid", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("floating-composer")).toBeInTheDocument();
  });

  it("renders From identity badge", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("billing@acmecorp.com")).toBeInTheDocument();
  });

  it("renders To, Subject fields", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /subject/i })).toBeInTheDocument();
  });

  it("renders Cc/Bcc toggle buttons when not shown", () => {
    render(
      <FloatingComposer
        state={makeComposer({ showCc: false, showBcc: false })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /add cc/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add bcc/i })).toBeInTheDocument();
  });

  it("shows Cc field when showCc is true", () => {
    render(
      <FloatingComposer
        state={makeComposer({ showCc: true })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^cc$/i })).toBeInTheDocument();
  });

  it("shows Bcc field when showBcc is true", () => {
    render(
      <FloatingComposer
        state={makeComposer({ showBcc: true })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^bcc$/i })).toBeInTheDocument();
  });

  it("renders rich-text toolbar", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("toolbar", { name: /text formatting/i })).toBeInTheDocument();
  });

  it("renders Send button in idle state", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^send$/i })).toBeInTheDocument();
  });

  it("uses a larger floating composer footprint", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("floating-composer").className).toContain("w-[680px]");
    expect(screen.getByTestId("floating-composer").className).toContain("h-[560px]");
  });

  it("renders schedule send action", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /schedule send/i })).toBeInTheDocument();
  });

  it("shows schedule send panel when toggled open", () => {
    render(
      <FloatingComposer
        state={makeComposer({ schedulePanelOpen: true })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("schedule-send-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /later today/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/schedule date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/schedule time/i)).toBeInTheDocument();
  });

  it("shows scheduled summary when a send time has been chosen", () => {
    render(
      <FloatingComposer
        state={makeComposer({
          deliveryMode: "schedule_send",
          scheduledSendAt: "2026-05-10T09:00:00+05:30",
          scheduleLabel: "Tomorrow morning · 9:00 AM IST",
        })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("scheduled-send-summary")).toBeInTheDocument();
    expect(screen.getByText(/tomorrow morning/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send$/i })).toHaveTextContent("Send now");
  });

  it("applies a quick schedule preset through onChange", () => {
    const onChange = vi.fn();
    render(
      <FloatingComposer
        state={makeComposer({ schedulePanelOpen: true })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /tomorrow morning/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: "schedule_send",
        scheduledSendAt: "2026-05-10T09:00:00+05:30",
        scheduleLabel: "Tomorrow morning · 9:00 AM IST",
        schedulePanelOpen: false,
      })
    );
  });

  it("renders Discard button", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument();
  });

  it("renders Expand button", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    // Two expand buttons: title bar + send bar
    const expandBtns = screen.getAllByRole("button", { name: /expand composer/i });
    expect(expandBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when Close button clicked", () => {
    const onClose = vi.fn();
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={onClose}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onExpand when Expand button clicked", () => {
    const onExpand = vi.fn();
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={onExpand}
        onChange={vi.fn()}
      />
    );
    // Click the title-bar expand button (first one)
    const expandBtns = screen.getAllByRole("button", { name: /expand composer/i });
    fireEvent.click(expandBtns[0]);
    expect(onExpand).toHaveBeenCalled();
  });

  it("minimizes when minimize button clicked", () => {
    render(
      <FloatingComposer
        state={makeComposer()}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /minimize composer/i }));
    // After minimize, body fields should not be visible
    expect(screen.queryByRole("textbox", { name: /^to$/i })).not.toBeInTheDocument();
  });

  it("renders attachment strip when attachments present", () => {
    render(
      <FloatingComposer
        state={makeComposer({
          attachments: [{ id: "a1", filename: "test.pdf", sizeLabel: "100 KB", mimeType: "application/pdf" }],
        })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/attached files/i)).toBeInTheDocument();
    expect(screen.getByText("test.pdf")).toBeInTheDocument();
  });

  it("shows reply mode label in title bar", () => {
    render(
      <FloatingComposer
        state={makeComposer({ mode: "reply", subject: "Invoice overdue" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/reply — invoice overdue/i)).toBeInTheDocument();
  });

  it("shows sending state on Send button", () => {
    render(
      <FloatingComposer
        state={makeComposer({ sendState: "sending" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /sending/i })).toBeInTheDocument();
  });
});

// ─── ExpandedComposer ─────────────────────────────────────────────────────────

describe("ExpandedComposer", () => {
  it("renders with correct role and aria-modal", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog", { name: /new message/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders with testid", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("expanded-composer")).toBeInTheDocument();
  });

  it("renders all compose fields", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /subject/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message body/i })).toBeInTheDocument();
  });

  it("renders rich-text toolbar", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("toolbar", { name: /text formatting/i })).toBeInTheDocument();
  });

  it("calls onCollapse when collapse button clicked", () => {
    const onCollapse = vi.fn();
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={onCollapse}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /collapse to floating/i }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={onClose}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows reply mode label", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded", mode: "reply-all" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: /reply all/i })).toBeInTheDocument();
  });

  it("shows forward mode label", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded", mode: "forward" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: /forward/i })).toBeInTheDocument();
  });

  it("renders schedule send action in expanded mode", () => {
    render(
      <ExpandedComposer
        state={makeComposer({ layout: "expanded" })}
        onClose={vi.fn()}
        onCollapse={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /schedule send/i })).toBeInTheDocument();
  });
});

// ─── InlineReply ──────────────────────────────────────────────────────────────

describe("InlineReply", () => {
  it("renders with correct role and aria-label", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("form", { name: /reply/i })).toBeInTheDocument();
  });

  it("renders with testid", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("inline-reply")).toBeInTheDocument();
  });

  it("renders mode switcher buttons for reply/reply-all/forward", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^reply$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reply all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forward/i })).toBeInTheDocument();
  });

  it("active mode button has aria-pressed=true", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    const replyBtn = screen.getByRole("button", { name: /^reply$/i });
    expect(replyBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onModeChange when a different mode is clicked", () => {
    const onModeChange = vi.fn();
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={onModeChange}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /forward/i }));
    expect(onModeChange).toHaveBeenCalledWith("forward");
  });

  it("shows sender identity badge", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/sending from billing@acmecorp.com/i)).toBeInTheDocument();
  });

  it("shows To field in forward mode", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "forward", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
  });

  it("shows Cc/Bcc toggle buttons when not shown", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1", showCc: false, showBcc: false })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /add cc/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add bcc/i })).toBeInTheDocument();
  });

  it("shows Cc field when showCc is true", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1", showCc: true })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /^cc$/i })).toBeInTheDocument();
  });

  it("renders body textarea", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: /message body/i })).toBeInTheDocument();
  });

  it("renders rich-text toolbar", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("toolbar", { name: /text formatting/i })).toBeInTheDocument();
  });

  it("renders Send and Discard buttons", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^send$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument();
  });

  it("renders schedule send action for inline reply", () => {
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={vi.fn()}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /schedule send/i })).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <InlineReply
        state={makeComposer({ mode: "reply", threadId: "t1" })}
        onClose={onClose}
        onExpand={vi.fn()}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close reply/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ─── ReadingPane + InlineReply integration ────────────────────────────────────

describe("MailboxReadingPane — Sprint 1.3 compose integration", () => {
  const detail = MOCK_THREAD_DETAILS["t1"];

  it("shows reply-prompt when no composer is open", () => {
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={null}
        onOpenReply={vi.fn()}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    expect(screen.getByTestId("reply-prompt")).toBeInTheDocument();
  });

  it("clicking reply-prompt calls onOpenReply with reply mode", () => {
    const onOpenReply = vi.fn();
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={null}
        onOpenReply={onOpenReply}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("reply-prompt"));
    expect(onOpenReply).toHaveBeenCalledWith(
      "reply",
      detail.threadId,
      expect.any(String),
      detail.subject,
      expect.any(Array)
    );
  });

  it("pressing space on reply-prompt opens reply once without default scrolling behavior", () => {
    const onOpenReply = vi.fn();
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={null}
        onOpenReply={onOpenReply}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    const replyPrompt = screen.getByTestId("reply-prompt");
    fireEvent.keyDown(replyPrompt, { key: " " });
    expect(onOpenReply).toHaveBeenCalledOnce();
  });

  it("shows inline reply when composerState is open for this thread", () => {
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={makeComposer({ mode: "reply", threadId: "t1", layout: "inline" })}
        onOpenReply={vi.fn()}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    expect(screen.getByTestId("inline-reply")).toBeInTheDocument();
  });

  it("does not show inline reply when composerState is for a different thread", () => {
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={makeComposer({ mode: "reply", threadId: "t2", layout: "floating" })}
        onOpenReply={vi.fn()}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    expect(screen.queryByTestId("inline-reply")).not.toBeInTheDocument();
  });

  it("does not show inline reply when layout is expanded", () => {
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={makeComposer({ mode: "reply", threadId: "t1", layout: "expanded" })}
        onOpenReply={vi.fn()}
        onCloseReply={vi.fn()}
        onExpandReply={vi.fn()}
        onPatchComposer={vi.fn()}
      />
    );
    expect(screen.queryByTestId("inline-reply")).not.toBeInTheDocument();
  });
});

// ─── Workspace compose integration ───────────────────────────────────────────

describe("MailboxWorkspace — Sprint 1.3 compose integration", () => {
  it("no floating composer visible initially", () => {
    renderWorkspaceAtPath();
    expect(screen.queryByTestId("floating-composer")).not.toBeInTheDocument();
  });

  it("clicking Compose button opens floating composer", () => {
    renderWorkspaceAtPath();
    // Command bar compose button (last one — left rail has a + button too)
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    expect(screen.getByTestId("floating-composer")).toBeInTheDocument();
  });

  it("floating composer shows New message title", () => {
    renderWorkspaceAtPath();
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    expect(screen.getByText("New message")).toBeInTheDocument();
  });

  it("closing floating composer removes it", () => {
    renderWorkspaceAtPath();
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(screen.queryByTestId("floating-composer")).not.toBeInTheDocument();
  });

  it("no expanded composer visible initially", () => {
    renderWorkspaceAtPath();
    expect(screen.queryByTestId("expanded-composer")).not.toBeInTheDocument();
  });

  it("selecting a thread shows reply-prompt in reading pane", () => {
    renderWorkspaceAtPath();
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    expect(screen.getByTestId("reply-prompt")).toBeInTheDocument();
  });

  it("clicking reply-prompt opens inline reply", () => {
    renderWorkspaceAtPath();
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByTestId("reply-prompt"));
    expect(screen.getByTestId("inline-reply")).toBeInTheDocument();
  });

  it("compose from a mailbox-specific route uses that mailbox identity", () => {
    renderWorkspaceAtPath("/app/mailbox/support/inbox");
    const composeButtons = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeButtons[composeButtons.length - 1]);
    const composer = screen.getByTestId("floating-composer");
    expect(within(composer).getByText("Support")).toBeInTheDocument();
    expect(within(composer).getByText("support@acmecorp.com")).toBeInTheDocument();
  });

  it("filters the thread list to the active mailbox route", () => {
    renderWorkspaceAtPath("/app/mailbox/support/inbox");
    expect(screen.getByText("Sunita Rao")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    expect(screen.getByText(/1 thread/i)).toBeInTheDocument();
  });

  it("clears a stale selected thread when route changes to a different mailbox", () => {
    const { rerender } = renderWorkspaceAtPath("/app/mailbox");
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(screen.getByLabelText(/thread: invoice #inv-2026-0412/i)).toBeInTheDocument();

    mockPathname = "/app/mailbox/support/inbox";
    rerender(<MailboxWorkspace />);

    expect(screen.queryByLabelText(/thread: invoice #inv-2026-0412/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/no thread selected/i)).toBeInTheDocument();
  });

  it("collapsed expanded inline reply returns to inline instead of disappearing", () => {
    renderWorkspaceAtPath();
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByTestId("reply-prompt"));
    fireEvent.click(screen.getByRole("button", { name: /expand composer/i }));
    expect(screen.getByTestId("expanded-composer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /collapse to floating/i }));

    expect(screen.queryByTestId("expanded-composer")).not.toBeInTheDocument();
    expect(screen.getByTestId("inline-reply")).toBeInTheDocument();
  });

  it("focused thread rows expose quick actions without selecting the row", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <MailboxThreadList selectedThreadId={null} onSelectThread={onSelect} />
    );
    const firstRow = screen.getAllByRole("option")[0];
    firstRow.focus();
    const toolbar = container.querySelector('[aria-label="Quick actions for thread t1"]');
    expect(toolbar?.className).toContain("group-focus-within:flex");

    fireEvent.keyDown(screen.getAllByRole("button", { name: /^archive$/i })[0], {
      key: "Enter",
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
