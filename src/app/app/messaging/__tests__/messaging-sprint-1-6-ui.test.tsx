/**
 * Sprint 1.6 UI Polish — Mention highlights, popups, enhanced top bar
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import { MentionText } from "../messaging-mention-text";
import { MessagingMessageActions } from "../messaging-message-actions";
import { MessagingEmojiPicker } from "../messaging-emoji-picker";
import { MessagingMentionAutocomplete } from "../messaging-mention-autocomplete";
import { MessagingUserCard } from "../messaging-user-card";
import { MessagingCommandBar } from "../messaging-command-bar";

// ─── MentionText ─────────────────────────────────────────────────────────────

describe("MentionText", () => {
  it("renders plain text without mentions", () => {
    render(<MentionText text="Hello world" />);
    expect(screen.queryByTestId("message-mention")).not.toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("highlights @username mentions with data-testid=message-mention", () => {
    render(<MentionText text="Hello @Kavya Nair please check" />);
    const mention = screen.getByTestId("message-mention");
    expect(mention).toBeInTheDocument();
    expect(mention.textContent).toContain("@Kavya Nair");
  });

  it("handles multiple mentions in one text", () => {
    render(<MentionText text="@Priya Sharma and @Arjun Mehta please review" />);
    const mentions = screen.getAllByTestId("message-mention");
    expect(mentions.length).toBe(2);
  });
});

// ─── MessagingMessageActions ─────────────────────────────────────────────────

describe("MessagingMessageActions", () => {
  function render_ma(onClose = vi.fn()) {
    return render(<MessagingMessageActions onClose={onClose} />);
  }

  it("renders data-testid=message-actions-menu", () => {
    render_ma();
    expect(screen.getByTestId("message-actions-menu")).toBeInTheDocument();
  });

  it("renders all 6 action items", () => {
    render_ma();
    expect(screen.getByTestId("msg-action-react")).toBeInTheDocument();
    expect(screen.getByTestId("msg-action-reply")).toBeInTheDocument();
    expect(screen.getByTestId("msg-action-pin")).toBeInTheDocument();
    expect(screen.getByTestId("msg-action-copy")).toBeInTheDocument();
    expect(screen.getByTestId("msg-action-report")).toBeInTheDocument();
    expect(screen.getByTestId("msg-action-delete")).toBeInTheDocument();
  });

  it("clicking an action calls onClose", () => {
    const onClose = vi.fn();
    render_ma(onClose);
    fireEvent.click(screen.getByTestId("msg-action-copy"));
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── MessagingEmojiPicker ────────────────────────────────────────────────────

describe("MessagingEmojiPicker", () => {
  function render_ep(onClose = vi.fn()) {
    return render(<MessagingEmojiPicker onClose={onClose} />);
  }

  it("renders data-testid=emoji-picker", () => {
    render_ep();
    expect(screen.getByTestId("emoji-picker")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render_ep();
    expect(screen.getByTestId("emoji-picker-search")).toBeInTheDocument();
  });

  it("clicking an emoji calls onClose", () => {
    const onClose = vi.fn();
    render_ep(onClose);
    const buttons = screen.getAllByRole("button");
    // First button after the search input should be an emoji
    fireEvent.click(buttons[1]);
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── MessagingMentionAutocomplete ──────────────────────────────────────────

describe("MessagingMentionAutocomplete", () => {
  const defaultProps = {
    query: "",
    onSelect: vi.fn() as (name: string) => void,
    onClose: vi.fn() as () => void,
  };

  function render_ma2(props = defaultProps) {
    return render(<MessagingMentionAutocomplete {...props} />);
  }

  it("renders data-testid=mention-autocomplete", () => {
    render_ma2();
    expect(screen.getByTestId("mention-autocomplete")).toBeInTheDocument();
  });

  it("renders people options", () => {
    render_ma2();
    expect(screen.getByTestId("mention-option-u1")).toBeInTheDocument();
    expect(screen.getByTestId("mention-option-u2")).toBeInTheDocument();
  });

  it("clicking an option calls onSelect and onClose", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render_ma2({ ...defaultProps, onSelect, onClose });
    fireEvent.click(screen.getByTestId("mention-option-u1"));
    expect(onSelect).toHaveBeenCalledWith("Priya Sharma");
    expect(onClose).toHaveBeenCalled();
  });

  it("filters by query", () => {
    render_ma2({ ...defaultProps, query: "Kavya" });
    expect(screen.getByTestId("mention-option-u3")).toBeInTheDocument();
    expect(screen.queryByTestId("mention-option-u1")).not.toBeInTheDocument();
  });
});

// ─── MessagingUserCard ───────────────────────────────────────────────────────

describe("MessagingUserCard", () => {
  const mockUser = {
    id: "u1",
    name: "Priya Sharma",
    avatarInitials: "PS",
    role: "owner" as const,
    presence: "online" as const,
  };

  function render_uc(onClose = vi.fn()) {
    return render(<MessagingUserCard user={mockUser} onClose={onClose} />);
  }

  it("renders data-testid=user-card", () => {
    render_uc();
    expect(screen.getByTestId("user-card")).toBeInTheDocument();
  });

  it("shows user name and presence", () => {
    render_uc();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render_uc();
    expect(screen.getByTestId("user-card-message")).toBeInTheDocument();
    expect(screen.getByTestId("user-card-email")).toBeInTheDocument();
    expect(screen.getByTestId("user-card-call")).toBeInTheDocument();
    expect(screen.getByTestId("user-card-video")).toBeInTheDocument();
  });
});

// ─── MessagingCommandBar New Dropdown ────────────────────────────────────────

describe("MessagingCommandBar New dropdown", () => {
  function render_cb(props = {}) {
    const defaultProps = {
      searchQuery: "",
      onSearchChange: vi.fn(),
      commandBarOpen: false,
      onCommandBarToggle: vi.fn(),
      notifOpen: false,
      onNotifToggle: vi.fn(),
      onSearchFocus: vi.fn(),
      unreadCount: 0,
    };
    return render(<MessagingCommandBar {...defaultProps} {...props} />);
  }

  it("renders data-testid=cmd-new-dropdown", () => {
    render_cb();
    expect(screen.getByTestId("cmd-new-dropdown")).toBeInTheDocument();
  });

  it("clicking dropdown shows new action menu", () => {
    render_cb();
    fireEvent.click(screen.getByTestId("cmd-new-dropdown"));
    expect(screen.getByTestId("cmd-new-menu")).toBeInTheDocument();
    expect(screen.getByTestId("cmd-new-message")).toBeInTheDocument();
    expect(screen.getByTestId("cmd-new-channel")).toBeInTheDocument();
    expect(screen.getByTestId("cmd-new-group")).toBeInTheDocument();
  });

  it("shows numeric unread badge when unreadCount > 0", () => {
    render_cb({ unreadCount: 3 });
    const bell = screen.getByTestId("notif-bell-button");
    expect(bell.textContent).toContain("3");
  });

  it("shows 9+ badge when unreadCount > 9", () => {
    render_cb({ unreadCount: 12 });
    const bell = screen.getByTestId("notif-bell-button");
    expect(bell.textContent).toContain("9+");
  });
});
