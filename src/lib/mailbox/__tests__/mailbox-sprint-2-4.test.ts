/**
 * Mailbox Phase 2 Sprint 2.4 — unit tests
 *
 * Covers:
 * - resolveMailboxAccessLevel: all rule branches
 * - canAccessMailbox: predicate helper
 * - getMailboxAccessResolution: service-level resolution with DB load
 * - listMailboxConnectionsForMember: segmented listing by access level
 * - setMailboxVisibilityPolicy: admin governance mutation
 * - GET /api/mailbox/connections/visible: member-accessible listing
 * - PATCH /api/mailbox/connections/[id]/policy: admin policy update
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

import { db } from "@/lib/db";
import { getOrgContext, hasRole } from "@/lib/auth";

import {
  resolveMailboxAccessLevel,
  canAccessMailbox,
} from "@/lib/mailbox/domain-types";
import type { MailboxAccessResolution } from "@/lib/mailbox/domain-types";

import {
  getMailboxAccessResolution,
  listMailboxConnectionsForMember,
  setMailboxVisibilityPolicy,
} from "@/lib/mailbox/visibility-service";

import { GET as getVisibleConnections } from "@/app/api/mailbox/connections/visible/route";
import { PATCH as patchPolicy } from "@/app/api/mailbox/connections/[connectionId]/policy/route";
import { NextRequest } from "next/server";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ACTOR = "00000000-0000-0000-0000-000000000001";
const CONN_ID = "conn-001";

const NOW = new Date("2026-05-09T12:00:00.000Z").getTime();
const FAR_FUTURE = new Date("2026-06-01T00:00:00.000Z");

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_ID,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE" as const,
    visibilityPolicy: "org_shared",
    tokenRef: "encrypted-ref-abc",
    tokenExpiry: FAR_FUTURE,
    watchMetadata: { historyId: "12345" },
    lastSyncAt: new Date("2026-05-01T10:00:00Z"),
    lastSyncError: null,
    disabledAt: null,
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

function setupMemberAuth() {
  vi.mocked(getOrgContext).mockResolvedValue({
    orgId: ORG_A,
    userId: ACTOR,
    role: "member",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  } as never);
  vi.mocked(hasRole).mockReturnValue(false);
}

function setupTransaction() {
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── resolveMailboxAccessLevel ──────────────────────────────────────────────

describe("resolveMailboxAccessLevel", () => {
  it("returns full + reason admin_override for role admin on active org_shared connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "admin",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "org_shared",
    });
    expect(res.accessLevel).toBe("full");
    expect(res.reason).toBe("admin_override");
  });

  it("returns full + reason admin_override for role owner on restricted connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "owner",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "restricted",
    });
    expect(res.accessLevel).toBe("full");
    expect(res.reason).toBe("admin_override");
  });

  it("returns full + reason admin_override for role admin on admin_only connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "admin",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "admin_only",
    });
    expect(res.accessLevel).toBe("full");
    expect(res.reason).toBe("admin_override");
  });

  it("returns none + reason mailbox_disabled when connection status is DISCONNECTED (any role including admin)", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "admin",
      connectionStatus: "DISCONNECTED",
      visibilityPolicy: "org_shared",
    });
    expect(res.accessLevel).toBe("none");
    expect(res.reason).toBe("mailbox_disabled");
  });

  it("returns read_only + reason org_shared_read for role member on org_shared active connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "org_shared",
    });
    expect(res.accessLevel).toBe("read_only");
    expect(res.reason).toBe("org_shared_read");
  });

  it("returns none + reason policy_restricted for role member on restricted connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "restricted",
    });
    expect(res.accessLevel).toBe("none");
    expect(res.reason).toBe("policy_restricted");
  });

  it("returns none + reason policy_admin_only for role member on admin_only connection", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "admin_only",
    });
    expect(res.accessLevel).toBe("none");
    expect(res.reason).toBe("policy_admin_only");
  });

  it("returns none + reason policy_admin_only for role member on admin_only even when status is ACTIVE", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "admin_only",
    });
    expect(res.accessLevel).toBe("none");
    expect(res.reason).toBe("policy_admin_only");
  });

  it("canAccessMailbox returns true for full resolution", () => {
    const res: MailboxAccessResolution = {
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "admin",
      visibilityPolicy: "org_shared",
      accessLevel: "full",
      reason: "admin_override",
    };
    expect(canAccessMailbox(res)).toBe(true);
  });

  it("canAccessMailbox returns true for read_only resolution", () => {
    const res: MailboxAccessResolution = {
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      visibilityPolicy: "org_shared",
      accessLevel: "read_only",
      reason: "org_shared_read",
    };
    expect(canAccessMailbox(res)).toBe(true);
  });

  it("canAccessMailbox returns false for none resolution", () => {
    const res: MailboxAccessResolution = {
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      visibilityPolicy: "admin_only",
      accessLevel: "none",
      reason: "policy_admin_only",
    };
    expect(canAccessMailbox(res)).toBe(false);
  });

  it("resolution includes correct connectionId, orgId, userId, role, visibilityPolicy fields", () => {
    const res = resolveMailboxAccessLevel({
      connectionId: CONN_ID,
      orgId: ORG_A,
      userId: ACTOR,
      role: "member",
      connectionStatus: "ACTIVE",
      visibilityPolicy: "org_shared",
    });
    expect(res.connectionId).toBe(CONN_ID);
    expect(res.orgId).toBe(ORG_A);
    expect(res.userId).toBe(ACTOR);
    expect(res.role).toBe("member");
    expect(res.visibilityPolicy).toBe("org_shared");
  });
});

// ─── listMailboxConnectionsForMember ───────────────────────────────────────────

describe("listMailboxConnectionsForMember", () => {
  it("admin sees all active connections in accessible array, restricted is empty", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeDbRow()]);

    const result = await listMailboxConnectionsForMember(ORG_A, ACTOR, "admin");

    expect(result.accessible).toHaveLength(1);
    expect(result.restricted).toHaveLength(0);
    expect(result.accessible[0].id).toBe(CONN_ID);
  });

  it("member with org_shared policy sees connection in accessible with read_only access", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeDbRow({ visibilityPolicy: "org_shared" }),
    ]);

    const result = await listMailboxConnectionsForMember(ORG_A, ACTOR, "member");

    expect(result.accessible).toHaveLength(1);
    expect(result.restricted).toHaveLength(0);
  });

  it("member with admin_only policy sees connection in restricted with no_permission reason", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeDbRow({ visibilityPolicy: "admin_only" }),
    ]);

    const result = await listMailboxConnectionsForMember(ORG_A, ACTOR, "member");

    expect(result.accessible).toHaveLength(0);
    expect(result.restricted).toHaveLength(1);
    expect(result.restricted[0].restrictionReason).toBe("no_permission");
  });

  it("disconnected connection appears in restricted with mailbox_disabled reason for all roles including admin", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeDbRow({ status: "DISCONNECTED", disabledAt: new Date() }),
    ]);

    const result = await listMailboxConnectionsForMember(ORG_A, ACTOR, "admin");

    expect(result.accessible).toHaveLength(0);
    expect(result.restricted).toHaveLength(1);
    expect(result.restricted[0].restrictionReason).toBe("mailbox_disabled");
  });
});

// ─── setMailboxVisibilityPolicy ────────────────────────────────────────────────

describe("setMailboxVisibilityPolicy", () => {
  it("updates policy and returns MailboxConnectionListItem with updated visibilityPolicy", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ visibilityPolicy: "restricted" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const result = await setMailboxVisibilityPolicy(
      ORG_A,
      CONN_ID,
      "restricted",
      ACTOR,
    );

    expect(result.visibilityPolicy).toBe("restricted");
  });

  it("throws (propagates) when connection not found for org", async () => {
    mockDb.$transaction.mockImplementation(async () => {
      throw new Error("MailboxConnection nonexistent not found for org org-aaa");
    });

    await expect(
      setMailboxVisibilityPolicy(ORG_A, "nonexistent", "restricted", ACTOR),
    ).rejects.toThrow("not found");
  });

  it("emits CONNECTION_POLICY_UPDATED audit event inside transaction", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ visibilityPolicy: "admin_only" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await setMailboxVisibilityPolicy(ORG_A, CONN_ID, "admin_only", ACTOR);

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONNECTION_POLICY_UPDATED",
          orgId: ORG_A,
          actorId: ACTOR,
        }),
      }),
    );
  });
});

// ─── GET /api/mailbox/connections/visible ────────────────────────────────────

describe("GET /api/mailbox/connections/visible", () => {
  it("returns 200 with { accessible, restricted } for authenticated member", async () => {
    setupMemberAuth();
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeDbRow({ visibilityPolicy: "org_shared" }),
    ]);

    const res = await getVisibleConnections();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.accessible)).toBe(true);
    expect(Array.isArray(body.restricted)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await getVisibleConnections();
    expect(res.status).toBe(401);
  });

  it("admin caller gets all connections in accessible", async () => {
    setupAdminAuth();
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeDbRow(),
      makeDbRow({ id: "conn-002" }),
    ]);

    const res = await getVisibleConnections();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accessible).toHaveLength(2);
    expect(body.restricted).toHaveLength(0);
  });

  it("returns 200 with empty arrays when org has no connections", async () => {
    setupMemberAuth();
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    const res = await getVisibleConnections();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accessible).toHaveLength(0);
    expect(body.restricted).toHaveLength(0);
  });
});

// ─── PATCH /api/mailbox/connections/[id]/policy ───────────────────────────────

describe("PATCH /api/mailbox/connections/[id]/policy", () => {
  function makeRequest(body: unknown) {
    return new NextRequest(
      "http://localhost/api/mailbox/connections/" + CONN_ID + "/policy",
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      },
    );
  }

  it("returns 200 with updated connection for valid org_shared policy", async () => {
    setupAdminAuth();
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ visibilityPolicy: "org_shared" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const res = await patchPolicy(makeRequest({ policy: "org_shared" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connection).toBeDefined();
  });

  it("returns 200 with updated connection for valid admin_only policy", async () => {
    setupAdminAuth();
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeDbRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeDbRow({ visibilityPolicy: "admin_only" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const res = await patchPolicy(makeRequest({ policy: "admin_only" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid policy value (e.g., 'public')", async () => {
    setupAdminAuth();

    const res = await patchPolicy(makeRequest({ policy: "public" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid policy value");
  });

  it("returns 400 when policy field is missing from body", async () => {
    setupAdminAuth();

    const res = await patchPolicy(makeRequest({}), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid policy value");
  });

  it("returns 404 when setMailboxVisibilityPolicy throws 'not found' error", async () => {
    setupAdminAuth();
    mockDb.$transaction.mockImplementation(async () => {
      throw new Error("MailboxConnection nonexistent not found for org org-aaa");
    });

    const res = await patchPolicy(makeRequest({ policy: "restricted" }), {
      params: Promise.resolve({ connectionId: "nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Connection not found");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(null);
    vi.mocked(hasRole).mockReturnValue(false);

    const res = await patchPolicy(makeRequest({ policy: "org_shared" }), {
      params: Promise.resolve({ connectionId: CONN_ID }),
    });
    expect(res.status).toBe(401);
  });
});
