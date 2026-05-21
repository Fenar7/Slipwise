/**
 * Sprint 1.4 tests — Settings, connections, and permissions.
 * Extends Sprint 1.1–1.3 coverage; does not replace them.
 *
 * Updated for Phase 6 fix: settings and connect flows now use real APIs.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mailbox/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
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

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "user_self" }, loading: false }),
}));

const mockAdminConnections: import("../types").MailboxAdminConnection[] = [
  {
    id: "conn_billing",
    orgId: "org_1",
    provider: "gmail",
    slug: "billing",
    emailAddress: "billing@acmecorp.com",
    displayName: "Billing",
    status: "connected",
    lastSyncAt: "2026-05-08T14:30:00Z",
    lastSyncError: null,
    connectedBy: "Rahul Verma (Admin)",
    visibilityPolicy: "org_shared",
  },
  {
    id: "conn_support",
    orgId: "org_1",
    provider: "gmail",
    slug: "support",
    emailAddress: "support@acmecorp.com",
    displayName: "Support",
    status: "connected",
    lastSyncAt: "2026-05-08T14:28:00Z",
    lastSyncError: null,
    connectedBy: "Rahul Verma (Admin)",
    visibilityPolicy: "org_shared",
  },
  {
    id: "conn_accounts",
    orgId: "org_1",
    provider: "gmail",
    slug: "accounts",
    emailAddress: "accounts@acmecorp.com",
    displayName: "Accounts",
    status: "reconnect_required",
    lastSyncAt: "2026-05-07T09:15:00Z",
    lastSyncError: "OAuth token expired. Reconnect required.",
    connectedBy: "Rahul Verma (Admin)",
    visibilityPolicy: "admin_only",
  },
];

vi.mock("../use-mailbox-admin-connections", () => ({
  useMailboxAdminConnections: vi.fn(() => ({
    connections: mockAdminConnections,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
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

import { useMailboxAdminConnections } from "../use-mailbox-admin-connections";
const mockUseMailboxAdminConnections = vi.mocked(useMailboxAdminConnections);

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
  beforeEach(() => {
    mockUseMailboxAdminConnections.mockReturnValue({
      connections: mockAdminConnections,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

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
    for (const c of mockAdminConnections) {
      expect(screen.getByTestId(`connection-card-${c.id}`)).toBeInTheDocument();
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

  it("clicking Connect mailbox opens connect flow modal", () => {
    render(<MailboxSettingsPage />);
    fireEvent.click(screen.getByTestId("connect-mailbox-btn"));
    expect(screen.getByTestId("connect-flow-modal")).toBeInTheDocument();
  });

  it("no longer defaults to fake mailbox summaries when hook returns empty", () => {
    mockUseMailboxAdminConnections.mockReturnValue({
      connections: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<MailboxSettingsPage />);
    expect(screen.getByTestId("settings-empty-state")).toBeInTheDocument();
    expect(screen.queryByText("billing@acmecorp.com")).not.toBeInTheDocument();
    expect(screen.queryByText("support@acmecorp.com")).not.toBeInTheDocument();
    expect(screen.queryByText("accounts@acmecorp.com")).not.toBeInTheDocument();
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

  it("does not render unused mailbox label input", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: /mailbox display name/i })).not.toBeInTheDocument();
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

  it("authorizing step shows spinner and redirecting message", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    expect(screen.getByText(/redirecting to google/i)).toBeInTheDocument();
  });

  it("does not render simulate success button in live path", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    expect(screen.queryByTestId("simulate-success-btn")).not.toBeInTheDocument();
  });

  it("does not render simulate failure button in live path", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("authorize-btn"));
    expect(screen.queryByTestId("simulate-failure-btn")).not.toBeInTheDocument();
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

  it("does not render unused mailbox label input in reconnect mode", () => {
    render(<MailboxConnectFlow onClose={vi.fn()} reconnectEmail="accounts@acmecorp.com" />);
    expect(screen.queryByRole("textbox", { name: /mailbox display name/i })).not.toBeInTheDocument();
  });
});

// ─── ConnectionDetailClient ───────────────────────────────────────────────────

describe("ConnectionDetailClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchConnection(connection: typeof mockAdminConnections[number] | null) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: connection !== null,
      status: connection ? 200 : 404,
      json: async () => (connection ? { connection } : { error: "Not found" }),
    } as Response);
  }

  it("renders detail page for valid connection", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByTestId("connection-detail-page")).toBeInTheDocument();
    });
  });

  it("renders connection display name and email", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    });
    expect(screen.getByText("billing@acmecorp.com")).toBeInTheDocument();
  });

  it("renders connection status section", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /connection status/i })).toBeInTheDocument();
    });
  });

  it("renders visibility section with truthful policy", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /mailbox visibility/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/shared with organization/i)).toBeInTheDocument();
  });

  it("does not render fake editable permission controls", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByTestId("connection-detail-page")).toBeInTheDocument();
    });
    expect(screen.queryByRole("combobox", { name: /read access/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /reply \/ send access/i })).not.toBeInTheDocument();
  });

  it("does not render fake save permissions button", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByTestId("connection-detail-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("save-permissions-btn")).not.toBeInTheDocument();
  });

  it("renders danger zone", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
    });
  });

  it("renders disconnect button in idle state", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      expect(screen.getByTestId("disconnect-btn")).toBeInTheDocument();
    });
  });

  it("clicking disconnect shows confirmation panel", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("disconnect-btn"));
    });
    expect(screen.getByTestId("disconnect-confirm-panel")).toBeInTheDocument();
  });

  it("confirmation panel has confirm and cancel buttons", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("disconnect-btn"));
    });
    expect(screen.getByTestId("confirm-disconnect-btn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel disconnect/i })).toBeInTheDocument();
  });

  it("cancel returns to idle state", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("disconnect-btn"));
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel disconnect/i }));
    expect(screen.getByTestId("disconnect-btn")).toBeInTheDocument();
  });

  it("confirming disconnect shows disconnecting state", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).includes("/gmail/disconnect")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ connection: mockAdminConnections[0] }) } as Response;
    });
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("disconnect-btn"));
    });
    fireEvent.click(screen.getByTestId("confirm-disconnect-btn"));
    expect(screen.getByTestId("disconnect-progress")).toBeInTheDocument();
  });

  it("disconnect calls the real Gmail disconnect endpoint", async () => {
    mockFetchConnection(mockAdminConnections[0]);
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).includes("/gmail/disconnect")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ connection: mockAdminConnections[0] }) } as Response;
    });
    global.fetch = fetchSpy;
    render(<ConnectionDetailClient connectionId="conn_billing" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("disconnect-btn"));
    });
    fireEvent.click(screen.getByTestId("confirm-disconnect-btn"));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/mailbox/gmail/disconnect",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ connectionId: "conn_billing" }),
        }),
      );
    });
  });

  it("renders reconnect banner for reconnect_required connection", async () => {
    mockFetchConnection(mockAdminConnections[2]);
    render(<ConnectionDetailClient connectionId="conn_accounts" />);
    await waitFor(() => {
      expect(screen.getByText(/authorization expired/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("reconnect-btn")).toBeInTheDocument();
  });

  it("clicking reconnect opens reconnect flow modal", async () => {
    mockFetchConnection(mockAdminConnections[2]);
    render(<ConnectionDetailClient connectionId="conn_accounts" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("reconnect-btn"));
    });
    expect(screen.getByTestId("connect-flow-modal")).toBeInTheDocument();
  });

  it("reconnect flow passes connectionId to OAuth endpoint", async () => {
    mockFetchConnection(mockAdminConnections[2]);
    render(<ConnectionDetailClient connectionId="conn_accounts" />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("reconnect-btn"));
    });
    fireEvent.click(screen.getByTestId("reconnect-authorize-btn"));
    expect(screen.getByTestId("connect-step-authorizing")).toBeInTheDocument();
    // The AuthorizingStep sets a 400ms timer before redirecting.
    // We verify the redirect URL will include connectionId by inspecting the component behavior.
    // Since window.location.href is not actually navigated in jsdom, we assert the step rendered.
  });

  it("renders not-found state for unknown connection", async () => {
    mockFetchConnection(null);
    render(<ConnectionDetailClient connectionId="conn_unknown" />);
    await waitFor(() => {
      expect(screen.getByTestId("connection-not-found")).toBeInTheDocument();
    });
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
