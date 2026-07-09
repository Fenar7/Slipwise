/**
 * Sprint 7.1 — Connection detail page UI tests.
 *
 * Tests:
 * 1. Display name input renders with current value.
 * 2. Visibility policy radio options render and reflect current policy.
 * 3. "Save changes" button is present and calls PATCH API on click.
 * 4. Save button shows loading state during submission.
 * 5. Save button is disabled while saving.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { ConnectionDetailClient } from "../settings/connections/[id]/connection-detail-client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../mailbox-connect-flow", () => ({
  MailboxConnectFlow: () => null,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    displayName: "Billing",
    emailAddress: "billing@acmecorp.com",
    status: "ACTIVE",
    lastSyncAt: "2026-05-08T14:30:00Z",
    lastSyncError: null,
    connectedBy: "Rahul Verma",
    provider: "GMAIL",
    visibilityPolicy: "org_shared",
    ...overrides,
  };
}

describe("ConnectionDetailClient — Sprint 7.1 settings form", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connection: createMockConnection() }),
    });
  });

  // ── Test 1: Display name input renders with current value ────────────────

  it("renders display name input with the current connection display name", async () => {
    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      const input = screen.getByTestId("display-name-input") as HTMLInputElement;
      expect(input.value).toBe("Billing");
    });
  });

  // ── Test 2: Visibility policy radio options render ───────────────────────

  it("renders visibility policy radio options with the correct default", async () => {
    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("visibility-option-org_shared")).toBeInTheDocument();
      expect(screen.getByTestId("visibility-option-admin_only")).toBeInTheDocument();
      expect(screen.getByTestId("visibility-option-restricted")).toBeInTheDocument();
    });

    const sharedRadio = screen.getByTestId("visibility-option-org_shared")
      .querySelector('input[type="radio"]') as HTMLInputElement;
    expect(sharedRadio.checked).toBe(true);
  });

  // ── Test 3: Save button calls PATCH API with correct params ──────────────

  it("calls PATCH API with displayName and visibilityPolicy on save", async () => {
    let patchBody: Record<string, unknown> | null = null;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/mailbox/connections/conn-1" && options?.method === "PATCH") {
        patchBody = JSON.parse(options.body as string) as Record<string, unknown>;
        return {
          ok: true,
          json: async () => ({
            connection: createMockConnection({
              displayName: "Updated Billing",
              visibilityPolicy: "admin_only",
            }),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ connection: createMockConnection() }),
      };
    });

    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("display-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Updated Billing" } });

    const adminRadio = screen.getByTestId("visibility-option-admin_only")
      .querySelector('input[type="radio"]') as HTMLInputElement;
    fireEvent.click(adminRadio);

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      expect(patchBody).not.toBeNull();
    });

    expect(patchBody).toEqual({
      displayName: "Updated Billing",
      visibilityPolicy: "admin_only",
    });
  });

  // ── Test 4: Save button shows loading state during submission ────────────

  it("shows loading state and disables button during save", async () => {
    let resolvePatch: ((value: unknown) => void) | null = null;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/mailbox/connections/conn-1" && options?.method === "PATCH") {
        await new Promise((resolve) => {
          resolvePatch = resolve;
        });
        return {
          ok: true,
          json: async () => ({
            connection: createMockConnection(),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ connection: createMockConnection() }),
      };
    });

    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      const btn = screen.getByTestId("save-settings-btn") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(screen.getByText("Saving…")).toBeInTheDocument();
    });

    resolvePatch?.({ ok: true, json: async () => ({ connection: createMockConnection() }) });
  });

  // ── Test 5: Success toast fires on successful save ───────────────────────

  it("shows success toast when save completes", async () => {
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/mailbox/connections/conn-1" && options?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({
            connection: createMockConnection({
              displayName: "Updated Name",
            }),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ connection: createMockConnection() }),
      };
    });

    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Mailbox settings saved");
    });
  });

  // ── Test 6: Error toast fires on failed save ─────────────────────────────

  it("shows error toast when save fails", async () => {
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/mailbox/connections/conn-1" && options?.method === "PATCH") {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "displayName must not be empty" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ connection: createMockConnection() }),
      };
    });

    render(<ConnectionDetailClient connectionId="conn-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    expect(screen.getByTestId("save-error")).toBeInTheDocument();
  });
});
