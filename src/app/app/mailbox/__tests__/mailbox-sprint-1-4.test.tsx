/**
 * Sprint 1.4 tests — Settings, connections, and permissions.
 * Extends Sprint 1.1–1.3 coverage; does not replace them.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mailbox/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Mock mailbox data hooks for workspace tests
vi.mock("../use-mailbox-connections", () => ({
  useMailboxConnections: () => ({
    connections: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: () => ({
    threads: [],
    totalCount: 0,
    nextCursor: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

// Settings page
import MailboxSettingsPage from "../settings/page";
// Connect flow
import { MailboxConnectFlow } from "../settings/mailbox-connect-flow";
// Connection detail
import { ConnectionDetailClient } from "../settings/connections/[id]/connection-detail-client";
// Mock data
import { MOCK_ADMIN_SUMMARIES, MOCK_CONNECTIONS } from "../mock-data";
// Workspace regression
import { MailboxWorkspace } from "../mailbox-workspace";

// ─── Sprint 1.1–1.3 regression ───────────────────────────────────────────────

describe("Sprint 1.1–1.3 regression", () => {
  it("workspace still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByTestId("mailbox-workspace")).toBeInTheDocument();
  });

  it("left rail still renders", () => {
    render(<MailboxWorkspace />);
    expect(screen.getByRole("complementary", { name: /mailbox navigation/i })).toBeInTheDocument();
  });
});

// ─── Mock admin data integrity ────────────────────────────────────────────────

describe("MOCK_ADMIN_SUMMARIES integrity", () => {
  it("has a summary for every connection", () => {
    expect(MOCK_ADMIN_SUMMARIES.length).toBe(MOCK_CONNECTIONS.length);
  });

  it("every summary has a policy", () => {
    for (const s of MOCK_ADMIN_SUMMARIES) {
      expect(s.policy).toBeDefined();
      expect(s.policy.connectionId).toBe(s.connection.id);
    }
  });

  it("manage access is always org_admins_only", () => {
    for (const s of MOCK_ADMIN_SUMMARIES) {
      expect(s.policy.manageAccess).toBe("org_admins_only");
    }
  });

  it("reconnect_required connection has lastSyncError", () => {
    const degraded = MOCK_ADMIN_SUMMARIES.find(
      (s) => s.connection.status === "reconnect_required"
    );
    expect(degraded?.connection.lastSyncError).toBeTruthy();
  });
});

// ─── Mailbox settings page ────────────────────────────────────────────────────

describe("MailboxSettingsPage", () => {
  it("renders with testid", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByTestId("mailbox-settings-page")).toBeInTheDocument();
  });

  it("renders page heading", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByRole("heading", { name: /mailbox connections/i })).toBeInTheDocument();
  });

  it("renders admin notice", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByText(/admin-only area/i)).toBeInTheDocument();
  });

  it("renders connect mailbox button", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByTestId("connect-mailbox-btn")).toBeInTheDocument();
  });

  it("renders connection list", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByTestId("connection-list")).toBeInTheDocument();
  });

  it("renders a card for each connection", () => {
    render(<MailboxSettingsPage />);
    for (const s of MOCK_ADMIN_SUMMARIES) {
      expect(screen.getByTestId(`connection-card-${s.connection.id}`)).toBeInTheDocument();
    }
  });

  it("renders connection display names", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
  });

  it("renders Connected status badge for healthy connections", () => {
    render(<MailboxSettingsPage />);
    const connectedBadges = screen.getAllByText("Connected");
    expect(connectedBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Reconnect required badge for degraded connection", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
  });

  it("renders reconnect banner for degraded connection", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByText(/authorization expired/i)).toBeInTheDocument();
  });

  it("renders Reconnect CTA in banner", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByRole("link", { name: /reconnect accounts/i })).toBeInTheDocument();
  });

  it("renders access summary for each connection", () => {
    render(<MailboxSettingsPage />);
    expect(screen.getByText(/all members can read and reply/i)).toBeInTheDocument();
  });

  it("clicking Connect mailbox opens connect flow modal", () => {
    render(<MailboxSettingsPage />);
    fireEvent.click(screen.getByTestId("connect-mailbox-btn"));
    expect(screen.getByTestId("connect-flow-modal")).toBeInTheDocument();
  });
});

// ─── MailboxConnectFlow ───────────────────────────────────────────────────────

describe("MailboxConnectFlow — pre_connect step", () => {
  it("renders modal with correct aria-label", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /connect a gmail mailbox/i })).toBeInTheDocument();
  });

  it("renders with testid", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByTestId("connect-flow-modal")).toBeInTheDocument();
  });

  it("renders pre-connect step", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByTestId("connect-step-pre-connect")).toBeInTheDocument();
  });

  it("renders mailbox label input", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /mailbox display name/i })).toBeInTheDocument();
  });

  it("renders Gmail permissions disclosure", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByLabelText(/gmail permissions requested/i)).toBeInTheDocument();
  });

  it("renders Authorize with Google button", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.getByTestId("authorize-btn")).toBeInTheDocument();
  });

  it("clicking Authorize transitions to authorizing step", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    expect(screen.getByTestId("connect-step-authorizing")).toBeInTheDocument();
  });

  it("authorizing step shows spinner and waiting message", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    expect(screen.getByText(/waiting for google authorization/i)).toBeInTheDocument();
  });

  it("simulate success transitions to success step", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-success-btn"));
    expect(screen.getByTestId("connect-step-success")).toBeInTheDocument();
  });

  it("success step shows Mailbox connected message", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-success-btn"));
    expect(screen.getByText(/mailbox connected/i)).toBeInTheDocument();
  });

  it("success step shows Done button", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-success-btn"));
    expect(screen.getByTestId("connect-done-btn")).toBeInTheDocument();
  });

  it("simulate failure transitions to failed step", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-failure-btn"));
    expect(screen.getByTestId("connect-step-failed")).toBeInTheDocument();
  });

  it("failed step shows error message", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-failure-btn"));
    expect(screen.getByText(/authorization failed/i)).toBeInTheDocument();
  });

  it("failed step Try again returns to pre-connect", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-failure-btn"));
    fireEvent.click(screen.getByTestId("retry-btn"));
    expect(screen.getByTestId("connect-step-pre-connect")).toBeInTheDocument();
  });

  it("success step uses the mailbox display name instead of a fake fallback email", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /mailbox display name/i }), {
      target: { value: "Support" },
    });
    fireEvent.click(screen.getByTestId("authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-success-btn"));
    expect(
      screen.getByText((content) => content.includes("The ") && content.includes(" mailbox is now connected to Slipwise."))
    ).toBeInTheDocument();
    expect(screen.queryByText(/billing@acmecorp.com/i)).not.toBeInTheDocument();
  });

  it("calls onClose when Close button clicked", () => {
    const onClose = vi.fn();
    render(<MailboxConnectFlow onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("MailboxConnectFlow — reconnect mode", () => {
  it("renders reconnect modal title", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    expect(screen.getByRole("dialog", { name: /reconnect gmail mailbox/i })).toBeInTheDocument();
  });

  it("renders reconnect step", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    expect(screen.getByTestId("connect-step-reconnect")).toBeInTheDocument();
  });

  it("shows the email being reconnected", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    expect(screen.getByText(/accounts@acmecorp.com/i)).toBeInTheDocument();
  });

  it("renders Reconnect with Google button", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    expect(screen.getByTestId("reconnect-authorize-btn")).toBeInTheDocument();
  });

  it("clicking Reconnect transitions to authorizing", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    fireEvent.click(screen.getByTestId("reconnect-authorize-btn"));
    expect(screen.getByTestId("connect-step-authorizing")).toBeInTheDocument();
  });

  it("retry after reconnect failure returns to reconnect step, not fresh connect", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    fireEvent.click(screen.getByTestId("reconnect-authorize-btn"));
    fireEvent.click(screen.getByTestId("simulate-failure-btn"));
    fireEvent.click(screen.getByTestId("retry-btn"));
    expect(screen.getByTestId("connect-step-reconnect")).toBeInTheDocument();
  });
});

// ─── ConnectionDetailClient ───────────────────────────────────────────────────

describe("ConnectionDetailClient", () => {
  it("renders detail page for valid connection", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByTestId("connection-detail-page")).toBeInTheDocument();
  });

  it("renders connection display name and email", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("billing@acmecorp.com")).toBeInTheDocument();
  });

  it("renders connection status section", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("region", { name: /connection status/i })).toBeInTheDocument();
  });

  it("renders permissions section", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("region", { name: /mailbox permissions/i })).toBeInTheDocument();
  });

  it("renders read access select", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("combobox", { name: /read access/i })).toBeInTheDocument();
  });

  it("renders send access select", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("combobox", { name: /reply \/ send access/i })).toBeInTheDocument();
  });

  it("manage access is locked (admin only)", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    // "Admins only" appears in the locked manage access row and possibly visibility
    const adminOnlyElements = screen.getAllByText("Admins only");
    expect(adminOnlyElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders visibility section", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByRole("region", { name: /visibility/i })).toBeInTheDocument();
  });

  it("renders danger zone", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
  });

  it("renders disconnect button in idle state", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByTestId("disconnect-btn")).toBeInTheDocument();
  });

  it("clicking disconnect shows confirmation panel", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    fireEvent.click(screen.getByTestId("disconnect-btn"));
    expect(screen.getByTestId("disconnect-confirm-panel")).toBeInTheDocument();
  });

  it("confirmation panel has confirm and cancel buttons", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    fireEvent.click(screen.getByTestId("disconnect-btn"));
    expect(screen.getByTestId("confirm-disconnect-btn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel disconnect/i })).toBeInTheDocument();
  });

  it("cancel returns to idle state", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    fireEvent.click(screen.getByTestId("disconnect-btn"));
    fireEvent.click(screen.getByRole("button", { name: /cancel disconnect/i }));
    expect(screen.getByTestId("disconnect-btn")).toBeInTheDocument();
  });

  it("confirming disconnect shows disconnecting state", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    fireEvent.click(screen.getByTestId("disconnect-btn"));
    fireEvent.click(screen.getByTestId("confirm-disconnect-btn"));
    expect(screen.getByTestId("disconnect-progress")).toBeInTheDocument();
  });

  it("disconnecting transitions to disconnected state", () => {
    vi.useFakeTimers();
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    fireEvent.click(screen.getByTestId("disconnect-btn"));
    fireEvent.click(screen.getByTestId("confirm-disconnect-btn"));
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByTestId("disconnect-done")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders reconnect banner for reconnect_required connection", () => {
    render(<ConnectionDetailClient connectionId="conn_accounts" />);
    expect(screen.getByText(/authorization expired/i)).toBeInTheDocument();
    expect(screen.getByTestId("reconnect-btn")).toBeInTheDocument();
  });

  it("clicking reconnect opens reconnect flow modal", () => {
    render(<ConnectionDetailClient connectionId="conn_accounts" />);
    fireEvent.click(screen.getByTestId("reconnect-btn"));
    expect(screen.getByTestId("connect-flow-modal")).toBeInTheDocument();
  });

  it("renders not-found state for unknown connection", () => {
    render(<ConnectionDetailClient connectionId="conn_unknown" />);
    expect(screen.getByTestId("connection-not-found")).toBeInTheDocument();
  });

  it("save permissions button renders", () => {
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    expect(screen.getByTestId("save-permissions-btn")).toBeInTheDocument();
  });
});

// ─── Left rail settings link ──────────────────────────────────────────────────

describe("MailboxLeftRail — settings link updated", () => {
  it("Manage mailboxes link points to /app/mailbox/settings", () => {
    render(<MailboxWorkspace />);
    const link = screen.getByRole("link", { name: /manage mailboxes/i });
    expect(link).toHaveAttribute("href", "/app/mailbox/settings");
  });
});
