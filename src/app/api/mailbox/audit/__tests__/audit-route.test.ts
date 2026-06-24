/**
 * Sprint 7.4 — Audit trail API, per-connection audit, and support summary.
 *
 * Covers:
 * - GET /api/mailbox/audit (paginated, filtered, metadata stripping, validation, rate limit, auth)
 * - GET /api/mailbox/audit/[eventId] (single event, tenant isolation)
 * - GET /api/mailbox/connections/[connectionId]/audit (scoped audit, rate limit, auth)
 * - GET /api/mailbox/connections/[connectionId]/support-summary (email redacted, error sanitized, rate limit, auth)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const {
  mockRequireAdmin,
  mockRateLimit,
  mockListAuditEvents,
  mockGetAuditEventById,
  mockStripSensitive,
  mockGetActionLabel,
  mockGetConnectionForAudit,
  mockGetConnectionSupportData,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  mockListAuditEvents: vi.fn(),
  mockGetAuditEventById: vi.fn(),
  mockStripSensitive: vi.fn((m: Record<string, unknown> | null) => m),
  mockGetActionLabel: vi.fn((action: string) => `Label for ${action}`),
  mockGetConnectionForAudit: vi.fn(),
  mockGetConnectionSupportData: vi.fn(),
}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: mockRateLimit,
  RATE_LIMITS: {
    mailboxAuditList: { maxRequests: 30, window: "60 s" },
    mailboxAuditDetail: { maxRequests: 60, window: "60 s" },
    mailboxSupportSummary: { maxRequests: 20, window: "60 s" },
  },
}));

vi.mock("@/lib/mailbox/audit-read-service", () => ({
  listMailboxAuditEventsPaginated: mockListAuditEvents,
  getMailboxAuditEventById: mockGetAuditEventById,
  stripSensitiveMetadata: mockStripSensitive,
  getMailboxConnectionForAudit: mockGetConnectionForAudit,
  getConnectionSupportData: mockGetConnectionSupportData,
}));

vi.mock("@/lib/mailbox/audit", () => ({
  getMailboxAuditActionLabel: mockGetActionLabel,
  MAILBOX_AUDIT_ACTION_LABELS: {},
}));

// ─── Import handlers after mocks ──────────────────────────────────────────────

import { GET as GET_AUDIT } from "../route";
import { GET as GET_EVENT } from "../[eventId]/route";
import { GET as GET_CONN_AUDIT } from "../../connections/[connectionId]/audit/route";
import { GET as GET_SUPPORT_SUMMARY } from "../../connections/[connectionId]/support-summary/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildGetRequest(url: string) {
  return new Request(url, { method: "GET" });
}

function makeAuditRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    threadId: null,
    messageId: null,
    actorId: "user-1",
    action: "CONNECTION_CREATED",
    summary: "Connected mailbox",
    metadata: null,
    createdAt: new Date("2026-06-16T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99 });
  mockStripSensitive.mockImplementation((m: Record<string, unknown> | null) => m);
  mockGetActionLabel.mockImplementation((action: string) => `Label for ${action}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/mailbox/audit
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/mailbox/audit", () => {
  it("returns paginated events for org (happy path)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListAuditEvents.mockResolvedValue({
      records: [makeAuditRecord(), makeAuditRecord({ id: "evt-2" })],
      nextCursor: null,
    });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
    expect(body.events[0].id).toBe("evt-1");
    expect(body.events[0].actionLabel).toBe("Label for CONNECTION_CREATED");
    expect(mockListAuditEvents).toHaveBeenCalledWith("org-1", expect.objectContaining({ pageSize: 20 }));
  });

  it("filters correctly by connectionId", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListAuditEvents.mockResolvedValue({ records: [makeAuditRecord()], nextCursor: null });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit?connectionId=conn-42"),
    );

    expect(res.status).toBe(200);
    expect(mockListAuditEvents).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ connectionId: "conn-42" }),
    );
  });

  it("filters correctly by action", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListAuditEvents.mockResolvedValue({ records: [makeAuditRecord()], nextCursor: null });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit?action=SYNC_FAILED"),
    );

    expect(res.status).toBe(200);
    expect(mockListAuditEvents).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ action: "SYNC_FAILED" }),
    );
  });

  it("filters correctly by from and to", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListAuditEvents.mockResolvedValue({ records: [], nextCursor: null });

    const res = await GET_AUDIT(
      buildGetRequest(
        "http://localhost/api/mailbox/audit?from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.999Z",
      ),
    );

    expect(res.status).toBe(200);
    expect(mockListAuditEvents).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        from: new Date("2026-06-01T00:00:00.000Z"),
        to: new Date("2026-06-30T23:59:59.999Z"),
      }),
    );
  });

  it("returns nextCursor when more pages exist; returns null on last page", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockListAuditEvents.mockResolvedValue({
      records: [makeAuditRecord()],
      nextCursor: "evt-cursor-abc",
    });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit?pageSize=1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBe("evt-cursor-abc");
  });

  it("strips metadata keys containing token and secret before returning", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockStripSensitive.mockReturnValue({ safe: "value" });
    mockListAuditEvents.mockResolvedValue({
      records: [
        makeAuditRecord({
          metadata: { accessToken: "secret123", safeKey: "ok", anotherSecret: "x" },
        }),
      ],
      nextCursor: null,
    });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit"),
    );

    expect(res.status).toBe(200);
    expect(mockStripSensitive).toHaveBeenCalledWith({
      accessToken: "secret123",
      safeKey: "ok",
      anotherSecret: "x",
    });
    const body = await res.json();
    expect(body.events[0].metadata).toEqual({ safe: "value" });
  });

  it("returns 400 on pageSize=999 (exceeds max)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit?pageSize=999"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("100");
  });

  it("returns 400 on unknown query param (strict Zod)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit?unknownField=foo"),
    );

    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 });

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit"),
    );

    expect(res.status).toBe(429);
  });

  it("returns 403 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit"),
    );

    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await GET_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/audit"),
    );

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/mailbox/audit/[eventId]
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/mailbox/audit/[eventId]", () => {
  it("returns event for valid id belonging to org", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetAuditEventById.mockResolvedValue(makeAuditRecord());

    const res = await GET_EVENT(
      buildGetRequest("http://localhost/api/mailbox/audit/evt-1"),
      { params: Promise.resolve({ eventId: "evt-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.id).toBe("evt-1");
    expect(body.event.actionLabel).toBe("Label for CONNECTION_CREATED");
    expect(mockGetAuditEventById).toHaveBeenCalledWith("org-1", "evt-1");
  });

  it("returns 404 for unknown eventId", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetAuditEventById.mockResolvedValue(null);

    const res = await GET_EVENT(
      buildGetRequest("http://localhost/api/mailbox/audit/evt-unknown"),
      { params: Promise.resolve({ eventId: "evt-unknown" }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for eventId belonging to a different org (tenant isolation)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx("org-1"));
    mockGetAuditEventById.mockResolvedValue(null);

    const res = await GET_EVENT(
      buildGetRequest("http://localhost/api/mailbox/audit/evt-other-org"),
      { params: Promise.resolve({ eventId: "evt-other-org" }) },
    );

    expect(res.status).toBe(404);
    expect(mockGetAuditEventById).toHaveBeenCalledWith("org-1", "evt-other-org");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/mailbox/connections/[connectionId]/audit
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/mailbox/connections/[connectionId]/audit", () => {
  it("returns connection-scoped events for valid connectionId in org", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionForAudit.mockResolvedValue({ id: "conn-1" });
    mockListAuditEvents.mockResolvedValue({
      records: [makeAuditRecord()],
      nextCursor: null,
    });

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/audit"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(mockListAuditEvents).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ connectionId: "conn-1" }),
    );
  });

  it("returns 404 if connectionId does not belong to org", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionForAudit.mockResolvedValue(null);

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-notfound/audit"),
      { params: Promise.resolve({ connectionId: "conn-notfound" }) },
    );

    expect(res.status).toBe(404);
    expect(mockListAuditEvents).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 });

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/audit"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(429);
  });

  it("returns 403 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/audit"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/audit"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 on unknown query param (strict pagination)", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionForAudit.mockResolvedValue({ id: "conn-1" });

    const res = await GET_CONN_AUDIT(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/audit?unknownField=foo"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/mailbox/connections/[connectionId]/support-summary
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/mailbox/connections/[connectionId]/support-summary", () => {
  it("returns summary with emailAddress always [REDACTED]", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionSupportData.mockResolvedValue({
      connectionId: "conn-1",
      displayName: "Test Mailbox",
      provider: "GMAIL",
      status: "ACTIVE",
      lastSyncAt: new Date("2026-06-16T10:00:00.000Z"),
      lastSyncError: null,
      deletedAt: null,
      syncRunCount: 10,
      failedSyncRunCount: 0,
      providerErrorSummary: null,
      recentAuditEvents: [],
    });

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.emailAddress).toBe("[REDACTED]");
    expect(body.summary.displayName).toBe("Test Mailbox");
    expect(body.summary.syncRunCount).toBe(10);
  });

  it("sanitizes providerErrorSummary — replaces 20+ char alphanumeric strings with [REDACTED]", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionSupportData.mockResolvedValue({
      connectionId: "conn-1",
      displayName: "Degraded Mailbox",
      provider: "GMAIL",
      status: "DEGRADED",
      lastSyncAt: new Date("2026-06-16T10:00:00.000Z"),
      lastSyncError: "Token expired",
      deletedAt: null,
      syncRunCount: 42,
      failedSyncRunCount: 2,
      providerErrorSummary: "Token refresh failed: [REDACTED]",
      recentAuditEvents: [],
    });

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.providerErrorSummary).toContain("[REDACTED]");
    expect(body.summary.failedSyncRunCount).toBe(2);
    expect(body.summary.actionRequired).toBe(true);
  });

  it("returns 404 if connectionId does not belong to org", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionSupportData.mockResolvedValue(null);

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-notfound/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-notfound" }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns 429 when rate limited", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 });

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(429);
  });

  it("returns 403 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("includes deletedAt in response when connection is soft-deleted", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockGetConnectionSupportData.mockResolvedValue({
      connectionId: "conn-1",
      displayName: "Deleted Mailbox",
      provider: "GMAIL",
      status: "DISCONNECTED",
      lastSyncAt: null,
      lastSyncError: null,
      deletedAt: new Date("2026-06-10T00:00:00.000Z"),
      syncRunCount: 5,
      failedSyncRunCount: 0,
      providerErrorSummary: null,
      recentAuditEvents: [],
    });

    const res = await GET_SUPPORT_SUMMARY(
      buildGetRequest("http://localhost/api/mailbox/connections/conn-1/support-summary"),
      { params: Promise.resolve({ connectionId: "conn-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.deletedAt).toBe("2026-06-10T00:00:00.000Z");
  });
});
