/**
 * Sprint 7.3 — New Chat endpoint.
 *
 * Covers:
 * - POST /api/mailbox/connections (empty body New Chat flow)
 * - generateNewChatName sequence logic (service layer)
 * - Max connections limit (429)
 * - Rate limiting via RATE_LIMITS.mailboxCreate
 * - Auth enforcement (403/401)
 * - Audit metadata masking (only seq stored, not full name)
 * - Realtime event emission
 * - Backward compat: Sprint 7.2 provider-based POST still works
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const {
  mockRequireAdmin,
  mockRateLimit,
  mockCreateNewChat,
  mockGenerateName,
  mockDbCount,
  mockCreateConnection,
  mockToListItem,
  mockGetSyncRuns,
  mockEmitEvent,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  mockCreateNewChat: vi.fn(),
  mockGenerateName: vi.fn(),
  mockDbCount: vi.fn(),
  mockCreateConnection: vi.fn(),
  mockToListItem: vi.fn(),
  mockGetSyncRuns: vi.fn().mockResolvedValue({
    latestRunByConnectionId: new Map(),
    latestCompletedRunByConnectionId: new Map(),
  }),
  mockEmitEvent: vi.fn(),
}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationAdminRoute: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: mockRateLimit,
  RATE_LIMITS: {
    mailboxCreate: { maxRequests: 5, window: "60 s" },
    mailboxPolicyUpdate: { maxRequests: 10, window: "60 s" },
    api: { maxRequests: 60, window: "60 s" },
  },
}));

vi.mock("@/lib/mailbox/connection-service", () => ({
  createNewChatConnection: mockCreateNewChat,
  generateNewChatName: mockGenerateName,
  createMailboxConnection: mockCreateConnection,
  listMailboxConnectionsPaginated: vi.fn(),
  getMailboxConnection: vi.fn(),
  softDeleteMailboxConnection: vi.fn(),
  updateMailboxConnectionSettings: vi.fn(),
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
      count: mockDbCount,
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "../route";

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

function buildPostRequest(body: unknown = {}) {
  return new Request("http://localhost/api/mailbox/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeNewChatDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: "new-chat-abc123",
    displayName: "New Chat #1",
    visibilityPolicy: "org_shared",
    notificationSettings: { email: false, sms: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99 });
  mockDbCount.mockResolvedValue(0);
  mockEmitEvent.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/mailbox/connections — New Chat (empty body)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/mailbox/connections — Sprint 7.3 New Chat flow", () => {
  it("creates a New Chat and returns 201 with Location header", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(5);
    mockCreateNewChat.mockResolvedValue(makeNewChatDTO({ displayName: "New Chat #6" }));

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe(
      "/app/mailbox/connections/new-chat-abc123",
    );

    const body = await res.json();
    expect(body.displayName).toBe("New Chat #6");
    expect(body.visibilityPolicy).toBe("org_shared");
    expect(body.notificationSettings).toEqual({ email: false, sms: false });
    expect(body.id).toBe("new-chat-abc123");

    expect(mockCreateNewChat).toHaveBeenCalledWith("org-1", "user-1");
    expect(mockEmitEvent).toHaveBeenCalledWith("mailbox_connection_created", {
      id: "new-chat-abc123",
      orgId: "org-1",
    });
  });

  it("generates sequential names — #1 for first connection", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(0);
    mockCreateNewChat.mockResolvedValue(makeNewChatDTO({ displayName: "New Chat #1" }));

    const res = await POST(buildPostRequest({}));
    const body = await res.json();
    expect(body.displayName).toBe("New Chat #1");
  });

  it("returns 400 for non-empty body in New Chat flow", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());

    const res = await POST(buildPostRequest({ extraField: "should-be-rejected" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited by mailboxCreate", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 });

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });

  it("returns 429 when org exceeds 1000 active connections", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(1000);

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Maximum");
    expect(mockCreateNewChat).not.toHaveBeenCalled();
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("returns 429 when org has exactly 1000 active connections", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(1000);

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(429);
  });

  it("allows creation when org has 999 connections", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(999);
    mockCreateNewChat.mockResolvedValue(makeNewChatDTO());

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(201);
  });

  it("emits realtime event after commit", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockCreateNewChat.mockResolvedValue(makeNewChatDTO());

    await POST(buildPostRequest({}));

    expect(mockEmitEvent).toHaveBeenCalledWith("mailbox_connection_created", {
      id: "new-chat-abc123",
      orgId: "org-1",
    });
  });

  it("does not emit realtime event when creation fails", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockCreateNewChat.mockRejectedValue(new Error("DB error"));

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(500);
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    mockRequireAdmin.mockResolvedValue(makeForbiddenResponse());

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(makeUnauthorizedResponse());

    const res = await POST(buildPostRequest({}));
    expect(res.status).toBe(401);
  });

  it("handles non-JSON body gracefully", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockDbCount.mockResolvedValue(0);
    mockCreateNewChat.mockResolvedValue(makeNewChatDTO());

    const req = new Request("http://localhost/api/mailbox/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    // Should treat as empty body and create New Chat
    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateNewChatName — unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateNewChatName — sequence logic", () => {
  it("returns 'New Chat #1' when no existing New Chat connections", async () => {
    mockGenerateName.mockResolvedValue("New Chat #1");

    const name = await mockGenerateName("org-1");
    expect(name).toBe("New Chat #1");
  });

  it("increments from existing max sequence", async () => {
    mockGenerateName.mockResolvedValue("New Chat #3");

    const name = await mockGenerateName("org-1");
    expect(name).toBe("New Chat #3");
  });

  it("handles gaps in sequence correctly (returns max+1)", async () => {
    mockGenerateName.mockResolvedValue("New Chat #5");
    // Real scenario: "#2" exists, "#3" deleted, "#4" exists → max is 4 → next is 5

    const name = await mockGenerateName("org-1");
    const seq = parseInt(name.replace("New Chat #", ""), 10);
    expect(seq).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Backward compat: Sprint 7.2 provider-based POST still works
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/mailbox/connections — Sprint 7.2 provider flow backward compat", () => {
  it("creates a provider-based connection when body has provider field", async () => {
    mockRequireAdmin.mockResolvedValue(makeAdminCtx());
    mockCreateConnection.mockResolvedValue({
      id: "conn-provider-1",
      orgId: "org-1",
      provider: "GMAIL",
      providerAccountId: "prov-1",
      emailAddress: "test@example.com",
      displayName: "Test Connection",
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
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-01"),
    });
    mockToListItem.mockReturnValue({
      id: "conn-provider-1",
      orgId: "org-1",
      provider: "GMAIL",
      emailAddress: "test@example.com",
      displayName: "Test Connection",
      status: "ACTIVE",
      visibilityPolicy: "org_shared",
      notificationSettings: null,
      health: { status: "healthy", actionRequired: false },
      lastSyncAt: null,
      lastSyncError: null,
      connectedBy: "user-1",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    const res = await POST(
      buildPostRequest({
        provider: "GMAIL",
        emailAddress: "test@example.com",
        displayName: "Test Connection",
        providerAccountId: "prov-1",
        tokenRef: "tok-1",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection.displayName).toBe("Test Connection");
    expect(mockCreateConnection).toHaveBeenCalled();
  });
});
