/**
 * Sprint 1.3 — Composer and Thread UX tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

vi.mock("@/app/app/messaging/lib/use-conversation-list");
vi.mock("@/app/app/messaging/lib/use-conversation-detail");
vi.mock("@/app/app/messaging/lib/use-conversation-tasks");
vi.mock("@/app/app/messaging/lib/use-thread-replies");
vi.mock("@/app/app/messaging/lib/use-attachment-files");

import { setupLegacyMessagingMocks } from "./legacy-setup-helper";

beforeEach(() => {
  setupLegacyMessagingMocks();
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props, children),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => React.createElement("ul", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

import { MessagingComposer } from "../messaging-composer";
import { MessagingThreadPanel } from "../messaging-thread-panel";
import { MOCK_MESSAGES_CHANNEL_FINANCE, MOCK_THREAD_REPLIES_CH_F_1 } from "../mock-data";
import type { ConversationMessage } from "../types";

const ANCHOR = MOCK_MESSAGES_CHANNEL_FINANCE[0];
const REPLIES = MOCK_THREAD_REPLIES_CH_F_1;

function rc(props: Partial<React.ComponentProps<typeof MessagingComposer>> = {}) {
  return render(<MessagingComposer placeholder="Message #finance-ops" isAccessible={true} {...props} />);
}
function rtp(replies: ConversationMessage[] = REPLIES, onClose = vi.fn()) {
  return render(<MessagingThreadPanel anchorMessage={ANCHOR} replies={replies} onClose={onClose} />);
}

describe("MessagingComposer", () => {
  it("renders Bold toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument(); });
  it("renders Italic toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Italic" })).toBeInTheDocument(); });
  it("renders Strikethrough toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Strikethrough" })).toBeInTheDocument(); });
  it("renders Link toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument(); });
  it("renders Bulleted list toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Bulleted list" })).toBeInTheDocument(); });
  it("renders Code block toolbar button", () => { rc(); expect(screen.getByRole("button", { name: "Code block" })).toBeInTheDocument(); });
  it("renders send button", () => { rc(); expect(screen.getByTestId("composer-send-btn")).toBeInTheDocument(); });
  it("renders attach button", () => { rc(); expect(screen.getByTestId("composer-attach-btn")).toBeInTheDocument(); });
  it("renders mention button", () => { rc(); expect(screen.getByTestId("composer-mention-btn")).toBeInTheDocument(); });
  it("renders emoji button", () => { rc(); expect(screen.getByTestId("composer-emoji-btn")).toBeInTheDocument(); });
  it("shows restricted overlay when isAccessible=false", () => { rc({ isAccessible: false }); expect(screen.getByTestId("composer-restricted")).toBeInTheDocument(); });
  it("no restricted overlay when isAccessible=true", () => { rc({ isAccessible: true }); expect(screen.queryByTestId("composer-restricted")).not.toBeInTheDocument(); });
  it("clicking mention button shows mention popover", () => {
    rc();
    fireEvent.click(screen.getByTestId("composer-mention-btn"));
    expect(screen.getByTestId("composer-mention-popover")).toBeInTheDocument();
  });
  it("clicking slash button shows slash popover", () => {
    rc();
    fireEvent.click(screen.getByTestId("composer-slash-btn"));
    expect(screen.getByTestId("composer-slash-popover")).toBeInTheDocument();
  });
  it("mention popover lists at least one member", () => {
    rc();
    fireEvent.click(screen.getByTestId("composer-mention-btn"));
    expect(screen.getByTestId("composer-mention-popover").querySelectorAll("[data-testid^='mention-suggestion-']").length).toBeGreaterThanOrEqual(1);
  });
});

describe("MessagingThreadPanel", () => {
  it("renders thread panel header", () => { rtp(); expect(screen.getByTestId("thread-panel-header")).toBeInTheDocument(); });
  it("close button calls onClose", () => {
    const onClose = vi.fn();
    rtp(REPLIES, onClose);
    fireEvent.click(screen.getByTestId("thread-panel-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("renders anchor message", () => { rtp(); expect(screen.getByTestId("thread-anchor-message")).toBeInTheDocument(); });
  it("renders reply count badge", () => { rtp(); expect(screen.getByTestId("thread-reply-count")).toBeInTheDocument(); });
  it("renders each reply row", () => { rtp(); REPLIES.forEach(r => expect(screen.getByTestId(`thread-reply-${r.id}`)).toBeInTheDocument()); });
  it("renders thread composer", () => { rtp(); expect(screen.getByTestId("thread-composer")).toBeInTheDocument(); });
  it("shows empty state for empty replies", () => { rtp([]); expect(screen.getByText(/no replies yet/i)).toBeInTheDocument(); });
  it("hover actions panel is in the DOM for each reply", () => { rtp(); REPLIES.forEach(r => expect(screen.getByTestId(`thread-reply-hover-actions-${r.id}`)).toBeInTheDocument()); });
  it("clicking edit shows inline edit composer", () => {
    rtp();
    fireEvent.click(screen.getByTestId(`thread-reply-edit-btn-${REPLIES[0].id}`));
    expect(screen.getByTestId(`inline-edit-composer-${REPLIES[0].id}`)).toBeInTheDocument();
  });
  it("Cancel dismisses inline edit composer", () => {
    rtp();
    fireEvent.click(screen.getByTestId(`thread-reply-edit-btn-${REPLIES[0].id}`));
    fireEvent.click(screen.getByTestId(`inline-edit-cancel-${REPLIES[0].id}`));
    expect(screen.queryByTestId(`inline-edit-composer-${REPLIES[0].id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`thread-reply-${REPLIES[0].id}`)).toBeInTheDocument();
  });
  it("ReactionChip aria-pressed=true when reactedByCurrentUser=true", () => {
    const reply: ConversationMessage = { ...REPLIES[0], id: "r-true", reactions: [{ emoji: "👍", count: 1, reactedByCurrentUser: true }] };
    render(<MessagingThreadPanel anchorMessage={ANCHOR} replies={[reply]} onClose={vi.fn()} />);
    expect(within(screen.getByTestId("thread-reply-r-true")).getByTestId("reaction-chip-👍")).toHaveAttribute("aria-pressed", "true");
  });
  it("ReactionChip aria-pressed=false when reactedByCurrentUser=false", () => {
    const reply: ConversationMessage = { ...REPLIES[0], id: "r-false", reactions: [{ emoji: "🎯", count: 2, reactedByCurrentUser: false }] };
    render(<MessagingThreadPanel anchorMessage={ANCHOR} replies={[reply]} onClose={vi.fn()} />);
    expect(within(screen.getByTestId("thread-reply-r-false")).getByTestId("reaction-chip-🎯")).toHaveAttribute("aria-pressed", "false");
  });
});
