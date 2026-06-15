/**
 * Sprint 1.2 — Conversation list and reading workspace tests
 *
 * Covers:
 * - Messaging route still renders (no regression)
 * - Sprint 1.1 shell still renders correctly (no regression)
 * - Conversation list renders expected rows for channels, DMs, groups
 * - Active conversation state is visible
 * - No-conversation-selected state renders correctly
 * - Channels / DMs / groups render distinct workspace cues
 * - Reading workspace structure renders correctly
 * - Thread-open direction renders correctly
 * - Mobile/tablet fallback still allows reaching these states
 * - Admin/governance reachability from the shell is preserved
 * - No regression in app shell integration
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) =>
      React.createElement("ul", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { MessagingWorkspace } from "../messaging-workspace";
import {
  ChannelConversationList,
  DMConversationList,
  GroupConversationList,
} from "../messaging-conversation-list";
import {
  MessagingReadingWorkspace,
  NoConversationSelected,
} from "../messaging-reading-workspace";
import {
  MOCK_CHANNELS,
  MOCK_DMS,
  MOCK_GROUPS,
  MOCK_MESSAGES_CHANNEL_FINANCE,
  MOCK_MESSAGES_CHANNEL_GENERAL,
  MOCK_MESSAGES_DM_ARJUN,
  MOCK_MESSAGES_DM_SNEHA,
  MOCK_MESSAGES_GROUP_Q2,
  MOCK_MESSAGES_GROUP_VENDOR,
  MOCK_THREAD_REPLIES_CH_F_1,
  MOCK_ACTIVE_CHANNEL,
  MOCK_ACTIVE_DM,
  MOCK_ACTIVE_GROUP,
} from "../mock-data";
import type { ActiveConversation } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderChannelList(activeId: string | null = null) {
  return render(
    <ChannelConversationList
      activeConversationId={activeId}
      onSelect={vi.fn()}
    />
  );
}

function renderDMList(activeId: string | null = null) {
  return render(
    <DMConversationList
      activeConversationId={activeId}
      onSelect={vi.fn()}
    />
  );
}

function renderGroupList(activeId: string | null = null) {
  return render(
    <GroupConversationList
      activeConversationId={activeId}
      onSelect={vi.fn()}
    />
  );
}

function renderReadingWorkspace(conversation: ActiveConversation | null, kind?: "channel" | "dm" | "group") {
  return render(
    <MessagingReadingWorkspace conversation={conversation} sectionKind={kind} />
  );
}

// ─── Sprint 1.1 regression ────────────────────────────────────────────────────

describe("Sprint 1.1 regression — shell still renders", () => {
  it("renders the workspace shell", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-workspace")).toBeInTheDocument();
  });

  it("renders the left rail", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-left-rail")).toBeInTheDocument();
  });

  it("renders the command bar", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-command-bar")).toBeInTheDocument();
  });

  it("renders the mobile nav", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-mobile-nav")).toBeInTheDocument();
  });

  it("admin section is still reachable from the left rail", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-admin"));
    expect(screen.getByTestId("messaging-pane-admin")).toBeInTheDocument();
  });

  it("admin section is still reachable from the mobile nav", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-mobile-section-admin"));
    expect(screen.getByTestId("messaging-pane-admin")).toBeInTheDocument();
  });

  it("tasks section still renders via left rail", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-tasks"));
    expect(screen.getByTestId("messaging-pane-tasks")).toBeInTheDocument();
  });

  it("meetings section still renders via left rail", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-meetings"));
    expect(screen.getByTestId("messaging-pane-meetings")).toBeInTheDocument();
  });

  it("files section still renders via left rail", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-files"));
    expect(screen.getByTestId("messaging-pane-files")).toBeInTheDocument();
  });
});

// ─── MessagingWorkspace — Sprint 1.2 two-column layout ───────────────────────

describe("MessagingWorkspace — Sprint 1.2 two-column layout", () => {
  it("defaults to channels section and renders the workspace pane wrapper", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-workspace-pane")).toBeInTheDocument();
  });

  it("renders the conversation list column for channels section", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("conversation-list-column")).toBeInTheDocument();
  });

  it("keeps the conversation list available below md for mobile/tablet direction", () => {
    render(<MessagingWorkspace />);
    const column = screen.getByTestId("conversation-list-column");
    expect(column.className).not.toContain("hidden md:flex");
    expect(column.className).toContain("flex");
  });

  it("renders the reading workspace for channels section", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("reading-workspace")).toBeInTheDocument();
  });

  it("shows no-selection state by default in channels section", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("reading-workspace-no-selection")).toBeInTheDocument();
  });

  it("switches to DMs section and shows conversation list", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-dms"));
    expect(screen.getByTestId("conv-list-dms")).toBeInTheDocument();
  });

  it("switches to groups section and shows conversation list", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-groups"));
    expect(screen.getByTestId("conv-list-groups")).toBeInTheDocument();
  });

  it("selecting a channel row opens the reading workspace", () => {
    render(<MessagingWorkspace />);
    const financeRow = screen.getByTestId("conv-row-channel-ch-finance");
    fireEvent.click(financeRow);
    expect(screen.getByTestId("channel-workspace")).toBeInTheDocument();
  });

  it("selecting a DM row opens the DM reading workspace", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-dms"));
    const dmRow = screen.getByTestId("conv-row-dm-dm-1");
    fireEvent.click(dmRow);
    expect(screen.getByTestId("dm-workspace")).toBeInTheDocument();
  });

  it("selecting a group row opens the group reading workspace", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-groups"));
    const groupRow = screen.getByTestId("conv-row-group-grp-q2-close");
    fireEvent.click(groupRow);
    expect(screen.getByTestId("group-workspace")).toBeInTheDocument();
  });

  it("mobile/tablet users can select a conversation and open the reading workspace", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("conv-row-channel-ch-general"));
    expect(screen.getByTestId("channel-workspace")).toBeInTheDocument();
    expect(screen.getByText(MOCK_MESSAGES_CHANNEL_GENERAL[0].body)).toBeInTheDocument();
  });
});

// ─── ChannelConversationList ──────────────────────────────────────────────────

describe("ChannelConversationList", () => {
  it("renders the channel list container", () => {
    renderChannelList();
    expect(screen.getByTestId("conv-list-channels")).toBeInTheDocument();
  });

  it("renders a row for every mock channel", () => {
    renderChannelList();
    MOCK_CHANNELS.forEach((ch) => {
      expect(screen.getByTestId(`conv-row-channel-${ch.id}`)).toBeInTheDocument();
    });
  });

  it("marks the active channel row as pressed", () => {
    renderChannelList("ch-finance");
    const row = screen.getByTestId("conv-row-channel-ch-finance");
    expect(row.getAttribute("aria-pressed")).toBe("true");
  });

  it("non-active rows are not pressed", () => {
    renderChannelList("ch-finance");
    const row = screen.getByTestId("conv-row-channel-ch-general");
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onSelect with correct ActiveConversation when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ChannelConversationList activeConversationId={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByTestId("conv-row-channel-ch-finance"));
    expect(onSelect).toHaveBeenCalledOnce();
    const arg = onSelect.mock.calls[0][0] as ActiveConversation;
    expect(arg.id).toBe("ch-finance");
    expect(arg.kind).toBe("channel");
    expect(arg.channelVisibility).toBe("private");
  });

  it("shows unread pip for channels with unread messages", () => {
    renderChannelList();
    const financeRow = screen.getByTestId("conv-row-channel-ch-finance");
    expect(financeRow.querySelector("[aria-label*='unread']")).toBeInTheDocument();
  });

  it("filters channels by search input", () => {
    renderChannelList();
    const searchInput = screen.getByPlaceholderText("Find a channel…");
    fireEvent.change(searchInput, { target: { value: "finance" } });
    expect(screen.getByTestId("conv-row-channel-ch-finance")).toBeInTheDocument();
    expect(screen.queryByTestId("conv-row-channel-ch-general")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no results", () => {
    renderChannelList();
    const searchInput = screen.getByPlaceholderText("Find a channel…");
    fireEvent.change(searchInput, { target: { value: "zzznomatch" } });
    expect(screen.getByText("No channels match your search.")).toBeInTheDocument();
  });

  it("channel rows are semantic buttons", () => {
    renderChannelList();
    const row = screen.getByTestId("conv-row-channel-ch-general");
    expect(row.tagName).toBe("BUTTON");
  });
});

// ─── DMConversationList ───────────────────────────────────────────────────────

describe("DMConversationList", () => {
  it("renders the DM list container", () => {
    renderDMList();
    expect(screen.getByTestId("conv-list-dms")).toBeInTheDocument();
  });

  it("renders a row for every mock DM", () => {
    renderDMList();
    MOCK_DMS.forEach((dm) => {
      expect(screen.getByTestId(`conv-row-dm-${dm.id}`)).toBeInTheDocument();
    });
  });

  it("marks the active DM row as pressed", () => {
    renderDMList("dm-1");
    expect(screen.getByTestId("conv-row-dm-dm-1").getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onSelect with correct ActiveConversation for DM", () => {
    const onSelect = vi.fn();
    render(<DMConversationList activeConversationId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("conv-row-dm-dm-1"));
    const arg = onSelect.mock.calls[0][0] as ActiveConversation;
    expect(arg.kind).toBe("dm");
    expect(arg.dmParticipant).toBeDefined();
  });

  it("filters DMs by participant name", () => {
    renderDMList();
    const searchInput = screen.getByPlaceholderText("Find a person…");
    fireEvent.change(searchInput, { target: { value: "Arjun" } });
    expect(screen.getByTestId("conv-row-dm-dm-1")).toBeInTheDocument();
    expect(screen.queryByTestId("conv-row-dm-dm-2")).not.toBeInTheDocument();
  });
});

// ─── GroupConversationList ────────────────────────────────────────────────────

describe("GroupConversationList", () => {
  it("renders the group list container", () => {
    renderGroupList();
    expect(screen.getByTestId("conv-list-groups")).toBeInTheDocument();
  });

  it("renders a row for every mock group", () => {
    renderGroupList();
    MOCK_GROUPS.forEach((grp) => {
      expect(screen.getByTestId(`conv-row-group-${grp.id}`)).toBeInTheDocument();
    });
  });

  it("marks the active group row as pressed", () => {
    renderGroupList("grp-q2-close");
    expect(
      screen.getByTestId("conv-row-group-grp-q2-close").getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("calls onSelect with correct ActiveConversation for group", () => {
    const onSelect = vi.fn();
    render(<GroupConversationList activeConversationId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("conv-row-group-grp-q2-close"));
    const arg = onSelect.mock.calls[0][0] as ActiveConversation;
    expect(arg.kind).toBe("group");
    expect(arg.groupMemberCount).toBeDefined();
  });
});

// ─── NoConversationSelected ───────────────────────────────────────────────────

describe("NoConversationSelected", () => {
  it("renders for channel kind", () => {
    render(<NoConversationSelected kind="channel" />);
    expect(screen.getByTestId("reading-workspace-no-selection")).toBeInTheDocument();
    expect(screen.getByText("Select a channel")).toBeInTheDocument();
  });

  it("renders for dm kind", () => {
    render(<NoConversationSelected kind="dm" />);
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  it("renders for group kind", () => {
    render(<NoConversationSelected kind="group" />);
    expect(screen.getByText("Select a group")).toBeInTheDocument();
  });

  it("renders without a kind prop (defaults to channel)", () => {
    render(<NoConversationSelected />);
    expect(screen.getByTestId("reading-workspace-no-selection")).toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — no selection ─────────────────────────────────

describe("MessagingReadingWorkspace — no selection", () => {
  it("renders the reading workspace container", () => {
    renderReadingWorkspace(null, "channel");
    expect(screen.getByTestId("reading-workspace")).toBeInTheDocument();
  });

  it("shows no-selection state when conversation is null", () => {
    renderReadingWorkspace(null, "channel");
    expect(screen.getByTestId("reading-workspace-no-selection")).toBeInTheDocument();
  });

  it("shows DM-specific no-selection copy", () => {
    renderReadingWorkspace(null, "dm");
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  it("shows group-specific no-selection copy", () => {
    renderReadingWorkspace(null, "group");
    expect(screen.getByText("Select a group")).toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — restricted state ─────────────────────────────

describe("MessagingReadingWorkspace — restricted state", () => {
  it("renders restricted state when isAccessible is false", () => {
    const restricted: ActiveConversation = {
      ...MOCK_ACTIVE_CHANNEL,
      isAccessible: false,
      restrictedReason: "You are not a member of this private channel.",
    };
    renderReadingWorkspace(restricted);
    expect(screen.getByTestId("reading-workspace-restricted")).toBeInTheDocument();
    expect(screen.getByText("Access restricted")).toBeInTheDocument();
  });

  it("shows the restricted reason text", () => {
    const restricted: ActiveConversation = {
      ...MOCK_ACTIVE_CHANNEL,
      isAccessible: false,
      restrictedReason: "You are not a member of this private channel.",
    };
    renderReadingWorkspace(restricted);
    expect(
      screen.getByText("You are not a member of this private channel.")
    ).toBeInTheDocument();
  });

  it("shows request access button in restricted state", () => {
    const restricted: ActiveConversation = {
      ...MOCK_ACTIVE_CHANNEL,
      isAccessible: false,
    };
    renderReadingWorkspace(restricted);
    expect(screen.getByText("Request access")).toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — channel workspace ────────────────────────────

describe("MessagingReadingWorkspace — channel workspace", () => {
  it("renders the channel workspace", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByTestId("channel-workspace")).toBeInTheDocument();
  });

  it("renders the workspace header", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByTestId("reading-workspace-header")).toBeInTheDocument();
  });

  it("renders the channel context bar", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByTestId("channel-context-bar")).toBeInTheDocument();
  });

  it("renders the message feed", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByTestId("message-feed")).toBeInTheDocument();
  });

  it("renders all mock channel messages", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    MOCK_MESSAGES_CHANNEL_FINANCE.forEach((msg) => {
      expect(screen.getByTestId(`message-row-${msg.id}`)).toBeInTheDocument();
    });
  });

  it("renders the composer shell", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByTestId("reading-workspace-composer")).toBeInTheDocument();
  });

  it("composer send button is disabled (static sprint)", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    const sendBtn = screen.getByLabelText(/Send message/i);
    expect(sendBtn).toBeDisabled();
  });

  it("channel name appears in the header", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.getByText("#finance-ops")).toBeInTheDocument();
  });

  it("renders the selected channel's own message feed", () => {
    render(
      <MessagingReadingWorkspace
        conversation={{
          id: "ch-general",
          kind: "channel",
          name: "general",
          subtitle: "Company-wide announcements and updates · 48 members",
          channelVisibility: "public",
          isAccessible: true,
          threadOpen: false,
          threadAnchorMessageId: null,
        }}
      />
    );
    expect(screen.getByText(MOCK_MESSAGES_CHANNEL_GENERAL[0].body)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_MESSAGES_CHANNEL_FINANCE[0].body)).not.toBeInTheDocument();
  });

  it("thread panel is not visible by default", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    expect(screen.queryByTestId("thread-panel")).not.toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — thread open direction ────────────────────────

describe("MessagingReadingWorkspace — thread open direction", () => {
  it("thread cue button is rendered for messages with threads", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    const threadCues = screen.getAllByTestId("thread-cue-button");
    expect(threadCues.length).toBeGreaterThan(0);
  });

  it("clicking a thread cue opens the thread panel", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    const threadCue = screen.getAllByTestId("thread-cue-button")[0];
    fireEvent.click(threadCue);
    expect(screen.getByTestId("thread-panel")).toBeInTheDocument();
  });

  it("thread panel shows the anchor message", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getAllByTestId("thread-cue-button")[0]);
    expect(screen.getByTestId("thread-anchor-message")).toBeInTheDocument();
  });

  it("thread panel shows replies", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getAllByTestId("thread-cue-button")[0]);
    MOCK_THREAD_REPLIES_CH_F_1.forEach((reply) => {
      expect(screen.getByTestId(`thread-reply-${reply.id}`)).toBeInTheDocument();
    });
  });

  it("thread panel has a close button", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getAllByTestId("thread-cue-button")[0]);
    expect(screen.getByTestId("thread-panel-close")).toBeInTheDocument();
  });

  it("closing the thread panel removes it from the DOM", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getAllByTestId("thread-cue-button")[0]);
    expect(screen.getByTestId("thread-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("thread-panel-close"));
    expect(screen.queryByTestId("thread-panel")).not.toBeInTheDocument();
  });

  it("thread panel toggle button in header opens the thread panel", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getByTestId("thread-panel-toggle"));
    expect(screen.getByTestId("thread-panel")).toBeInTheDocument();
  });

  it("thread panel has a composer shell", () => {
    renderReadingWorkspace(MOCK_ACTIVE_CHANNEL);
    fireEvent.click(screen.getAllByTestId("thread-cue-button")[0]);
    expect(screen.getByTestId("thread-composer")).toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — DM workspace ────────────────────────────────

describe("MessagingReadingWorkspace — DM workspace", () => {
  it("renders the DM workspace", () => {
    renderReadingWorkspace(MOCK_ACTIVE_DM);
    expect(screen.getByTestId("dm-workspace")).toBeInTheDocument();
  });

  it("renders the DM context bar", () => {
    renderReadingWorkspace(MOCK_ACTIVE_DM);
    expect(screen.getByTestId("dm-context-bar")).toBeInTheDocument();
  });

  it("renders all mock DM messages", () => {
    renderReadingWorkspace(MOCK_ACTIVE_DM);
    MOCK_MESSAGES_DM_ARJUN.forEach((msg) => {
      expect(screen.getByTestId(`message-row-${msg.id}`)).toBeInTheDocument();
    });
  });

  it("DM participant name appears in the header", () => {
    renderReadingWorkspace(MOCK_ACTIVE_DM);
    // Name appears in header and in message rows — just confirm at least one instance
    const matches = screen.getAllByText("Arjun Mehta");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders the selected DM's own message feed", () => {
    render(
      <MessagingReadingWorkspace
        conversation={{
          id: "dm-3",
          kind: "dm",
          name: "Sneha Iyer",
          subtitle: "Member · Online",
          dmParticipant: {
            id: "u5",
            name: "Sneha Iyer",
            avatarInitials: "SI",
            role: "member",
            presence: "online",
          },
          isAccessible: true,
          threadOpen: false,
          threadAnchorMessageId: null,
        }}
      />
    );
    expect(screen.getByText(MOCK_MESSAGES_DM_SNEHA[0].body)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_MESSAGES_DM_ARJUN[0].body)).not.toBeInTheDocument();
  });
});

// ─── MessagingReadingWorkspace — group workspace ──────────────────────────────

describe("MessagingReadingWorkspace — group workspace", () => {
  it("renders the group workspace", () => {
    renderReadingWorkspace(MOCK_ACTIVE_GROUP);
    expect(screen.getByTestId("group-workspace")).toBeInTheDocument();
  });

  it("renders the group context bar", () => {
    renderReadingWorkspace(MOCK_ACTIVE_GROUP);
    expect(screen.getByTestId("group-context-bar")).toBeInTheDocument();
  });

  it("renders all mock group messages", () => {
    renderReadingWorkspace(MOCK_ACTIVE_GROUP);
    MOCK_MESSAGES_GROUP_Q2.forEach((msg) => {
      expect(screen.getByTestId(`message-row-${msg.id}`)).toBeInTheDocument();
    });
  });

  it("group name appears in the header", () => {
    renderReadingWorkspace(MOCK_ACTIVE_GROUP);
    expect(screen.getByText("Q2 Close Team")).toBeInTheDocument();
  });

  it("renders the selected group's own message feed", () => {
    render(
      <MessagingReadingWorkspace
        conversation={{
          id: "grp-vendor-onboard",
          kind: "group",
          name: "Vendor Onboarding",
          subtitle: "Group · 4 members",
          groupMemberCount: 4,
          groupIsPrivate: false,
          isAccessible: true,
          threadOpen: false,
          threadAnchorMessageId: null,
        }}
      />
    );
    expect(screen.getByText(MOCK_MESSAGES_GROUP_VENDOR[0].body)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_MESSAGES_GROUP_Q2[0].body)).not.toBeInTheDocument();
  });

  it("public groups do not render private-group cues in the header", () => {
    render(
      <MessagingReadingWorkspace
        conversation={{
          id: "grp-vendor-onboard",
          kind: "group",
          name: "Vendor Onboarding",
          subtitle: "Group · 4 members",
          groupMemberCount: 4,
          groupIsPrivate: false,
          isAccessible: true,
          threadOpen: false,
          threadAnchorMessageId: null,
        }}
      />
    );
    expect(screen.getAllByText("Group · 4 members").length).toBeGreaterThan(0);
    expect(screen.queryByText("Private group · 4 members")).not.toBeInTheDocument();
  });
});

// ─── Sprint 1.2 mock data integrity ──────────────────────────────────────────

describe("Sprint 1.2 mock data integrity", () => {
  it("has channel finance messages", () => {
    expect(MOCK_MESSAGES_CHANNEL_FINANCE.length).toBeGreaterThanOrEqual(3);
  });

  it("has DM messages for Arjun", () => {
    expect(MOCK_MESSAGES_DM_ARJUN.length).toBeGreaterThanOrEqual(2);
  });

  it("has group Q2 messages", () => {
    expect(MOCK_MESSAGES_GROUP_Q2.length).toBeGreaterThanOrEqual(3);
  });

  it("has thread replies for channel finance message 1", () => {
    expect(MOCK_THREAD_REPLIES_CH_F_1.length).toBeGreaterThanOrEqual(2);
  });

  it("MOCK_ACTIVE_CHANNEL has correct kind", () => {
    expect(MOCK_ACTIVE_CHANNEL.kind).toBe("channel");
    expect(MOCK_ACTIVE_CHANNEL.isAccessible).toBe(true);
  });

  it("MOCK_ACTIVE_DM has correct kind and participant", () => {
    expect(MOCK_ACTIVE_DM.kind).toBe("dm");
    expect(MOCK_ACTIVE_DM.dmParticipant).toBeDefined();
  });

  it("MOCK_ACTIVE_GROUP has correct kind and member count", () => {
    expect(MOCK_ACTIVE_GROUP.kind).toBe("group");
    expect(MOCK_ACTIVE_GROUP.groupMemberCount).toBeGreaterThan(0);
  });

  it("all channel messages have valid authorRole", () => {
    MOCK_MESSAGES_CHANNEL_FINANCE.forEach((msg) => {
      expect(["owner", "admin", "member"]).toContain(msg.authorRole);
    });
  });

  it("thread replies have no nested threads", () => {
    MOCK_THREAD_REPLIES_CH_F_1.forEach((reply) => {
      expect(reply.hasThread).toBe(false);
    });
  });
});
