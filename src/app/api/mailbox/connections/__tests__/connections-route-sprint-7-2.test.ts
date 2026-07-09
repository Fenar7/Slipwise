/**
 * Sprint 7.2 — Connection management suite.
 *
 * Covers:
 * - GET  /api/mailbox/connections  — cursor-based paginated listing (excl. soft-deleted)
 * - POST /api/mailbox/connections  — create with duplicate check, 201 + Location
 * - DELETE /api/mailbox/connections/[connectionId] — soft-delete with draft guard
 * - PATCH  /api/mailbox/connections/[connectionId] — notificationSettings + unknown-key rejection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// ── Hoisted mock factories ────────────────────────────────────────────────────

const {
  mockRequireAdmin,
  mockRateLimit,
  mockListPaginated,
  mockCreateConnection,
  mockSoftDelete,
  mockUpdateSettings,
  mockGetConnection,
  mockGetSyncRuns,
  mockToListItem,
  mockEmitEvent,
  mockDbFindFirst,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  mockListPaginated: vi.fn(),
  mockCreateConnection: vi.fn(),
  mockSoftDelete: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockGetConnection: vi.fn(),
  mockGetSyncRuns: vi.fn(),
  mockToListItem: vi.fn(),
  mockEmitEvent: vi.fn(),
  mockDbFindFirst: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: mockRateLimit,
  RATE_LIMITS: {
    mailboxPolicyUpdate: { maxRequests: 10, window: "60 s" },
    api: { maxRequests: 60, window: "60 s" },
  },
}));

vi.mock("@/lib/mailbox/connection-service", () => ({
  listMailboxConnectionsPaginated: mockListPaginated,
  createMailboxConnection: mockCreateConnection,
  softDeleteMailboxConnection: mockSoftDelete,
  updateMailboxConnectionSettings: mockUpdateSettings,
  getMailboxConnection: mockGetConnection,
}));

vi.mock("@/lib/mailbox/admin-shapes", () => ({
  toMailboxConnectionListItem: mockToListItem,
}));

vi.mock("@/lib/mailbox/sync-run-read-service", () => ({
  getMailboxSyncRunsByConnectionIds: mockGetSyncRuns,
}));

vi.mock("@/lib/realtime", () => ({
  emitMailboxConnectionEvent: mockEmitEvent,
}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findFirst: mockDbFindFirst,
    },
    $transaction: vi.fn(),
  },
}));

// ── Route imports ─────────────────────────────────────────────────────────────

import { GET as ListGET, POST as ListPOST } from "../route";
import { GET as DetailGET, PATCH, DELETE } from "../[connectionId]/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminCtx(orgId = "org-1") {
  return {
    ok: true as const,
    ctx: { orgId, userId: "user-1", role: "admin" as const },
  };
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

function buildGetRequest(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams(overrides);
  return new Request(
    `http://localhost/api/mailbox/connections?${params.toString()}`,
    { method: "GET" },
  );
}

function buildPostRequest(body: unknown) {
  return new Request("http://localhost/api/mailbox/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildDeleteRequest(connectionId = "conn-1") {
  return new Request(
    `http://localhost/api/mailbox/connections/${connectionId}`,
    { method: "DELETE" },
  );
}

function buildPatchRequest(body: unknown) {
  return new Request("http://localhost/api/mailbox/connections/conn-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(connectionId = "conn-1") {
  return { params: Promise.resolve({ connectionId }) };
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
    notificationSettings: null,
    health: { status: "healthy", actionRequired: false },
    lastSyncAt: null,
    lastSyncError: null,
    connectedBy: "user-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GMAIL",
    providerAccountId: "prov-1",
    emailAddress: "billing@acmecorp.com",
    displayName: "Billing",
    status: "ACTIVE",
    visibilityPolicy: "org_shared",
    notificationSettings: null,
    tokenRef: "tok-1",
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
    deletedAt: null,
    connectedBy: "user-1",
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-08"),
    ...overrides,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99 });
  mockGetSyncRuns.mockResolvedValue({
    latestRunByConnectionId: new Map(),
    latestCompletedRunByConnectionId: new Map(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/mailbox/connections  — Paginated listing
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/mailbox/connections — Sprint 7.2 pagination", () => {
  it("returns paginated connections with nextCursor", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const conn1 = makeRecord({ id: "conn-1", displayName: "Alpha" });
    const conn2 = makeRecord({ id: "conn-2", displayName: "Beta" });
    mockListPaginated.mockResolvedValue({
      records: [conn1, conn2],
      nextCursor: "conn-2",
    });

    mockGetSyncRuns.mockResolvedValue({
      latestRunByConnectionId: new Map(),
      latestCompletedRunByConnectionId: new Map(),
    });

    const item1 = makeListItem({ id: "conn-1", displayName: "Alpha" });
    const item2 = makeListItem({ id: "conn-2", displayName: "Beta" });
    mockToListItem.mockReturnValueOnce(item1).mockReturnValueOnce(item2);

    const res = await ListGET(buildGetRequest({ pageSize: "2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toHaveLength(2);
    expect(body.nextCursor).toBe("conn-2");
    expect(body.connections[0].displayName).toBe("Alpha");
    expect(body.connections[1].displayName).toBe("Beta");
  });

  it("returns empty array when no connections exist", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListPaginated.mockResolvedValue({ records: [], nextCursor: null });

    const res = await ListGET(buildGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("nextCursor is null on last page", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListPaginated.mockResolvedValue({
      records: [makeRecord()],
      nextCursor: null,
    });
    mockToListItem.mockReturnValue(makeListItem());

    const res = await ListGET(buildGetRequest({ pageSize: "100" }));
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
  });

  it("passes cursor and pageSize to service", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListPaginated.mockResolvedValue({ records: [], nextCursor: null });

    await ListGET(buildGetRequest({ cursor: "conn-5", pageSize: "10" }));

    expect(mockListPaginated).toHaveBeenCalledWith("org-1", {
      cursor: "conn-5",
      pageSize: 10,
    });
  });

  it("returns 400 for invalid pageSize (zero)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListGET(buildGetRequest({ pageSize: "0" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for invalid pageSize (above max)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListGET(buildGetRequest({ pageSize: "101" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for non-numeric pageSize", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListGET(buildGetRequest({ pageSize: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await ListGET(buildGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await ListGET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0 });

    const res = await ListGET(buildGetRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/mailbox/connections  — Create connection
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/mailbox/connections — Sprint 7.2 create", () => {
  beforeEach(() => {
    mockDbFindFirst.mockReset();
    mockCreateConnection.mockReset();
    mockEmitEvent.mockReset();
  });

  const validBody = {
    provider: "GMAIL",
    emailAddress: "new@acmecorp.com",
    displayName: "New Connection",
    providerAccountId: "prov-abc",
    tokenRef: "tok-abc",
  };

  it("creates a connection and returns 201 with Location header", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbFindFirst.mockResolvedValue(null);
    mockCreateConnection.mockResolvedValue(makeRecord({ id: "conn-new" }));
    mockToListItem.mockReturnValue(makeListItem({ id: "conn-new" }));

    const res = await ListPOST(buildPostRequest(validBody));
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe(
      "/api/mailbox/connections/conn-new",
    );

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection).toBeDefined();

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        provider: "GMAIL",
        emailAddress: "new@acmecorp.com",
        displayName: "New Connection",
      }),
    );
    expect(mockEmitEvent).toHaveBeenCalledWith("mailbox_connection_created", {
      id: "conn-new",
      orgId: "org-1",
    });
  });

  it("returns 400 for missing required field", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const body = { ...validBody };
    delete (body as Record<string, unknown>).provider;
    const res = await ListPOST(buildPostRequest(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 400 for invalid provider value", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListPOST(
      buildPostRequest({ ...validBody, provider: "OUTLOOK" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListPOST(
      buildPostRequest({ ...validBody, emailAddress: "not-an-email" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty displayName", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListPOST(
      buildPostRequest({ ...validBody, displayName: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate displayName in same org", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbFindFirst.mockResolvedValue({ id: "existing-conn" });

    const res = await ListPOST(buildPostRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already exists");
    expect(mockCreateConnection).not.toHaveBeenCalled();
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown fields in request body", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await ListPOST(
      buildPostRequest({ ...validBody, extraField: "should-be-rejected" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await ListPOST(buildPostRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0 });

    const res = await ListPOST(buildPostRequest(validBody));
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/mailbox/connections/[connectionId]  — Soft-delete
// ═══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/mailbox/connections/[connectionId] — Sprint 7.2 soft-delete", () => {
  it("soft-deletes a connection and returns ok", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockSoftDelete.mockResolvedValue(
      makeRecord({ status: "DISCONNECTED", deletedAt: new Date() }),
    );
    mockToListItem.mockReturnValue(
      makeListItem({ status: "DISCONNECTED" }),
    );

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection).toBeDefined();

    expect(mockSoftDelete).toHaveBeenCalledWith("org-1", "conn-1", "user-1");
    expect(mockEmitEvent).toHaveBeenCalledWith("mailbox_connection_deleted", {
      id: "conn-1",
      orgId: "org-1",
    });
  });

  it("returns 404 when connection not found", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockSoftDelete.mockRejectedValue(
      new Error("MailboxConnection conn-1 not found for org org-1"),
    );

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 when connection has active drafts", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockSoftDelete.mockRejectedValue(
      new Error("MailboxConnection conn-1 has active drafts; cannot delete"),
    );

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("active email drafts");
  });

  it("returns 410 when connection is already deleted", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockSoftDelete.mockRejectedValue(
      new Error("MailboxConnection conn-1 is already deleted"),
    );

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(410);

    // Does not emit event when deletion is rejected
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0 });

    const res = await DELETE(buildDeleteRequest(), makeParams());
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/mailbox/connections/[connectionId]  — notificationSettings + strict
// ═══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/mailbox/connections/[connectionId] — Sprint 7.2 extension", () => {
  it("updates notificationSettings only", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockUpdateSettings.mockResolvedValue(
      makeRecord({
        notificationSettings: { email: true, sms: false },
      }),
    );
    mockToListItem.mockReturnValue(
      makeListItem({ notificationSettings: { email: true, sms: false } }),
    );

    const res = await PATCH(
      buildPatchRequest({ notificationSettings: { email: true, sms: false } }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection.notificationSettings).toEqual({
      email: true,
      sms: false,
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        connectionId: "conn-1",
        notificationSettings: { email: true, sms: false },
      }),
    );
    expect(mockEmitEvent).toHaveBeenCalledWith("mailbox_connection_updated", {
      id: "conn-1",
      orgId: "org-1",
    });
  });

  it("updates all three fields together", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockUpdateSettings.mockResolvedValue(
      makeRecord({
        displayName: "New Name",
        visibilityPolicy: "admin_only",
        notificationSettings: { email: true, sms: true },
      }),
    );
    mockToListItem.mockReturnValue(
      makeListItem({
        displayName: "New Name",
        visibilityPolicy: "admin_only",
        notificationSettings: { email: true, sms: true },
      }),
    );

    const res = await PATCH(
      buildPatchRequest({
        displayName: "New Name",
        visibilityPolicy: "admin_only",
        notificationSettings: { email: true, sms: true },
      }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "New Name",
        visibilityPolicy: "admin_only",
        notificationSettings: { email: true, sms: true },
      }),
    );
  });

  it("returns 400 when notificationSettings has non-boolean values", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await PATCH(
      buildPatchRequest({
        notificationSettings: { email: "yes", sms: false },
      }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when unknown fields are present in body", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await PATCH(
      buildPatchRequest({ displayName: "Billing", extraField: "reject" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when notificationSettings is missing required keys", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await PATCH(
      buildPatchRequest({ notificationSettings: { email: true } }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no fields are provided", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await PATCH(buildPatchRequest({}), makeParams());
    expect(res.status).toBe(400);
  });
});
