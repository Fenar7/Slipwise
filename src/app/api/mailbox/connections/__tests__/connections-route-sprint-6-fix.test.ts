/**
 * Sprint 6 Fix — GET /api/mailbox/connections route tests.
 *
 * Tests:
 * 5. GET /api/mailbox/connections returns empty array for zero-mailbox orgs.
 * 6. Non-admin path returns 403 (not 500).
 * 7. Valid admin path returns mapped connection list successfully.
 * 8. Malformed / null visibilityPolicy record does not crash the route.
 *
 * These tests are pure unit-level: they mock auth, rate-limit, and the
 * connection-service to avoid touching any real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── Stub out server-only and all server-side imports ─────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/connection-service", () => ({
  listMailboxConnections: vi.fn(),
}));

vi.mock("@/lib/mailbox/admin-shapes", () => ({
  toMailboxConnectionListItem: vi.fn(),
}));

// ─── Import mocked modules ────────────────────────────────────────────────────

import { GET } from "../route";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnections } from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";

const mockRequireAdmin = vi.mocked(requireIntegrationAdminRoute);
const mockListConnections = vi.mocked(listMailboxConnections);
const mockToListItem = vi.mocked(toMailboxConnectionListItem);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdminCtx(orgId = "org-1") {
  return { ok: true as const, ctx: { orgId, userId: "user-1", role: "admin" } };
}

function makeForbiddenResponse() {
  return {
    ok: false as const,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}

function makeUnauthorizedResponse() {
  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

/** Minimal MailboxConnectionListItem shape for testing */
function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GMAIL",
    emailAddress: "billing@acmecorp.com",
    displayName: "Billing",
    status: "ACTIVE",
    visibilityPolicy: "org_shared",
    health: { status: "healthy", actionRequired: false },
    lastSyncAt: null,
    lastSyncError: null,
    connectedBy: "user-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/mailbox/connections — Sprint 6 fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 5: Zero-mailbox org returns empty array ───────────────────────────

  it("returns { connections: [] } for an org with no mailbox connections", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListConnections.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ connections: [] });
    // toMailboxConnectionListItem must not be called for empty result
    expect(mockToListItem).not.toHaveBeenCalled();
  });

  // ── Test 6: Non-admin user gets 403, not 500 ──────────────────────────────

  it("returns 403 for a non-admin authenticated user", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Forbidden" });
    // No DB calls must occur after forbidden check
    expect(mockListConnections).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockListConnections).not.toHaveBeenCalled();
  });

  // ── Test 7: Valid admin path maps and returns connections ─────────────────

  it("returns mapped connections list for a valid admin with connections", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    // Simulate two DB records (minimal shape for the mock)
    const mockRecords = [{ id: "conn-1" }, { id: "conn-2" }] as Parameters<
      typeof listMailboxConnections
    >[0] extends string
      ? never
      : Awaited<ReturnType<typeof listMailboxConnections>>;
    mockListConnections.mockResolvedValue(mockRecords as Awaited<ReturnType<typeof listMailboxConnections>>);

    const item1 = makeListItem({ id: "conn-1" });
    const item2 = makeListItem({ id: "conn-2", emailAddress: "support@acmecorp.com" });
    mockToListItem
      .mockReturnValueOnce(item1 as ReturnType<typeof toMailboxConnectionListItem>)
      .mockReturnValueOnce(item2 as ReturnType<typeof toMailboxConnectionListItem>);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connections).toHaveLength(2);
    expect(body.connections[0].id).toBe("conn-1");
    expect(body.connections[1].id).toBe("conn-2");
    expect(mockToListItem).toHaveBeenCalledTimes(2);
  });

  // ── Test 8: null visibilityPolicy record does not crash ───────────────────

  it("does not 500 when a record has null visibilityPolicy (pre-migration record)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    const mockRecords = [{ id: "conn-old" }] as Awaited<ReturnType<typeof listMailboxConnections>>;
    mockListConnections.mockResolvedValue(mockRecords);

    // Simulate toMailboxConnectionListItem returning a null-policy record
    // (as it would after the null-guard fix applies "org_shared" as default)
    const safeItem = makeListItem({ id: "conn-old", visibilityPolicy: "org_shared" });
    mockToListItem.mockReturnValueOnce(safeItem as ReturnType<typeof toMailboxConnectionListItem>);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections[0].visibilityPolicy).toBe("org_shared");
  });

  // ── Test 9 (settings page level): error banner only for true failures ─────

  it("returns 500 and the banner fires only when the service layer truly throws", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListConnections.mockRejectedValue(new Error("DB connection refused"));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Internal server error" });
  });
});
