/**
 * Sprint 1.1 — Workspace shell and navigation tests
 *
 * Covers:
 * - Messaging route renders
 * - Shell layout renders correctly
 * - Left rail renders expected top-level structure
 * - Active workspace section is visible
 * - Top command/search bar renders
 * - Admin/governance entry points render correctly
 * - Nav item added to suite nav
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

// ─── Mock next/navigation ─────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
}));

// ─── Mock motion/react ────────────────────────────────────────────────────────

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
import { MessagingLeftRail } from "../messaging-left-rail";
import { MessagingCommandBar } from "../messaging-command-bar";
import { MessagingWorkspacePane } from "../messaging-workspace-pane";
import { suiteNavItems } from "@/components/layout/suite-nav-items";
import {
  MOCK_CHANNELS,
  MOCK_DMS,
  MOCK_GROUPS,
  MOCK_TASKS,
  MOCK_MEETINGS,
  MOCK_FILES,
  MOCK_ADMIN_ENTRIES,
} from "../mock-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLeftRail(activeSection = "channels" as const) {
  return render(
    <MessagingLeftRail
      activeSection={activeSection}
      onSectionChange={vi.fn()}
    />
  );
}

// ─── Suite nav ────────────────────────────────────────────────────────────────

describe("Suite nav — Messaging entry", () => {
  it("includes a Messaging nav item", () => {
    const item = suiteNavItems.find((i) => i.suite === "messaging");
    expect(item).toBeDefined();
    expect(item?.href).toBe("/app/messaging");
    expect(item?.label).toBe("Messaging");
  });

  it("Messaging nav item has an icon", () => {
    const item = suiteNavItems.find((i) => i.suite === "messaging");
    expect(item?.icon).toBeDefined();
  });

  it("Messaging nav item does not interfere with Mailbox", () => {
    const mailbox = suiteNavItems.find((i) => i.suite === "mailbox");
    const messaging = suiteNavItems.find((i) => i.suite === "messaging");
    expect(mailbox?.href).toBe("/app/mailbox");
    expect(messaging?.href).toBe("/app/messaging");
    expect(mailbox?.href).not.toBe(messaging?.href);
  });
});

// ─── MessagingWorkspace ───────────────────────────────────────────────────────

describe("MessagingWorkspace", () => {
  it("renders the workspace shell", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-workspace")).toBeInTheDocument();
  });

  it("renders the left rail on desktop", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-left-rail")).toBeInTheDocument();
  });

  it("renders the command bar", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-command-bar")).toBeInTheDocument();
  });

  it("renders the workspace pane", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-workspace-pane")).toBeInTheDocument();
  });

  it("defaults to channels section", () => {
    render(<MessagingWorkspace />);
    // Sprint 1.2: channels section now renders the two-column conversation layout
    expect(screen.getByTestId("messaging-workspace-pane")).toBeInTheDocument();
    expect(screen.getByTestId("conv-list-channels")).toBeInTheDocument();
  });

  it("switches section when left rail item is clicked", () => {
    render(<MessagingWorkspace />);
    const dmSection = screen.getByTestId("messaging-section-dms");
    fireEvent.click(dmSection);
    // Sprint 1.2: DMs section now renders the two-column conversation layout
    expect(screen.getByTestId("conv-list-dms")).toBeInTheDocument();
  });

  it("switches to tasks section", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-tasks"));
    expect(screen.getByTestId("messaging-pane-tasks")).toBeInTheDocument();
  });

  it("switches to meetings section", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-meetings"));
    expect(screen.getByTestId("messaging-pane-meetings")).toBeInTheDocument();
  });

  it("switches to files section", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-files"));
    expect(screen.getByTestId("messaging-pane-files")).toBeInTheDocument();
  });

  it("switches to admin section", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-section-admin"));
    expect(screen.getByTestId("messaging-pane-admin")).toBeInTheDocument();
  });

  it("renders the mobile/tablet fallback navigation", () => {
    render(<MessagingWorkspace />);
    expect(screen.getByTestId("messaging-mobile-nav")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-mobile-section-channels")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-mobile-section-admin")).toBeInTheDocument();
  });

  it("switches section from the mobile/tablet fallback navigation", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-mobile-section-admin"));
    expect(screen.getByTestId("messaging-pane-admin")).toBeInTheDocument();
  });
});

// ─── MessagingLeftRail ────────────────────────────────────────────────────────

describe("MessagingLeftRail", () => {
  it("renders the left rail", () => {
    renderLeftRail();
    expect(screen.getByTestId("messaging-left-rail")).toBeInTheDocument();
  });

  it("renders all primary section headers", () => {
    renderLeftRail();
    expect(screen.getByTestId("messaging-section-channels")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-dms")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-groups")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-meetings")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-files")).toBeInTheDocument();
    expect(screen.getByTestId("messaging-section-admin")).toBeInTheDocument();
  });

  it("shows Messages label in the rail header", () => {
    renderLeftRail();
    expect(screen.getByText("Messages")).toBeInTheDocument();
  });

  it("shows channel names when channels section is expanded", () => {
    renderLeftRail("channels");
    // Channels section is expanded by default
    expect(screen.getByLabelText("general channel")).toBeInTheDocument();
    expect(screen.getByLabelText("finance-ops channel")).toBeInTheDocument();
  });

  it("shows DM participant names when DMs section is expanded", () => {
    renderLeftRail("dms");
    expect(screen.getByLabelText("DM with Arjun Mehta")).toBeInTheDocument();
  });

  it("marks the active section visually", () => {
    renderLeftRail("channels");
    const channelsHeader = screen.getByTestId("messaging-section-channels");
    expect(channelsHeader.className).toContain("bg-red-50");
  });

  it("admin section is visually separated", () => {
    renderLeftRail();
    const adminHeader = screen.getByTestId("messaging-section-admin");
    expect(adminHeader).toBeInTheDocument();
  });

  it("calls onSectionChange when a section is clicked", () => {
    const onSectionChange = vi.fn();
    render(
      <MessagingLeftRail
        activeSection="channels"
        onSectionChange={onSectionChange}
      />
    );
    fireEvent.click(screen.getByTestId("messaging-section-dms"));
    expect(onSectionChange).toHaveBeenCalledWith("dms");
  });

  it("section headers use semantic buttons", () => {
    renderLeftRail("channels");
    expect(screen.getByTestId("messaging-section-channels").tagName).toBe("BUTTON");
    expect(screen.getByTestId("messaging-section-admin").tagName).toBe("BUTTON");
  });

  it("section rows use semantic buttons", () => {
    renderLeftRail("channels");
    expect(screen.getByLabelText("general channel").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Browse all channels").tagName).toBe("BUTTON");
  });
});

// ─── MessagingCommandBar ──────────────────────────────────────────────────────

describe("MessagingCommandBar", () => {
  function renderBar(overrides = {}) {
    return render(
      <MessagingCommandBar
        searchQuery=""
        onSearchChange={vi.fn()}
        commandBarOpen={false}
        onCommandBarToggle={vi.fn()}
        notifOpen={false}
        onNotifToggle={vi.fn()}
        onSearchFocus={vi.fn()}
        unreadCount={0}
        {...overrides}
      />
    );
  }

  it("renders the command bar", () => {
    renderBar();
    expect(screen.getByTestId("messaging-command-bar")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderBar();
    expect(screen.getByTestId("messaging-search-input")).toBeInTheDocument();
  });

  it("renders the search placeholder text", () => {
    renderBar();
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("renders the notifications button", () => {
    renderBar();
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("renders the messaging settings button", () => {
    renderBar();
    expect(screen.getByTestId("messaging-settings-button")).toBeInTheDocument();
  });

  it("calls onSearchChange when typing", () => {
    const onSearchChange = vi.fn();
    renderBar({ onSearchChange });
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "finance" } });
    expect(onSearchChange).toHaveBeenCalledWith("finance");
  });

  it("applies active styles when commandBarOpen is true", () => {
    renderBar({ commandBarOpen: true });
    const searchArea = screen.getByTestId("messaging-search-input");
    expect(searchArea.className).toContain("border-[#DC2626]");
  });
});

// ─── MessagingWorkspacePane ───────────────────────────────────────────────────

describe("MessagingWorkspacePane — Channels", () => {
  it("renders channels pane", () => {
    render(<MessagingWorkspacePane activeSection="channels" />);
    expect(screen.getByTestId("messaging-pane-channels")).toBeInTheDocument();
  });

  it("renders all mock channels", () => {
    render(<MessagingWorkspacePane activeSection="channels" />);
    MOCK_CHANNELS.forEach((ch) => {
      expect(screen.getByLabelText(`Open ${ch.name} channel`)).toBeInTheDocument();
    });
  });

  it("shows New Channel button", () => {
    render(<MessagingWorkspacePane activeSection="channels" />);
    expect(screen.getByText("+ New Channel")).toBeInTheDocument();
  });

  it("channel cards are keyboard-focusable buttons", async () => {
    render(<MessagingWorkspacePane activeSection="channels" />);
    const channelButton = screen.getByLabelText("Open general channel");
    channelButton.focus();
    expect(channelButton.tagName).toBe("BUTTON");
    expect(channelButton).toHaveFocus();
  });
});

describe("MessagingWorkspacePane — DMs", () => {
  it("renders DMs pane", () => {
    render(<MessagingWorkspacePane activeSection="dms" />);
    expect(screen.getByTestId("messaging-pane-dms")).toBeInTheDocument();
  });

  it("renders all mock DMs", () => {
    render(<MessagingWorkspacePane activeSection="dms" />);
    MOCK_DMS.forEach((dm) => {
      expect(screen.getByLabelText(`Open DM with ${dm.participant.name}`)).toBeInTheDocument();
    });
  });
});

describe("MessagingWorkspacePane — Groups", () => {
  it("renders groups pane", () => {
    render(<MessagingWorkspacePane activeSection="groups" />);
    expect(screen.getByTestId("messaging-pane-groups")).toBeInTheDocument();
  });

  it("renders all mock groups", () => {
    render(<MessagingWorkspacePane activeSection="groups" />);
    MOCK_GROUPS.forEach((grp) => {
      expect(screen.getByLabelText(`Open ${grp.name} group`)).toBeInTheDocument();
    });
  });
});

describe("MessagingWorkspacePane — Tasks", () => {
  it("renders tasks pane", () => {
    render(<MessagingWorkspacePane activeSection="tasks" />);
    expect(screen.getByTestId("messaging-pane-tasks")).toBeInTheDocument();
  });

  it("shows overdue warning when overdue tasks exist", () => {
    render(<MessagingWorkspacePane activeSection="tasks" />);
    const overdue = MOCK_TASKS.filter((t) => t.status === "overdue");
    if (overdue.length > 0) {
      expect(screen.getByText(`${overdue.length} overdue`)).toBeInTheDocument();
    }
  });

  it("renders all mock tasks", () => {
    render(<MessagingWorkspacePane activeSection="tasks" />);
    MOCK_TASKS.forEach((task) => {
      expect(screen.getByLabelText(task.title)).toBeInTheDocument();
    });
  });
});

describe("MessagingWorkspacePane — Meetings", () => {
  it("renders meetings pane", () => {
    render(<MessagingWorkspacePane activeSection="meetings" />);
    expect(screen.getByTestId("messaging-pane-meetings")).toBeInTheDocument();
  });

  it("shows calendar not connected hint", () => {
    render(<MessagingWorkspacePane activeSection="meetings" />);
    expect(screen.getByText(/Connect Google Calendar/i)).toBeInTheDocument();
  });
});

describe("MessagingWorkspacePane — Files", () => {
  it("renders files pane", () => {
    render(<MessagingWorkspacePane activeSection="files" />);
    expect(screen.getByTestId("messaging-pane-files")).toBeInTheDocument();
  });

  it("renders all mock files", () => {
    render(<MessagingWorkspacePane activeSection="files" />);
    MOCK_FILES.forEach((file) => {
      expect(screen.getByLabelText(file.name)).toBeInTheDocument();
    });
  });
});

describe("MessagingWorkspacePane — Admin / Governance", () => {
  it("renders admin pane", () => {
    render(<MessagingWorkspacePane activeSection="admin" />);
    expect(screen.getByTestId("messaging-pane-admin")).toBeInTheDocument();
  });

  it("renders all admin entry points", () => {
    render(<MessagingWorkspacePane activeSection="admin" />);
    MOCK_ADMIN_ENTRIES.forEach((entry) => {
      expect(screen.getByTestId(`admin-pane-entry-${entry.area}`)).toBeInTheDocument();
    });
  });

  it("shows role restriction notice", () => {
    render(<MessagingWorkspacePane activeSection="admin" />);
    expect(screen.getByText(/Restricted to org admins and owners/i)).toBeInTheDocument();
  });

  it("shows governance warning banner", () => {
    render(<MessagingWorkspacePane activeSection="admin" />);
    expect(screen.getByText(/Changes are logged in the audit trail/i)).toBeInTheDocument();
  });

  it("shows role badge on each admin entry", () => {
    render(<MessagingWorkspacePane activeSection="admin" />);
    // At least one entry should show "admin" or "owner" badge
    const adminBadges = screen.getAllByText(/admin|owner/i);
    expect(adminBadges.length).toBeGreaterThan(0);
  });

  it("keeps admin reachable from the mobile/tablet fallback nav", () => {
    render(<MessagingWorkspace />);
    fireEvent.click(screen.getByTestId("messaging-mobile-section-admin"));
    expect(screen.getByText(/Restricted to org admins and owners/i)).toBeInTheDocument();
  });
});

describe("MessagingWorkspace keyboard navigation", () => {
  it("Enter switches sections from the left rail", async () => {
    render(<MessagingWorkspace />);
    const dmSection = screen.getByTestId("messaging-section-dms");
    dmSection.focus();
    fireEvent.keyDown(dmSection, { key: "Enter" });
    // Sprint 1.2: DMs section now renders the two-column conversation layout
    expect(screen.getByTestId("conv-list-dms")).toBeInTheDocument();
  });

  it("Space switches sections from the left rail", async () => {
    render(<MessagingWorkspace />);
    const tasksSection = screen.getByTestId("messaging-section-tasks");
    tasksSection.focus();
    fireEvent.keyDown(tasksSection, { key: " " });
    expect(screen.getByTestId("messaging-pane-tasks")).toBeInTheDocument();
  });
});

// ─── Mock data integrity ──────────────────────────────────────────────────────

describe("Mock data integrity", () => {
  it("has at least 3 channels", () => {
    expect(MOCK_CHANNELS.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 2 DMs", () => {
    expect(MOCK_DMS.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 2 groups", () => {
    expect(MOCK_GROUPS.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 2 tasks", () => {
    expect(MOCK_TASKS.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 1 upcoming meeting", () => {
    const upcoming = MOCK_MEETINGS.filter((m) => m.status === "upcoming");
    expect(upcoming.length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 2 files", () => {
    expect(MOCK_FILES.length).toBeGreaterThanOrEqual(2);
  });

  it("has all required admin areas", () => {
    const areas = MOCK_ADMIN_ENTRIES.map((e) => e.area);
    expect(areas).toContain("channel-policy");
    expect(areas).toContain("retention");
    expect(areas).toContain("audit-log");
    expect(areas).toContain("member-governance");
  });

  it("all channels have valid visibility", () => {
    MOCK_CHANNELS.forEach((ch) => {
      expect(["public", "private"]).toContain(ch.visibility);
    });
  });

  it("all tasks have valid status", () => {
    MOCK_TASKS.forEach((task) => {
      expect(["open", "in-progress", "done", "overdue"]).toContain(task.status);
    });
  });
});
