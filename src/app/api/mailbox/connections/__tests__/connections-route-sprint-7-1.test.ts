/**
 * Sprint 7.1 — PATCH /api/mailbox/connections/[connectionId] route tests.
 *
 * Tests:
 * 1. PATCH returns 403 for non-admin.
 * 2. PATCH returns 401 for unauthenticated.
 * 3. PATCH returns 400 for empty displayName.
 * 4. PATCH returns 400 for invalid visibilityPolicy.
 * 5. PATCH returns 400 when no fields are provided.
 * 6. PATCH returns 400 for whitespace-only displayName.
 * 7. PATCH returns 400 for displayName exceeding 100 chars.
 * 8. PATCH updates displayName and visibilityPolicy — calls audit & returns ok.
 * 9. PATCH returns 404 for connections in a different org.
 * 10. PATCH returns 429 when rate-limited.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin, mockRateLimit, mockGetMailboxConnection, mockToListItem, mockLogAuditTx, mockDb } = vi.hoisted(() => {
  const mockDbValue = {
    $transaction: vi.fn(),
  };
  return {
    mockRequireAdmin: vi.fn(),
    mockRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
    mockGetMailboxConnection: vi.fn(),
    mockToListItem: vi.fn(),
    mockLogAuditTx: vi.fn(),
    mockDb: mockDbValue,
  };
});

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: mockRateLimit,
  RATE_LIMITS: { mailboxPolicyUpdate: { maxRequests: 10, window: "60 s" }, api: { maxRequests: 60, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/connection-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailbox/connection-service")>()),
  getMailboxConnection: mockGetMailboxConnection,
  disableMailboxConnection: vi.fn(),
}));

vi.mock("@/lib/realtime", () => ({
  emitMailboxConnectionEvent: vi.fn(),
}));

vi.mock("@/lib/mailbox/admin-shapes", () => ({
  toMailboxConnectionListItem: mockToListItem,
}));

vi.mock("@/lib/mailbox/audit", () => ({
  logMailboxAuditTx: mockLogAuditTx,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

import { PATCH } from "../[connectionId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction = vi.fn();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99 });
});

function makeAdminCtx(orgId = "org-1") {
  return { ok: true as const, ctx: { orgId, userId: "user-1", role: "admin" as const } };
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

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/mailbox/connections/conn-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(connectionId = "conn-1") {
  return { params: Promise.resolve({ connectionId }) };
}

describe("PATCH /api/mailbox/connections/[connectionId] — Sprint 7.1", () => {
  // ── Test 1: 403 for non-admin ─────────────────────────────────────────────┐

  it("returns 403 for a non-authenticated non-admin user", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const req = buildRequest({ displayName: "Billing" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Forbidden" });
  });

  // ── Test 2: 401 for unauthenticated ───────────────────────────────────────

  it("returns 401 for an unauthenticated request", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const req = buildRequest({ displayName: "Billing" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(401);
  });

  // ── Test 3: 400 for empty displayName ─────────────────────────────────────

  it("returns 400 when displayName is empty", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const req = buildRequest({ displayName: "" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("empty");
  });

  // ── Test 4: 400 for invalid visibilityPolicy ──────────────────────────────

  it("returns 400 when visibilityPolicy is invalid", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const req = buildRequest({ visibilityPolicy: "invalid_value" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  // ── Test 5: 400 when no fields are provided ───────────────────────────────

  it("returns 400 when no fields to update are provided", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const req = buildRequest({});
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("must be provided");
  });

  // ── Test 6: 400 for whitespace-only displayName ───────────────────────────

  it("returns 400 when displayName is whitespace only", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const req = buildRequest({ displayName: "   " });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("empty");
  });

  // ── Test 7: 400 for displayName exceeding 100 chars ───────────────────────

  it("returns 400 when displayName exceeds 100 characters", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const req = buildRequest({ displayName: "A".repeat(101) });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("100");
  });

  // ── Test 8: Successful update with audit ──────────────────────────────────

  it("updates displayName and visibilityPolicy, writes audit, returns updated connection", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const existingRow = {
      id: "conn-1",
      orgId: "org-1",
      provider: "GMAIL",
      emailAddress: "billing@acmecorp.com",
      displayName: "Old Name",
      visibilityPolicy: "org_shared",
      status: "ACTIVE",
      tokenRef: null,
      tokenExpiry: null,
      watchMetadata: null,
      watchExpiresAt: null,
      watchRenewedAt: null,
      syncLeaseToken: null,
      syncLeaseExpiresAt: null,
      lastSyncAt: null,
      lastSyncError: null,
      lastSyncErrorCategory: null,
      disabledAt: null,
      connectedBy: "user-1",
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-08"),
    };

    const mockTxFindFirst = vi.fn().mockResolvedValue(existingRow);
    const mockTxUpdate = vi.fn().mockResolvedValue({ ...existingRow, displayName: "New Name", visibilityPolicy: "admin_only" });

    mockDb.$transaction.mockImplementation(async (txFn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxConnection: {
          findFirst: mockTxFindFirst,
          update: mockTxUpdate,
        },
      };
      return await txFn(tx);
    });

    const updatedRecord = {
      ...existingRow,
      displayName: "New Name",
      visibilityPolicy: "admin_only",
    };
    mockGetMailboxConnection.mockResolvedValue(updatedRecord);

    const listItem = makeListItem({ displayName: "New Name", visibilityPolicy: "admin_only" });
    mockToListItem.mockReturnValue(listItem);

    const req = buildRequest({ displayName: "New Name", visibilityPolicy: "admin_only" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection.displayName).toBe("New Name");
    expect(body.connection.visibilityPolicy).toBe("admin_only");

    expect(mockTxFindFirst).toHaveBeenCalledWith({
      where: { id: "conn-1", orgId: "org-1" },
      select: { id: true, displayName: true, visibilityPolicy: true, notificationSettings: true },
    });
    expect(mockTxUpdate).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: expect.objectContaining({
        displayName: "New Name",
        visibilityPolicy: "admin_only",
      }),
    });

    expect(mockLogAuditTx).toHaveBeenCalledTimes(1);
    const auditCall = mockLogAuditTx.mock.calls[0][1];
    expect(auditCall.action).toBe("CONNECTION_POLICY_UPDATED");
    expect(auditCall.metadata.previousDisplayName).toBe("Old Name");
    expect(auditCall.metadata.newDisplayName).toBe("New Name");
    expect(auditCall.metadata.previousVisibilityPolicy).toBe("org_shared");
    expect(auditCall.metadata.newVisibilityPolicy).toBe("admin_only");
    expect(auditCall.summary).toContain("display name updated");
    expect(auditCall.summary).toContain("visibility policy changed");
  });

  // ── Test 9: 404 for connection in different org ────────────────────────────

  it("returns 404 when the connection belongs to a different organization", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx("org-1"));

    mockDb.$transaction.mockImplementation(async (txFn: (tx: unknown) => Promise<unknown>) => {
      const mockFindFirstNotFound = vi.fn().mockResolvedValue(null);
      const tx = {
        mailboxConnection: {
          findFirst: mockFindFirstNotFound,
          update: vi.fn(),
        },
      };
      return await txFn(tx);
    });

    const req = buildRequest({ displayName: "New Name" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  // ── Test 10: Returns 429 when rate-limited ─────────────────────────────────

  it("returns 429 when rate-limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0 });

    const req = buildRequest({ displayName: "Billing" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });
});
