import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ReactNode } from "react";
import type { SavedViewItem } from "../use-mailbox-saved-views";

vi.mock("server-only", () => ({}));

let mockPathname = "/app/mailbox";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  RATE_LIMITS: { api: { maxRequests: 100, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/saved-view-service", () => ({
  listMailboxSavedViews: vi.fn(),
  createMailboxSavedView: vi.fn(),
  deleteMailboxSavedView: vi.fn(),
}));

import { MailboxLeftRail, buildSavedViewHref } from "../mailbox-left-rail";
import { POST as postSavedViewRoute, validateCreateSavedViewBody } from "@/app/api/mailbox/saved-views/route";
import { DELETE as deleteSavedViewRoute } from "@/app/api/mailbox/saved-views/[id]/route";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { createMailboxSavedView, deleteMailboxSavedView } from "@/lib/mailbox/saved-view-service";

const mockRequireIntegrationMemberRoute = requireIntegrationMemberRoute as ReturnType<typeof vi.fn>;
const mockCreateMailboxSavedView = createMailboxSavedView as ReturnType<typeof vi.fn>;
const mockDeleteMailboxSavedView = deleteMailboxSavedView as ReturnType<typeof vi.fn>;

function makeSavedView(overrides: Partial<SavedViewItem> = {}): SavedViewItem {
  return {
    id: "view-1",
    label: "Unread billing",
    filters: [{ field: "mailbox", value: "conn-billing", label: "Billing" }],
    searchQuery: "invoice",
    smartViewId: "unread",
    createdAt: "2026-05-21T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = "/app/mailbox";
  mockRequireIntegrationMemberRoute.mockResolvedValue({
    ok: true,
    ctx: { orgId: "org-1", userId: "user-1", role: "member" },
  });
});

describe("Sprint 6.3 Smart Views and Saved Operational Filters", () => {
  it("renders saved views in the left rail", () => {
    render(
      <MailboxLeftRail
        savedViews={[makeSavedView()]}
        onDeleteSavedView={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Saved Views")).toBeInTheDocument();
    expect(screen.getByTitle("Unread billing")).toBeInTheDocument();
  });

  it("restores smart-view route context and query params from a saved view href", () => {
    const href = buildSavedViewHref(
      makeSavedView({
        smartViewId: "assigned-to-me",
        filters: [{ field: "flagged", value: "true", label: "Flagged" }],
        searchQuery: "urgent",
      }),
    );

    expect(href).toBe("/app/mailbox/assigned?q=urgent&f_flagged=true");
  });

  it("restores all-inboxes saved views without inventing a smart-view route", () => {
    const href = buildSavedViewHref(
      makeSavedView({
        smartViewId: "all-inboxes",
        filters: [{ field: "status", value: "OPEN", label: "Open" }],
        searchQuery: "follow up",
      }),
    );

    expect(href).toBe("/app/mailbox?q=follow+up&f_status=OPEN");
  });

  it("wires saved-view delete flow from the left rail", async () => {
    const onDeleteSavedView = vi.fn().mockResolvedValue(undefined);

    render(<MailboxLeftRail savedViews={[makeSavedView()]} onDeleteSavedView={onDeleteSavedView} />);

    fireEvent.click(screen.getByLabelText("Delete Unread billing"));

    await waitFor(() => {
      expect(onDeleteSavedView).toHaveBeenCalledWith("view-1");
    });
  });

  it("validates malformed saved-view payloads before persistence", () => {
    const result = validateCreateSavedViewBody({
      label: "Unread",
      filters: [{ field: "not-real", value: "x", label: "Bad" }],
      smartViewId: "unread",
    });

    expect(result).toEqual({
      ok: false,
      error: "Filter field is invalid",
      status: 400,
    });
  });

  it("rejects invalid saved-view POST payloads with a 4xx response", async () => {
    const request = new NextRequest("http://localhost/api/mailbox/saved-views", {
      method: "POST",
      body: JSON.stringify({
        label: "Unread",
        filters: [{ field: "status", value: 123, label: "Bad value" }],
        smartViewId: "unread",
      }),
    });

    const response = await postSavedViewRoute(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Filter value must be a string" });
    expect(mockCreateMailboxSavedView).not.toHaveBeenCalled();
  });

  it("accepts valid saved-view POST payloads and persists normalized values", async () => {
    mockCreateMailboxSavedView.mockResolvedValue({ id: "view-1" });

    const request = new NextRequest("http://localhost/api/mailbox/saved-views", {
      method: "POST",
      body: JSON.stringify({
        label: "  Waiting follow-up  ",
        filters: [{ field: "mailbox", value: "conn-billing", label: "Billing" }],
        searchQuery: "payment",
        smartViewId: "waiting",
      }),
    });

    const response = await postSavedViewRoute(request);

    expect(response.status).toBe(201);
    expect(mockCreateMailboxSavedView).toHaveBeenCalledWith({
      orgId: "org-1",
      createdBy: "user-1",
      label: "Waiting follow-up",
      filters: [{ field: "mailbox", value: "conn-billing", label: "Billing" }],
      searchQuery: "payment",
      smartViewId: "waiting",
    });
  });

  it("returns success for saved-view delete route", async () => {
    mockDeleteMailboxSavedView.mockResolvedValue(true);

    const response = await deleteSavedViewRoute(new Request("http://localhost/api/mailbox/saved-views/view-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ id: "view-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockDeleteMailboxSavedView).toHaveBeenCalledWith("view-1", "org-1", "user-1");
  });

  it("returns 404 when deleting a missing saved view", async () => {
    mockDeleteMailboxSavedView.mockResolvedValue(false);

    const response = await deleteSavedViewRoute(new Request("http://localhost/api/mailbox/saved-views/missing", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Saved view not found" });
  });
});
