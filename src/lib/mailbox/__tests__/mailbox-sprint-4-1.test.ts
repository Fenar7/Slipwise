/**
 * Mailbox Phase 4 Sprint 4.1 — Thread list from real data tests.
 *
 * Covers:
 * - listMailboxThreads service (org-scoped, permission-aware, filtering, pagination)
 * - getMailboxThread service (access verification)
 * - GET /api/mailbox/threads route (auth, query params, response shape)
 * - Thread read shape mapping (assigneeId inclusion)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxMessage: {
      findMany: vi.fn(),
    },
    mailboxThread: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxConnection: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockDb = db as unknown as {
  mailboxMessage: {
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxThread: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 59 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

import { listMailboxThreads, getMailboxThread } from "@/lib/mailbox/thread-service";
import { toMailboxThreadReadShape } from "@/lib/mailbox/read-shapes";

const ORG_A = "org-aaa";
const USER_A = "00000000-0000-0000-0000-000000000001";
const CONN_1 = "conn-001";
const CONN_2 = "conn-002";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.mailboxMessage.findMany.mockResolvedValue([]);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConnectionRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_1,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-1",
    emailAddress: "billing@example.com",
    displayName: "Billing",
    status: "ACTIVE" as const,
    visibilityPolicy: "org_shared",
    tokenRef: "token-1",
    tokenExpiry: null,
    watchMetadata: null,
    watchExpiresAt: null,
    watchRenewedAt: null,
    lastSyncAt: new Date(),
    lastSyncError: null,
    lastSyncErrorCategory: null,
    disabledAt: null,
    connectedBy: USER_A,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncLeaseToken: null,
    syncLeaseExpiresAt: null,
    ...overrides,
  };
}

function makeThreadRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "thread-1",
    orgId: ORG_A,
    mailboxConnectionId: CONN_1,
    providerThreadId: "gmail-thread-1",
    subject: "Invoice #123",
    participantsSummary: [{ email: "client@example.com", displayName: "Client" }],
    lastMessageAt: new Date("2026-05-10T10:00:00Z"),
    unreadCount: 1,
    status: "OPEN" as const,
    assigneeId: USER_A,
    isFlagged: false,
    primaryLinkSummary: null,
    previewSnippet: "Please find the attached invoice",
    attachmentCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Thread list service ──────────────────────────────────────────────────────

describe("Sprint 4.1 — listMailboxThreads", () => {
  it("returns empty when no accessible connections exist", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
    });

    expect(result.threads).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.totalCount).toBe(0);
    expect(mockDb.mailboxThread.findMany).not.toHaveBeenCalled();
  });

  it("queries threads for all accessible connections (all-inboxes)", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: CONN_1 }),
      makeConnectionRecord({ id: CONN_2, displayName: "Support" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ id: "t1", mailboxConnectionId: CONN_1 }),
      makeThreadRecord({ id: "t2", mailboxConnectionId: CONN_2 }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(2);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
    });

    expect(result.threads).toHaveLength(2);
    expect(result.totalCount).toBe(2);
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: ORG_A,
          mailboxConnectionId: { in: [CONN_1, CONN_2] },
        }),
      }),
    );
  });

  it("filters by connectionId when specified", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: CONN_1 }),
      makeConnectionRecord({ id: CONN_2 }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ id: "t1", mailboxConnectionId: CONN_1 }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      connectionId: CONN_1,
    });

    expect(result.threads).toHaveLength(1);
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mailboxConnectionId: { in: [CONN_1] },
        }),
      }),
    );
  });

  it("returns empty when connectionId is not accessible", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: CONN_1 }),
    ]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      connectionId: CONN_2, // Not in accessible list
    });

    expect(result.threads).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(mockDb.mailboxThread.findMany).not.toHaveBeenCalled();
  });

  it("filters by status", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ status: "PENDING" }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      status: "PENDING",
    });

    expect(result.threads[0]?.status).toBe("PENDING");
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });

  it("filters by multiple statuses", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      status: ["OPEN", "PENDING"],
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["OPEN", "PENDING"] },
        }),
      }),
    );
  });

  it("applies SENT folder semantics via outbound message relation", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      connectionId: CONN_1,
      folder: "SENT",
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mailboxConnectionId: { in: [CONN_1] },
          messages: { some: { direction: "outbound" } },
        }),
      }),
    );
  });

  it("applies SPAM folder semantics from provider metadata thread ids", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxMessage.findMany.mockResolvedValue([
      { threadId: "thread-spam", providerMetadata: { labelIds: ["SPAM"] } },
      { threadId: "thread-ham", providerMetadata: { labelIds: ["INBOX"] } },
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord({ id: "thread-spam" })]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      connectionId: CONN_1,
      folder: "SPAM",
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["thread-spam"] },
        }),
      }),
    );
  });

  it("filters by unreadOnly", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ unreadCount: 2 }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      unreadOnly: true,
    });

    expect(result.threads[0]?.unreadCount).toBe(2);
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unreadCount: { gt: 0 },
        }),
      }),
    );
  });

  it("filters by isFlagged", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ isFlagged: true }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      isFlagged: true,
    });

    expect(result.threads[0]?.isFlagged).toBe(true);
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isFlagged: true }),
      }),
    );
  });

  it("filters by assignee me", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ assigneeId: USER_A }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      assigneeFilter: "me",
    });

    expect(result.threads[0]?.assigneeId).toBe(USER_A);
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: USER_A }),
      }),
    );
  });

  it("filters by assignee none", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({ assigneeId: null }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      assigneeFilter: "none",
    });

    expect(result.threads[0]?.assigneeId).toBeNull();
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: null }),
      }),
    );
  });

  it("sorts unread-first then by recency", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { unreadCount: "desc" },
          { lastMessageAt: "desc" },
          { id: "desc" },
        ],
      }),
    );
  });

  it("paginates with cursor", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    const threads = Array.from({ length: 51 }, (_, i) =>
      makeThreadRecord({
        id: `thread-${i}`,
        lastMessageAt: new Date(Date.now() - i * 60000),
      }),
    );
    mockDb.mailboxThread.findMany.mockResolvedValue(threads);
    mockDb.mailboxThread.count.mockResolvedValue(100);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      limit: 50,
    });

    expect(result.threads).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
    expect(result.totalCount).toBe(100);
  });

  it("encodes unread state in the cursor boundary so unread-first pagination cannot skip rows", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const cursor = Buffer.from(
      JSON.stringify({
        kind: "local",
        unreadCount: 2,
        lastMessageAt: "2026-05-10T10:00:00.000Z",
        id: "thread-123",
      }),
      "utf-8",
    ).toString("base64");

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      cursor,
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ orgId: ORG_A }),
            expect.objectContaining({
              OR: [
                { unreadCount: { lt: 2 } },
                {
                  unreadCount: 2,
                  OR: [
                    { lastMessageAt: { lt: new Date("2026-05-10T10:00:00.000Z") } },
                    {
                      lastMessageAt: new Date("2026-05-10T10:00:00.000Z"),
                      id: { lt: "thread-123" },
                    },
                  ],
                },
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("returns nextCursor null when no more pages", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord(),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
    });

    expect(result.nextCursor).toBeNull();
  });

  it("admins see all connections as accessible", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: CONN_1, visibilityPolicy: "admin_only" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord(),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "admin",
    });

    expect(result.threads).toHaveLength(1);
  });
});

// ─── getMailboxThread ─────────────────────────────────────────────────────────

describe("Sprint 4.1 — getMailboxThread", () => {
  it("returns thread when accessible", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());

    const result = await getMailboxThread(ORG_A, USER_A, "member", "thread-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("thread-1");
  });

  it("returns null when thread not found", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const result = await getMailboxThread(ORG_A, USER_A, "member", "missing");

    expect(result).toBeNull();
  });

  it("returns null when connection is not accessible", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    const result = await getMailboxThread(ORG_A, USER_A, "member", "thread-1");

    expect(result).toBeNull();
    expect(mockDb.mailboxThread.findFirst).not.toHaveBeenCalled();
  });
});

// ─── Thread read shape ────────────────────────────────────────────────────────

describe("Sprint 4.1 — toMailboxThreadReadShape includes assigneeId", () => {
  it("maps assigneeId to read shape", () => {
    const record = makeThreadRecord({ assigneeId: USER_A });
    const shape = toMailboxThreadReadShape(record);
    expect(shape.assigneeId).toBe(USER_A);
  });

  it("maps null assigneeId to read shape", () => {
    const record = makeThreadRecord({ assigneeId: null });
    const shape = toMailboxThreadReadShape(record);
    expect(shape.assigneeId).toBeNull();
  });
});

// ─── Route layer ──────────────────────────────────────────────────────────────

describe("Sprint 4.1 — GET /api/mailbox/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    } as never);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns threads for authenticated member", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.threads).toHaveLength(1);
    expect(body.totalCount).toBe(1);
    expect(body.nextCursor).toBeNull();
  });

  it("parses query params correctly", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?connectionId=${CONN_1}&folder=SENT&status=OPEN&unreadOnly=true&isFlagged=true&assignee=me&limit=25`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: ORG_A,
          mailboxConnectionId: { in: [CONN_1] },
          messages: { some: { direction: "outbound" } },
          status: "OPEN",
          unreadCount: { gt: 0 },
          isFlagged: true,
          assigneeId: USER_A,
        }),
        take: 26, // limit + 1
      }),
    );
  });

  it("parses comma-separated statuses", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?status=OPEN,PENDING`,
    );
    await GET(req);

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["OPEN", "PENDING"] },
        }),
      }),
    );
  });

  it("returns 400 for invalid assignee filter", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?assignee=invalid`,
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid assignee");
  });

  it("returns 400 for invalid folder", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads?folder=INVALID_FOLDER");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("ignores invalid status values", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?status=INVALID`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Status filter should not be present in the query
    const callArgs = mockDb.mailboxThread.findMany.mock.calls[0]?.[0];
    expect(callArgs?.where?.status).toBeUndefined();
  });

  it("caps limit at 100", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?limit=500`,
    );
    await GET(req);

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101, // 100 + 1
      }),
    );
  });
});

// ─── UI helpers ───────────────────────────────────────────────────────────────

describe("Sprint 4.1 — thread-data-helpers", () => {
  it("mapThreadToRowData derives correct fields", async () => {
    const { mapThreadToRowData } = await import("@/app/app/mailbox/thread-data-helpers");
    const connectionMap = new Map([
      ["conn-1", { displayName: "Billing", color: "#16294D" }],
    ]);

    const thread = {
      id: "t1",
      mailboxConnectionId: "conn-1",
      providerThreadId: "gmail-1",
      subject: "Test",
      participants: [{ email: "a@example.com", displayName: "Alice" }],
      lastMessageAt: new Date().toISOString(),
      unreadCount: 1,
      status: "OPEN" as const,
      assigneeId: null,
      isFlagged: false,
      previewSnippet: "Hello",
      attachmentCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapThreadToRowData(thread, {
      connectionMap,
      currentUserId: "",
    });

    expect(row.id).toBe("t1");
    expect(row.subject).toBe("Test");
    expect(row.from).toBe("Alice");
    expect(row.isUnread).toBe(true);
    expect(row.hasAttachment).toBe(true);
    expect(row.mailboxLabel).toBe("Billing");
    expect(row.status).toBe("open");
  });

  it("mapThreadToRowData shows 'You' when assignee matches current user", async () => {
    const { mapThreadToRowData } = await import("@/app/app/mailbox/thread-data-helpers");
    const connectionMap = new Map([["conn-1", { displayName: "Billing", color: "#16294D" }]]);

    const thread = {
      id: "t1",
      mailboxConnectionId: "conn-1",
      providerThreadId: "gmail-1",
      subject: "Test",
      participants: [{ email: "a@example.com", displayName: "Alice" }],
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      status: "OPEN" as const,
      assigneeId: USER_A,
      isFlagged: false,
      previewSnippet: "Hello",
      attachmentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapThreadToRowData(thread, {
      connectionMap,
      currentUserId: USER_A,
    });

    expect(row.assignee).toBe("You");
  });
});
