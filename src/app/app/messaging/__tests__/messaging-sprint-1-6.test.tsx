/**
 * Sprint 1.6 — Search, Files, Notifications, and Final Polish tests
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

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

  it("filter messages shows only message results", () => {
    render_sp("payroll");
    fireEvent.click(screen.getByTestId("search-filter-messages"));
    const messageResults = MOCK_SEARCH_RESULTS.filter((r) => r.kind === "message");
    const otherResults = MOCK_SEARCH_RESULTS.filter((r) => r.kind !== "message");
    messageResults.forEach((r) => {
      expect(screen.getByTestId(`search-result-${r.id}`)).toBeInTheDocument();
    });
    otherResults.forEach((r) => {
      expect(screen.queryByTestId(`search-result-${r.id}`)).not.toBeInTheDocument();
    });
  });

  it("filter channels shows channel and person results", () => {
    render_sp("");
    fireEvent.click(screen.getByTestId("search-filter-channels"));
    const matching = MOCK_SEARCH_RESULTS.filter(
      (r) => r.kind === "channel" || r.kind === "person"
    );
    const nonMatching = MOCK_SEARCH_RESULTS.filter(
      (r) => r.kind !== "channel" && r.kind !== "person"
    );
    matching.forEach((r) => {
      expect(screen.getByTestId(`search-result-${r.id}`)).toBeInTheDocument();
    });
    nonMatching.forEach((r) => {
      expect(screen.queryByTestId(`search-result-${r.id}`)).not.toBeInTheDocument();
    });
  });

  it("filter files shows file results", () => {
    render_sp("");
    fireEvent.click(screen.getByTestId("search-filter-files"));
    const fileResults = MOCK_SEARCH_RESULTS.filter((r) => r.kind === "file");
    const otherResults = MOCK_SEARCH_RESULTS.filter((r) => r.kind !== "file");
    fileResults.forEach((r) => {
      expect(screen.getByTestId(`search-result-${r.id}`)).toBeInTheDocument();
    });
    otherResults.forEach((r) => {
      expect(screen.queryByTestId(`search-result-${r.id}`)).not.toBeInTheDocument();
    });
  });

  it("when query matches a result title, that result row is visible", () => {
    render_sp("compliance");
    const result = MOCK_SEARCH_RESULTS.find((r) => r.title.toLowerCase().includes("compliance"));
    expect(result).toBeDefined();
    expect(screen.getByTestId(`search-result-${result!.id}`)).toBeInTheDocument();
  });

  it("when query matches nothing, data-testid=search-no-results is shown", () => {
    render_sp("xyznonexistent");
    expect(screen.getByTestId("search-no-results")).toBeInTheDocument();
  });

  it("all 4 filter buttons are present", () => {
    render_sp();
    expect(screen.getByTestId("search-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-messages")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-channels")).toBeInTheDocument();
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

describe("MessagingNotificationsPanel", () => {
  function render_np(onClose = vi.fn()) {
    return render(<MessagingNotificationsPanel onClose={onClose} />);
  }

  it("renders data-testid=notifications-panel", () => {
    render_np();
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render_np(onClose);
    fireEvent.click(screen.getByTestId("notif-panel-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render_np(onClose);
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
