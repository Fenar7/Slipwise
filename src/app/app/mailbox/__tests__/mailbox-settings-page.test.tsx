import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import type { MailboxAdminConnection } from "../types";
import { ConnectionCard, MailboxSettingsPageContent } from "../settings/page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeAdminConnection(overrides: Partial<MailboxAdminConnection> = {}): MailboxAdminConnection {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "gmail",
    slug: "billing",
    emailAddress: "billing@acmecorp.com",
    displayName: "Billing",
    status: "connected",
    lastSyncAt: "2026-05-08T14:30:00Z",
    lastSyncError: null,
    sync: undefined,
    connectedBy: "Rahul Verma",
    visibilityPolicy: "org_shared",
    ...overrides,
  };
}

// ─── ConnectionCard kebab removal regression ──────────────────────────────────

describe("ConnectionCard", () => {
  it("does NOT render a dead kebab / more-actions button", () => {
    render(<ConnectionCard connection={makeAdminConnection()} />);

    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("More actions")).not.toBeInTheDocument();
  });

  it("renders the settings/manage connection link with correct accessibility", () => {
    render(<ConnectionCard connection={makeAdminConnection()} />);

    const manageLink = screen.getByRole("link", { name: /manage billing connection/i });
    expect(manageLink).toBeInTheDocument();
    expect(manageLink).toHaveAttribute("href", "/app/mailbox/settings/connections/conn-1");
    expect(manageLink).toHaveAttribute("title", "Manage connection");
  });

  it("renders inline Sync now button for connected status", () => {
    const onSyncNow = vi.fn();
    render(<ConnectionCard connection={makeAdminConnection({ status: "connected" })} onSyncNow={onSyncNow} />);

    const syncBtn = screen.getByRole("button", { name: /sync now/i });
    expect(syncBtn).toBeInTheDocument();

    fireEvent.click(syncBtn);
    expect(onSyncNow).toHaveBeenCalledWith("conn-1");
  });

  it("renders inline Sync now button for degraded status", () => {
    render(<ConnectionCard connection={makeAdminConnection({ status: "degraded" })} />);

    expect(screen.getByRole("button", { name: /sync now/i })).toBeInTheDocument();
  });

  it("does NOT render Sync now button for disconnected status", () => {
    render(<ConnectionCard connection={makeAdminConnection({ status: "disconnected", lastSyncAt: null })} />);

    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
  });

  it("renders inline Reconnect button for reconnect_required status", () => {
    render(
      <ConnectionCard
        connection={makeAdminConnection({
          status: "reconnect_required",
          lastSyncError: "OAuth token expired",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /reconnect billing/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
  });

  it("does NOT render a kebab for reconnect_required status either", () => {
    render(
      <ConnectionCard
        connection={makeAdminConnection({
          status: "reconnect_required",
          lastSyncError: "OAuth token expired",
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
  });

  it("renders truthful disconnected state with no dead controls", () => {
    render(
      <ConnectionCard
        connection={makeAdminConnection({
          status: "disconnected",
          lastSyncAt: null,
          lastSyncError: null,
        })}
      />,
    );

    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /reconnect/i })).not.toBeInTheDocument();
  });

  it("settings link is keyboard focusable", () => {
    render(<ConnectionCard connection={makeAdminConnection()} />);

    const manageLink = screen.getByRole("link", { name: /manage billing connection/i });
    manageLink.focus();
    expect(manageLink).toHaveFocus();
  });
});

// ─── MailboxSettingsPageContent integration ───────────────────────────────────

describe("MailboxSettingsPageContent", () => {
  it("renders connection cards without any kebab buttons in a multi-connection list", () => {
    const connections: MailboxAdminConnection[] = [
      makeAdminConnection({ id: "conn-a", displayName: "Billing", status: "connected" }),
      makeAdminConnection({ id: "conn-b", displayName: "Support", status: "degraded" }),
      makeAdminConnection({ id: "conn-c", displayName: "Accounts", status: "reconnect_required" }),
      makeAdminConnection({ id: "conn-d", displayName: "Archive", status: "disconnected", lastSyncAt: null }),
    ];

    render(<MailboxSettingsPageContent connections={connections} />);

    // Active cards present
    expect(screen.getByTestId("connection-card-conn-a")).toBeInTheDocument();
    expect(screen.getByTestId("connection-card-conn-b")).toBeInTheDocument();
    expect(screen.getByTestId("connection-card-conn-c")).toBeInTheDocument();
    // Disconnected mailbox is hidden from the list
    expect(screen.queryByTestId("connection-card-conn-d")).not.toBeInTheDocument();

    // No kebab buttons anywhere
    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();

    // Manage links present for active connections only
    expect(screen.getByRole("link", { name: /manage billing connection/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage support connection/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage accounts connection/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /manage archive connection/i })).not.toBeInTheDocument();
  });

  it("shows empty state when no connections exist", () => {
    render(<MailboxSettingsPageContent connections={[]} />);

    expect(screen.getByTestId("settings-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("connection-list")).not.toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(<MailboxSettingsPageContent isLoading={true} />);

    expect(screen.getByTestId("mailbox-settings-page")).toBeInTheDocument();
  });

  it("renders truthful forbidden state", () => {
    render(<MailboxSettingsPageContent errorType="forbidden" />);

    expect(screen.getByText(/admins only/i)).toBeInTheDocument();
    expect(screen.queryByTestId("connection-list")).not.toBeInTheDocument();
  });

  it("renders truthful unauthorized state", () => {
    render(<MailboxSettingsPageContent errorType="unauthorized" />);

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
  });

  it("does NOT render disconnected mailboxes in the connection list", () => {
    const connections: MailboxAdminConnection[] = [
      makeAdminConnection({ id: "conn-a", displayName: "Billing", status: "connected" }),
      makeAdminConnection({ id: "conn-b", displayName: "Archive", status: "disconnected", lastSyncAt: null }),
    ];

    render(<MailboxSettingsPageContent connections={connections} />);

    expect(screen.getByTestId("connection-card-conn-a")).toBeInTheDocument();
    expect(screen.queryByTestId("connection-card-conn-b")).not.toBeInTheDocument();
  });

  it("shows empty state when ALL connections are disconnected", () => {
    const connections: MailboxAdminConnection[] = [
      makeAdminConnection({ id: "conn-b", displayName: "Archive", status: "disconnected", lastSyncAt: null }),
    ];

    render(<MailboxSettingsPageContent connections={connections} />);

    expect(screen.getByTestId("settings-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("connection-list")).not.toBeInTheDocument();
  });
});
