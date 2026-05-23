/**
 * Mailbox Phase 2 Sprint 2.3 — unit tests
 *
 * Covers:
 * - deriveMailboxHealth: all status branches, expiring_soon logic, injected now
 * - EXPIRING_SOON_THRESHOLD_MS constant value
 * - toMailboxConnectionListItem: field mapping, no token leakage
 * - GET /api/mailbox/connections: list, auth, empty
 * - GET /api/mailbox/connections/[id]: single read, 404
 * - PATCH /api/mailbox/connections/[id]/status: update, 400 invalid, 404
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getOrgContext: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 59 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/sync-run-read-service", () => ({
  getMailboxSyncRunsByConnectionIds: vi.fn(async () => ({
    latestRunByConnectionId: new Map(),
    latestCompletedRunByConnectionId: new Map(),
  })),
}));

import { db } from "@/lib/db";
import { getOrgContext, hasRole } from "@/lib/auth";

import {
  deriveMailboxHealth,
  EXPIRING_SOON_THRESHOLD_MS,
} from "@/lib/mailbox/health";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";

import { GET as listConnections } from "@/app/api/mailbox/connections/route";
import { GET as getConnection, DELETE as deleteConnection } from "@/app/api/mailbox/connections/[connectionId]/route";
import { PATCH as patchStatus } from "@/app/api/mailbox/connections/[connectionId]/status/route";
import { NextRequest } from "next/server";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ACTOR = "00000000-0000-0000-0000-000000000001";
const CONN_ID = "conn-001";

const NOW = new Date("2026-05-09T12:00:00.000Z").getTime();
const FAR_FUTURE = new Date("2026-06-01T00:00:00.000Z");
const NEAR_EXPIRY = new Date(NOW + 12 * 60 * 60 * 1000); // 12h from now
const PAST = new Date(NOW - 1000);

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_ID,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE" as const,
    tokenRef: "encrypted-ref-abc",
    tokenExpiry: FAR_FUTURE,
    watchMetadata: { historyId: "12345" },
    lastSyncAt: new Date("2026-05-01T10:00:00Z"),
    lastSyncError: null,
    lastSyncErrorCategory: null,
    disabledAt: null,
    syncLeaseToken: null,
    syncLeaseExpiresAt: null,
    connectedBy: ACTOR,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return makeRecord(overrides);
}

const mockDb = db as unknown as {
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function setupAdminAuth() {
  vi.mocked(getOrgContext).mockResolvedValue({
    orgId: ORG_A,
    userId: ACTOR,
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  } as never);
  vi.mocked(hasRole).mockReturnValue(true);
}

function setupTransaction() {
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── deriveMailboxHealth ──────────────────────────────────────────────────────

describe("deriveMailboxHealth", () => {
  it("returns healthy for ACTIVE with token expiry far in the future", () => {
    const h = deriveMailboxHealth(makeRecord() as never, NOW);
    expect(h.status).toBe("healthy");
    expect(h.actionRequired).toBe(false);
  });

  it("returns expiring_soon for ACTIVE with token expiry within 24h", () => {
    const h = deriveMailboxHealth(
      makeRecord({ tokenExpiry: NEAR_EXPIRY }) as never,
      NOW,
    );
    expect(h.status).toBe("expiring_soon");
    expect(h.actionRequired).toBe(true);
  });

  it("returns healthy when tokenExpiry is null (unknown expiry)", () => {
    const h = deriveMailboxHealth(
      makeRecord({ tokenExpiry: null }) as never,
      NOW,
    );
    expect(h.status).toBe("healthy");
    expect(h.actionRequired).toBe(false);
  });

  it("returns reconnect_required for RECONNECT_REQUIRED status", () => {
    const h = deriveMailboxHealth(
      makeRecord({ status: "RECONNECT_REQUIRED" }) as never,
      NOW,
    );
    expect(h.status).toBe("reconnect_required");
    expect(h.actionRequired).toBe(true);
  });

  it("returns degraded for DEGRADED status", () => {
    const h = deriveMailboxHealth(
      makeRecord({ status: "DEGRADED" }) as never,
      NOW,
    );
    expect(h.status).toBe("degraded");
    expect(h.actionRequired).toBe(true);
  });

  it("returns disconnected for DISCONNECTED status", () => {
    const h = deriveMailboxHealth(
      makeRecord({ status: "DISCONNECTED" }) as never,
      NOW,
    );
    expect(h.status).toBe("disconnected");
    expect(h.actionRequired).toBe(false);
  });

  it("actionRequired is false for healthy", () => {
    expect(deriveMailboxHealth(makeRecord() as never, NOW).actionRequired).toBe(false);
  });

  it("actionRequired is false for disconnected", () => {
    expect(
      deriveMailboxHealth(makeRecord({ status: "DISCONNECTED" }) as never, NOW)
        .actionRequired,
    ).toBe(false);
  });

  it("actionRequired is true for expiring_soon", () => {
    expect(
      deriveMailboxHealth(makeRecord({ tokenExpiry: NEAR_EXPIRY }) as never, NOW)
        .actionRequired,
    ).toBe(true);
  });

  it("tokenExpiresAt is null for disconnected", () => {
    expect(
      deriveMailboxHealth(makeRecord({ status: "DISCONNECTED" }) as never, NOW)
        .tokenExpiresAt,
    ).toBeNull();
  });

  it("uses the injected now parameter — does not rely on Date.now()", () => {
    // Token expires 12h from NOW. If we inject NOW + 20h as "now", it's already past.
    const futureNow = NOW + 20 * 60 * 60 * 1000;
    const h = deriveMailboxHealth(
      makeRecord({ tokenExpiry: NEAR_EXPIRY }) as never,
      futureNow,
    );
    // NEAR_EXPIRY is in the past relative to futureNow, so not expiring_soon
    expect(h.status).toBe("healthy");
  });

  it("does not return expiring_soon when token is already expired", () => {
    const h = deriveMailboxHealth(
      makeRecord({ tokenExpiry: PAST }) as never,
      NOW,
    );
    // Past expiry: getTime() > now is false, so not expiring_soon
    expect(h.status).toBe("healthy");
  });

  it("EXPIRING_SOON_THRESHOLD_MS is exactly 24 * 60 * 60 * 1000", () => {
    expect(EXPIRING_SOON_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
  });
});

// ─── toMailboxConnectionListItem ─────────────────────────────────────────────

describe("toMailboxConnectionListItem", () => {
  it("does not contain tokenRef", () => {
    expect(toMailboxConnectionListItem(makeRecord() as never, NOW)).not.toHaveProperty(
      "tokenRef",
    );
  });

  it("does not contain tokenExpiry (raw Date)", () => {
    expect(toMailboxConnectionListItem(makeRecord() as never, NOW)).not.toHaveProperty(
      "tokenExpiry",
    );
  });

  it("does not contain watchMetadata", () => {
    expect(toMailboxConnectionListItem(makeRecord() as never, NOW)).not.toHaveProperty(
      "watchMetadata",
    );
  });

  it("does not contain disabledAt", () => {
    expect(toMailboxConnectionListItem(makeRecord() as never, NOW)).not.toHaveProperty(
      "disabledAt",
    );
  });

  it("health field is present and is a valid MailboxConnectionHealth object", () => {
    const item = toMailboxConnectionListItem(makeRecord() as never, NOW);
    expect(item.health).toBeDefined();
    expect(typeof item.health.status).toBe("string");
    expect(typeof item.health.actionRequired).toBe("boolean");
    expect(typeof item.health.summary).toBe("string");
  });

  it("lastSyncAt is an ISO string when present", () => {
    const item = toMailboxConnectionListItem(makeRecord() as never, NOW);
    expect(item.lastSyncAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("lastSyncAt is null when absent", () => {
    const item = toMailboxConnectionListItem(
      makeRecord({ lastSyncAt: null }) as never,
      NOW,
    );
    expect(item.lastSyncAt).toBeNull();
  });

  it("createdAt is an ISO string", () => {
    const item = toMailboxConnectionListItem(makeRecord() as never, NOW);
    expect(item.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("updatedAt is an ISO string", () => {
    const item = toMailboxConnectionListItem(makeRecord() as never, NOW);
    expect(item.updatedAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("maps id, orgId, emailAddress, displayName, provider, status, connectedBy correctly", () => {
    const item = toMailboxConnectionListItem(makeRecord() as never, NOW);
    expect(item.id).toBe(CONN_ID);
    expect(item.orgId).toBe(ORG_A);
    expect(item.emailAddress).toBe("ops@example.com");
    expect(item.displayName).toBe("Ops Inbox");
    expect(item.provider).toBe("GMAIL");
    expect(item.status).toBe("ACTIVE");
    expect(item.connectedBy).toBe(ACTOR);
  });
});

// ─── GET /api/mailbox/connections ────────────────────────────────────────────

describe("GET /api/mailbox/connections", () => {
  it("returns 200 with connections array for admin", async () => {
    setupAdminAuth();
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeDbRow()]);

    const res = await listConnections();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.connections)).toBe(true);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].id).toBe(CONN_ID);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await listConnections();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    } as never);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await listConnections();
    expect(res.status).toBe(403);
  });

  it("returns empty array when no connections exist", async () => {
    setupAdminAuth();
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    const res = await listConnections();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connections).toHaveLength(0);
  });
});

// ─── GET /api/mailbox/connections/[id] ───────────────────────────────────────

describe("GET /api/mailbox/connections/[id]", () => {
  function makeRequest() {
    return new NextRequest("http://localhost/api/mailbox/connections/" + CONN_ID);
  }

  it("returns 200 with single connection for admin", async () => {
    setupAdminAuth();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());

    const res = await getConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connection.id).toBe(CONN_ID);
  });

  it("returns 404 when connection not found", async () => {
    setupAdminAuth();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    const res = await getConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: "nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Connection not found");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await getConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    } as never);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await getConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /api/mailbox/connections/[id]/status ───────────────────────────────

describe("PATCH /api/mailbox/connections/[id]/status", () => {
  function makeRequest(body: unknown) {
    return new NextRequest(
      "http://localhost/api/mailbox/connections/" + CONN_ID + "/status",
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      },
    );
  }

  it("returns 200 with updated connection for valid DEGRADED status", async () => {
    setupAdminAuth();
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ status: "DEGRADED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const res = await patchStatus(makeRequest({ status: "DEGRADED" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connection).toBeDefined();
  });

  it("returns 200 with updated connection for valid DISCONNECTED status", async () => {
    setupAdminAuth();
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ status: "DISCONNECTED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const res = await patchStatus(makeRequest({ status: "DISCONNECTED" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid status value 'ACTIVE'", async () => {
    setupAdminAuth();

    const res = await patchStatus(makeRequest({ status: "ACTIVE" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid status value");
  });

  it("returns 400 for invalid status value 'RECONNECT_REQUIRED'", async () => {
    setupAdminAuth();

    const res = await patchStatus(makeRequest({ status: "RECONNECT_REQUIRED" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for arbitrary invalid status value", async () => {
    setupAdminAuth();

    const res = await patchStatus(makeRequest({ status: "foo" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when request body is null", async () => {
    setupAdminAuth();

    const req = new NextRequest(
      "http://localhost/api/mailbox/connections/" + CONN_ID + "/status",
      {
        method: "PATCH",
        body: "null",
        headers: { "content-type": "application/json" },
      },
    );

    const res = await patchStatus(req, {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid status value");
  });

  it("returns 404 when connection not found", async () => {
    setupAdminAuth();
    mockDb.$transaction.mockImplementation(async () => {
      throw new Error("MailboxConnection nonexistent not found for org org-aaa");
    });

    const res = await patchStatus(makeRequest({ status: "DEGRADED" }), {
      params: Promise.resolve({ connectionId: "nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Connection not found");
  });

  it("returns 404 when updateMailboxConnectionStatus throws error containing 'not found'", async () => {
    setupAdminAuth();
    mockDb.$transaction.mockImplementation(async () => {
      throw new Error("MailboxConnection xyz not found for org org-aaa");
    });

    const res = await patchStatus(makeRequest({ status: "DEGRADED" }), {
      params: Promise.resolve({ connectionId: "xyz" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/mailbox/connections/[id] ────────────────────────────────────

describe("DELETE /api/mailbox/connections/[id]", () => {
  function makeRequest() {
    return new NextRequest("http://localhost/api/mailbox/connections/" + CONN_ID, {
      method: "DELETE",
    });
  }

  it("returns 200 with disabled connection when admin calls DELETE on valid connectionId", async () => {
    setupAdminAuth();
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ status: "DISCONNECTED", disabledAt: new Date() }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const res = await deleteConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connection).toBeDefined();
  });

  it("returns 404 when disableMailboxConnection throws error containing 'not found'", async () => {
    setupAdminAuth();
    mockDb.$transaction.mockImplementation(async () => {
      throw new Error("MailboxConnection nonexistent not found for org org-aaa");
    });

    const res = await deleteConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: "nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Connection not found");
  });

  it("returns 401 when admin auth check fails", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await deleteConnection(makeRequest(), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(401);
  });
});
