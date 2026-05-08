/**
 * Sprint 1.3 tests — Compose, reply, and forward flows.
 * Extends Sprint 1.1/1.2 coverage; does not replace them.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mailbox",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { FloatingComposer } from "../mailbox-floating-composer";
import { ExpandedComposer } from "../mailbox-expanded-composer";
import { InlineReply } from "../mailbox-inline-reply";
import { MailboxReadingPane } from "../mailbox-reading-pane";
import { MailboxWorkspace } from "../mailbox-workspace";
import { MOCK_THREAD_DETAILS } from "../mock-data";
import type { MailboxComposerState } from "../types";

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
    threadId: null,
    replyToMessageId: null,
    ...overrides,
  };
}

// ─── Sprint 1.1/1.2 regression ───────────────────────────────────────────────

describe("Sprint 1.1/1.2 regression", () => {
  it("workspace still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("thread list pane still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-thread-list-pane")).toBeInTheDocument();
  });

  it("reading pane still renders", () => {
    render(<MailboxWorkspace />);
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

  it("shows inline reply when composerState is open for this thread", () => {
    render(
      <MailboxReadingPane
        detail={detail}
        composerState={makeComposer({ mode: "reply", threadId: "t1", layout: "floating" })}
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
    render(<MailboxWorkspace />);
    expect(screen.queryByTestId("floating-composer")).not.toBeInTheDocument();
  });

  it("clicking Compose button opens floating composer", () => {
    render(<MailboxWorkspace />);
    // Command bar compose button (last one — left rail has a + button too)
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    expect(screen.getByTestId("floating-composer")).toBeInTheDocument();
  });

  it("floating composer shows New message title", () => {
    render(<MailboxWorkspace />);
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    expect(screen.getByText("New message")).toBeInTheDocument();
  });

  it("closing floating composer removes it", () => {
    render(<MailboxWorkspace />);
    const composeBtns = screen.getAllByRole("button", { name: /compose new message/i });
    fireEvent.click(composeBtns[composeBtns.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(screen.queryByTestId("floating-composer")).not.toBeInTheDocument();
  });

  it("no expanded composer visible initially", () => {
    render(<MailboxWorkspace />);
    expect(screen.queryByTestId("expanded-composer")).not.toBeInTheDocument();
  });

  it("selecting a thread shows reply-prompt in reading pane", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    expect(screen.getByTestId("reply-prompt")).toBeInTheDocument();
  });

  it("clicking reply-prompt opens inline reply", () => {
    render(<MailboxWorkspace />);
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByTestId("reply-prompt"));
    expect(screen.getByTestId("inline-reply")).toBeInTheDocument();
  });
});
