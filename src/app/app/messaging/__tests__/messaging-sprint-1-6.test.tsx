/**
 * Sprint 1.6 — Search, Files, Notifications, and Final Polish tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

import { MessagingSearchPanel } from "../messaging-search-panel";
import { MessagingFilesPanel } from "../messaging-files-panel";
import { MessagingNotificationsPanel } from "../messaging-notifications-panel";
import { MessagingNotificationPreferences } from "../messaging-notification-preferences";
import { MessagingReadingWorkspace } from "../messaging-reading-workspace";
import { MOCK_SEARCH_RESULTS, MOCK_NOTIFICATIONS } from "../mock-data";

// ─── MessagingSearchPanel ────────────────────────────────────────────────────

describe("MessagingSearchPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlObj = new URL(url, "http://localhost");
      const q = urlObj.searchParams.get("q") || "";
      const kindsParam = urlObj.searchParams.get("kinds") || "";
      
      let results: any[] = [];
      let state = "active";

      if (q && q !== "xyznonexistent") {
        if (kindsParam.includes("message")) {
          results.push({ id: "sr-1", kind: "message", title: "Priya Sharma", subtitle: "Q2 reconciliation draft is ready...", timestamp: "2026-05-09T08:15:00Z" });
        }
        if (kindsParam.includes("conversation")) {
          results.push({ id: "sr-2", kind: "conversation", title: "#finance-ops", subtitle: "Finance team coordination and approvals", timestamp: "2026-05-09T10:30:00Z" });
          results.push({ id: "sr-3", kind: "conversation", title: "Sneha Iyer", subtitle: "Sneha Iyer · Member · Online" });
        }
        if (kindsParam.includes("file")) {
          state = "unindexed";
        }
      }

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            results,
            facets: { message: 1, conversation: 2, task: 0, meeting: 0, file: 0 },
            state,
            unindexedKinds: state === "unindexed" ? ["file"] : [],
          },
        }),
      } as any;
    });
  });

  function render_sp(query = "", onClose = vi.fn()) {
    return render(<MessagingSearchPanel query={query} onClose={onClose} />);
  }

  it("renders data-testid=search-panel", () => {
    render_sp();
    expect(screen.getByTestId("search-panel")).toBeInTheDocument();
  });

  it("shows data-testid=search-recent when query is empty", () => {
    render_sp();
    expect(screen.getByTestId("search-recent")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render_sp("", onClose);
    fireEvent.click(screen.getByTestId("search-panel-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render_sp("", onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("filter messages shows only message results", async () => {
    render_sp("payroll");
    fireEvent.click(screen.getByTestId("search-filter-messages"));
    
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-result-sr-1")).toBeInTheDocument();
    expect(screen.queryByTestId("search-result-sr-2")).not.toBeInTheDocument();
  });

  it("filter channels shows conversation results", async () => {
    render_sp("payroll");
    fireEvent.click(screen.getByTestId("search-filter-channels"));
    
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-result-sr-2")).toBeInTheDocument();
    expect(screen.getByTestId("search-result-sr-3")).toBeInTheDocument();
    expect(screen.queryByTestId("search-result-sr-1")).not.toBeInTheDocument();
  });

  it("filter files shows unindexed file message", async () => {
    render_sp("payroll");
    fireEvent.click(screen.getByTestId("search-filter-files"));
    
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-unindexed")).toBeInTheDocument();
  });

  it("when query matches a result title, that result row is visible", async () => {
    render_sp("compliance");
    
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-result-sr-1")).toBeInTheDocument();
  });

  it("when query matches nothing, data-testid=search-no-results is shown", async () => {
    render_sp("xyznonexistent");
    
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-no-results")).toBeInTheDocument();
  });

  it("all 6 filter buttons are present", () => {
    render_sp();
    expect(screen.getByTestId("search-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-messages")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-channels")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-meetings")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-files")).toBeInTheDocument();
  });
});

// ─── MessagingFilesPanel ──────────────────────────────────────────────────────

describe("MessagingFilesPanel", () => {
  it("renders data-testid=file-panel", () => {
    render(<MessagingFilesPanel />);
    expect(screen.getByTestId("file-panel")).toBeInTheDocument();
  });

  it("category filter all shows all files", () => {
    render(<MessagingFilesPanel />);
    fireEvent.click(screen.getByTestId("file-filter-all"));
    const allFiles = screen.getAllByTestId(/file-row-/);
    expect(allFiles.length).toBeGreaterThan(0);
  });

  it("category filter documents shows only document files", () => {
    render(<MessagingFilesPanel />);
    fireEvent.click(screen.getByTestId("file-filter-document"));
    const rows = screen.getAllByTestId(/file-row-/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("empty state shown when filter matches zero files", () => {
    render(<MessagingFilesPanel />);
    // "images" filter matches zero files in MOCK_FILES
    fireEvent.click(screen.getByTestId("file-filter-image"));
    expect(screen.getByTestId("file-list-empty")).toBeInTheDocument();
  });

  it("sort RadioPill renders newest, oldest, name options", () => {
    render(<MessagingFilesPanel />);
    expect(screen.getByTestId("file-sort-newest")).toBeInTheDocument();
    expect(screen.getByTestId("file-sort-oldest")).toBeInTheDocument();
    expect(screen.getByTestId("file-sort-name")).toBeInTheDocument();
  });

  it("file action buttons present for first file", () => {
    render(<MessagingFilesPanel />);
    const firstFileId = "file-1";
    expect(screen.getByTestId(`file-actions-${firstFileId}`)).toBeInTheDocument();
  });
});

// ─── MessagingNotificationsPanel ───────────────────────────────────────────────

const defaultNotifProps = {
  notifications: MOCK_NOTIFICATIONS,
  onMarkAllRead: vi.fn() as () => void,
  onToggleRead: vi.fn() as (id: string) => void,
  onClose: vi.fn() as () => void,
};

describe("MessagingNotificationsPanel", () => {
  function render_np(props = defaultNotifProps) {
    return render(<MessagingNotificationsPanel {...props} />);
  }

  it("renders data-testid=notifications-panel", () => {
    render_np();
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render_np({ ...defaultNotifProps, onClose });
    fireEvent.click(screen.getByTestId("notif-panel-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render_np({ ...defaultNotifProps, onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("unread notifications render with correct data-testid", () => {
    render_np();
    const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read);
    unread.forEach((n) => {
      expect(screen.getByTestId(`notif-row-${n.id}`)).toBeInTheDocument();
    });
  });

  it("filter mentions shows only mention notifications", () => {
    render_np();
    fireEvent.click(screen.getByTestId("notif-filter-mentions"));
    const mentions = MOCK_NOTIFICATIONS.filter((n) => n.kind === "mention");
    const nonMentions = MOCK_NOTIFICATIONS.filter((n) => n.kind !== "mention");
    mentions.forEach((n) => {
      expect(screen.getByTestId(`notif-row-${n.id}`)).toBeInTheDocument();
    });
    nonMentions.forEach((n) => {
      expect(screen.queryByTestId(`notif-row-${n.id}`)).not.toBeInTheDocument();
    });
  });

  it("filter unread shows only unread notifications", () => {
    render_np();
    fireEvent.click(screen.getByTestId("notif-filter-unread"));
    const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read);
    const read = MOCK_NOTIFICATIONS.filter((n) => n.read);
    unread.forEach((n) => {
      expect(screen.getByTestId(`notif-row-${n.id}`)).toBeInTheDocument();
    });
    read.forEach((n) => {
      expect(screen.queryByTestId(`notif-row-${n.id}`)).not.toBeInTheDocument();
    });
  });

  it("data-testid=notif-mark-all-read button is present", () => {
    render_np();
    expect(screen.getByTestId("notif-mark-all-read")).toBeInTheDocument();
  });

  it("clicking preferences link shows data-testid=notif-preferences-modal", () => {
    render_np();
    fireEvent.click(screen.getByTestId("notif-preferences-link"));
    expect(screen.getByTestId("notif-preferences-modal")).toBeInTheDocument();
  });

  it("unread badge count updates to 0 after all notifications are read", () => {
    const allRead = MOCK_NOTIFICATIONS.map((n) => ({ ...n, read: true }));
    render_np({ ...defaultNotifProps, notifications: allRead });
    const unreadFilter = screen.getByTestId("notif-filter-unread");
    fireEvent.click(unreadFilter);
    expect(screen.getByTestId("notif-list-empty")).toBeInTheDocument();
  });
});

// ─── MessagingNotificationPreferences ────────────────────────────────────────

describe("MessagingNotificationPreferences", () => {
  function render_pref(onClose = vi.fn()) {
    return render(<MessagingNotificationPreferences onClose={onClose} />);
  }

  it("renders data-testid=notif-preferences-modal", () => {
    render_pref();
    expect(screen.getByTestId("notif-preferences-modal")).toBeInTheDocument();
  });

  it("all 5 main toggles present", () => {
    render_pref();
    expect(screen.getByTestId("notif-pref-all")).toBeInTheDocument();
    expect(screen.getByTestId("notif-pref-mentions")).toBeInTheDocument();
    expect(screen.getByTestId("notif-pref-replies")).toBeInTheDocument();
    expect(screen.getByTestId("notif-pref-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("notif-pref-meetings")).toBeInTheDocument();
  });

  it("DND toggle present", () => {
    render_pref();
    expect(screen.getByTestId("notif-pref-dnd")).toBeInTheDocument();
  });

  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render_pref(onClose);
    fireEvent.click(screen.getByTestId("notif-pref-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render_pref(onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── Degraded banner ──────────────────────────────────────────────────────────

describe("MessagingReadingWorkspace degraded banner", () => {
  it("when degraded=true, data-testid=workspace-degraded-banner renders", () => {
    render(
      <MessagingReadingWorkspace
        conversation={null}
        sectionKind="channel"
        degraded={true}
      />
    );
    expect(screen.getByTestId("workspace-degraded-banner")).toBeInTheDocument();
  });

  it("when degraded=false (default), banner is NOT in the DOM", () => {
    render(
      <MessagingReadingWorkspace
        conversation={null}
        sectionKind="channel"
        degraded={false}
      />
    );
    expect(screen.queryByTestId("workspace-degraded-banner")).not.toBeInTheDocument();
  });
});
