/**
 * Sprint 1.4 — Channels, Groups, and Membership Admin UX tests
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

import { MessagingChannelDetail } from "../messaging-channel-detail";
import { MessagingGroupDetail } from "../messaging-group-detail";
import { MessagingChannelCreate } from "../messaging-channel-create";
import { MessagingGroupCreate } from "../messaging-group-create";
import { MessagingAdminPanel } from "../messaging-admin-panel";
import { MOCK_AUDIT_LOG } from "../mock-data";
import type { ActiveConversation } from "../types";

const MOCK_CHANNEL_CONV: ActiveConversation = {
  id: "ch-finance",
  kind: "channel",
  name: "finance-ops",
  subtitle: "Finance team coordination · 12 members",
  channelVisibility: "private",
  isAccessible: true,
  threadOpen: false,
  threadAnchorMessageId: null,
};

const MOCK_GROUP_CONV: ActiveConversation = {
  id: "grp-q2-close",
  kind: "group",
  name: "Q2 Close Team",
  subtitle: "Private group · 6 members",
  groupMemberCount: 6,
  groupIsPrivate: true,
  isAccessible: true,
  threadOpen: false,
  threadAnchorMessageId: null,
};

// ─── MessagingChannelDetail ───────────────────────────────────────────────────

describe("MessagingChannelDetail", () => {
  function render_cd(onClose = vi.fn()) {
    return render(
      <MessagingChannelDetail conversation={MOCK_CHANNEL_CONV} onClose={onClose} />
    );
  }

  it("renders data-testid channel-detail-panel", () => {
    render_cd();
    expect(screen.getByTestId("channel-detail-panel")).toBeInTheDocument();
  });

  it("renders channel name", () => {
    render_cd();
    expect(screen.getByText("finance-ops")).toBeInTheDocument();
  });

  it("renders visibility badge on info tab", () => {
    render_cd();
    expect(screen.getByTestId("channel-visibility-badge")).toBeInTheDocument();
  });

  it("default tab is info — info tab content visible", () => {
    render_cd();
    expect(screen.getByTestId("channel-info-tab")).toBeInTheDocument();
  });

  it("clicking Members tab shows members list", () => {
    render_cd();
    fireEvent.click(screen.getByTestId("channel-tab-members"));
    expect(screen.getByTestId("channel-members-tab")).toBeInTheDocument();
  });

  it("member rows render with presence dot", () => {
    render_cd();
    fireEvent.click(screen.getByTestId("channel-tab-members"));
    const dots = screen.getAllByTestId("member-presence-dot");
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking Pinned tab shows pinned messages", () => {
    render_cd();
    fireEvent.click(screen.getByTestId("channel-tab-pinned"));
    expect(screen.getByTestId("channel-pinned-tab")).toBeInTheDocument();
  });

  it("pinned tab shows at least one pinned message", () => {
    render_cd();
    fireEvent.click(screen.getByTestId("channel-tab-pinned"));
    expect(screen.getByTestId("pinned-message-pin-1")).toBeInTheDocument();
  });

  it("clicking Settings tab shows visibility toggle", () => {
    render_cd();
    fireEvent.click(screen.getByTestId("channel-tab-settings"));
    expect(screen.getByTestId("channel-settings-tab")).toBeInTheDocument();
    expect(screen.getByTestId("channel-visibility-setting-public")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render_cd(onClose);
    fireEvent.click(screen.getByTestId("channel-detail-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ─── MessagingGroupDetail ─────────────────────────────────────────────────────

describe("MessagingGroupDetail", () => {
  function render_gd(onClose = vi.fn()) {
    return render(
      <MessagingGroupDetail conversation={MOCK_GROUP_CONV} onClose={onClose} />
    );
  }

  it("renders group-detail-panel", () => {
    render_gd();
    expect(screen.getByTestId("group-detail-panel")).toBeInTheDocument();
  });

  it("renders group name", () => {
    render_gd();
    expect(screen.getAllByText("Q2 Close Team").length).toBeGreaterThanOrEqual(1);
  });

  it("renders privacy badge", () => {
    render_gd();
    expect(screen.getByTestId("group-privacy-badge")).toBeInTheDocument();
  });

  it("Members tab renders member list", () => {
    render_gd();
    fireEvent.click(screen.getByTestId("group-tab-members"));
    expect(screen.getByTestId("group-members-tab")).toBeInTheDocument();
    expect(screen.getByTestId("group-member-row-mem-1")).toBeInTheDocument();
  });

  it("Settings tab shows privacy toggle", () => {
    render_gd();
    fireEvent.click(screen.getByTestId("group-tab-settings"));
    expect(screen.getByTestId("group-settings-tab")).toBeInTheDocument();
    expect(screen.getByTestId("group-privacy-setting-private")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render_gd(onClose);
    fireEvent.click(screen.getByTestId("group-detail-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ─── MessagingChannelCreate ───────────────────────────────────────────────────

describe("MessagingChannelCreate", () => {
  function render_cc(onClose = vi.fn()) {
    return render(<MessagingChannelCreate onClose={onClose} onCreate={vi.fn()} />);
  }

  it("renders channel-create-modal", () => {
    render_cc();
    expect(screen.getByTestId("channel-create-modal")).toBeInTheDocument();
  });

  it("channel name input is present", () => {
    render_cc();
    expect(screen.getByTestId("channel-name-input")).toBeInTheDocument();
  });

  it("visibility toggle shows Public and Private options", () => {
    render_cc();
    expect(screen.getByTestId("channel-visibility-public")).toBeInTheDocument();
    expect(screen.getByTestId("channel-visibility-private")).toBeInTheDocument();
  });

  it("submit button is present", () => {
    render_cc();
    expect(screen.getByTestId("channel-create-submit")).toBeInTheDocument();
  });

  it("submit button is disabled when name is empty", () => {
    render_cc();
    expect(screen.getByTestId("channel-create-submit")).toBeDisabled();
  });

  it("submit button is enabled when name has content", () => {
    render_cc();
    fireEvent.change(screen.getByTestId("channel-name-input"), {
      target: { value: "my-channel" },
    });
    expect(screen.getByTestId("channel-create-submit")).not.toBeDisabled();
  });

  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render_cc(onClose);
    fireEvent.click(screen.getByTestId("channel-create-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<MessagingChannelCreate onClose={onClose} onCreate={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── MessagingGroupCreate ─────────────────────────────────────────────────────

describe("MessagingGroupCreate", () => {
  function render_gc(onClose = vi.fn()) {
    return render(<MessagingGroupCreate onClose={onClose} onCreate={vi.fn()} />);
  }

  it("renders group-create-modal", () => {
    render_gc();
    expect(screen.getByTestId("group-create-modal")).toBeInTheDocument();
  });

  it("group name input is present", () => {
    render_gc();
    expect(screen.getByTestId("group-name-input")).toBeInTheDocument();
  });

  it("submit button is present", () => {
    render_gc();
    expect(screen.getByTestId("group-create-submit")).toBeInTheDocument();
  });

  it("submit button disabled when name empty", () => {
    render_gc();
    expect(screen.getByTestId("group-create-submit")).toBeDisabled();
  });

  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render_gc(onClose);
    fireEvent.click(screen.getByTestId("group-create-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<MessagingGroupCreate onClose={onClose} onCreate={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

// Mutual exclusion (threadOpen/detailOpen) is enforced in
// MessagingReadingWorkspace state handlers. Integration-tested in E2E.

// ─── MessagingAdminPanel ──────────────────────────────────────────────────────

describe("MessagingAdminPanel", () => {
  it("renders admin-panel", () => {
    render(<MessagingAdminPanel />);
    expect(screen.getByTestId("admin-panel")).toBeInTheDocument();
  });

  it("default tab is channel-policy", () => {
    render(<MessagingAdminPanel />);
    expect(screen.getByTestId("admin-channel-policy-tab")).toBeInTheDocument();
  });

  it("clicking Audit Log tab shows audit log table", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-audit-log"));
    expect(screen.getByTestId("admin-audit-log-tab")).toBeInTheDocument();
    expect(screen.getByTestId("admin-audit-log-table")).toBeInTheDocument();
  });

  it("audit log shows at least one row from MOCK_AUDIT_LOG", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-audit-log"));
    expect(screen.getByTestId(`audit-log-row-${MOCK_AUDIT_LOG[0].id}`)).toBeInTheDocument();
  });

  it("audit log shows all 5 mock rows", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-audit-log"));
    MOCK_AUDIT_LOG.forEach((entry) => {
      expect(screen.getByTestId(`audit-log-row-${entry.id}`)).toBeInTheDocument();
    });
  });

  it("clicking Retention tab shows retention settings", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-retention"));
    expect(screen.getByTestId("admin-retention-tab")).toBeInTheDocument();
  });

  it("clicking Moderation tab shows moderation settings", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-moderation"));
    expect(screen.getByTestId("admin-moderation-tab")).toBeInTheDocument();
  });

  it("clicking Member Governance tab shows member governance", () => {
    render(<MessagingAdminPanel />);
    fireEvent.click(screen.getByTestId("admin-tab-member-governance"));
    expect(screen.getByTestId("admin-member-governance-tab")).toBeInTheDocument();
  });
});
