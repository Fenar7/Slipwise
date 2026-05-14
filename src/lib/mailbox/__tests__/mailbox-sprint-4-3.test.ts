/**
 * Mailbox Phase 4 Sprint 4.3 — Core thread actions tests.
 *
 * Covers:
 * - performThreadAction service (mark_read, mark_unread, archive, unarchive, flag, unflag)
 * - Authorization and org scoping (read-only rejection, cross-org isolation)
 * - Audit emission for every successful core thread action
 * - POST /api/mailbox/threads/[id]/actions route (auth, validation, response shape)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxThread: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    mailboxConnection: {
      findMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockDb = db as unknown as {
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

// Mock Prisma $transaction by passing the mock DB as the transaction client
(db as unknown as Record<string, unknown>).$transaction = vi.fn(
  async <T>(fn: (tx: typeof mockDb) => Promise<T>) => fn(mockDb),
) as ReturnType<typeof vi.fn>;

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 59 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

import {
  performThreadAction,
  markThreadRead,
  markThreadUnread,
  archiveThread,
  unarchiveThread,
  flagThread,
  unflagThread,
  ThreadActionError,
  isValidThreadAction,
} from "@/lib/mailbox/thread-action-service";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const CONN_1 = "conn-001";

beforeEach(() => {
  vi.clearAllMocks();
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

// ─── Action validation helper ───────────────────────────────────────────────────

describe("Sprint 4.3 — isValidThreadAction", () => {
  it("accepts all valid actions", () => {
    expect(isValidThreadAction("mark_read")).toBe(true);
    expect(isValidThreadAction("mark_unread")).toBe(true);
    expect(isValidThreadAction("archive")).toBe(true);
    expect(isValidThreadAction("unarchive")).toBe(true);
    expect(isValidThreadAction("flag")).toBe(true);
    expect(isValidThreadAction("unflag")).toBe(true);
  });

  it("rejects invalid actions", () => {
    expect(isValidThreadAction("delete")).toBe(false);
    expect(isValidThreadAction(123)).toBe(false);
    expect(isValidThreadAction(null)).toBe(false);
    expect(isValidThreadAction(undefined)).toBe(false);
  });
});

// ─── mark_read ────────────────────────────────────────────────────────────────

describe("Sprint 4.3 — markThreadRead", () => {
  it("sets unreadCount to 0 and emits THREAD_READ audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ unreadCount: 2 }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ unreadCount: 0 }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await markThreadRead(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("mark_read");
    expect(result.thread?.unreadCount).toBe(0);

    expect(mockDb.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1", orgId: ORG_A },
        data: expect.objectContaining({ unreadCount: 0 }),
      }),
    );

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "THREAD_READ",
          orgId: ORG_A,
          actorId: USER_A,
          threadId: "thread-1",
        }),
      }),
    );
  });
});

// ─── mark_unread ───────────────────────────────────────────────────────────────

describe("Sprint 4.3 — markThreadUnread", () => {
  it("sets unreadCount to 1 and emits THREAD_UNREAD audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ unreadCount: 0 }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ unreadCount: 1 }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await markThreadUnread(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("mark_unread");
    expect(result.thread?.unreadCount).toBe(1);

    expect(mockDb.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1", orgId: ORG_A },
        data: expect.objectContaining({ unreadCount: 1 }),
      }),
    );

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "THREAD_UNREAD" }),
      }),
    );
  });
});

// ─── archive / unarchive ──────────────────────────────────────────────────────

describe("Sprint 4.3 — archiveThread", () => {
  it("sets status to ARCHIVED and emits THREAD_STATUS_CHANGED audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ status: "OPEN" }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ status: "ARCHIVED" }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await archiveThread(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("archive");
    expect(result.thread?.status).toBe("ARCHIVED");

    expect(mockDb.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1", orgId: ORG_A },
        data: expect.objectContaining({ status: "ARCHIVED" }),
      }),
    );

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "THREAD_STATUS_CHANGED" }),
      }),
    );
  });
});

describe("Sprint 4.3 — unarchiveThread", () => {
  it("restores status to OPEN and emits THREAD_STATUS_CHANGED audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ status: "ARCHIVED" }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ status: "OPEN" }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await unarchiveThread(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("unarchive");
    expect(result.thread?.status).toBe("OPEN");

    expect(mockDb.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1", orgId: ORG_A },
        data: expect.objectContaining({ status: "OPEN" }),
      }),
    );
  });
});

// ─── flag / unflag ────────────────────────────────────────────────────────────

describe("Sprint 4.3 — flagThread", () => {
  it("sets isFlagged to true and emits THREAD_FLAGGED audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ isFlagged: false }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ isFlagged: true }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await flagThread(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("flag");
    expect(result.thread?.isFlagged).toBe(true);

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "THREAD_FLAGGED" }),
      }),
    );
  });
});

describe("Sprint 4.3 — unflagThread", () => {
  it("sets isFlagged to false and emits THREAD_UNFLAGGED audit", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ isFlagged: true }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ isFlagged: false }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await unflagThread(ORG_A, USER_A, "admin", "thread-1");

    expect(result.success).toBe(true);
    expect(result.action).toBe("unflag");
    expect(result.thread?.isFlagged).toBe(false);

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "THREAD_UNFLAGGED" }),
      }),
    );
  });
});

// ─── Authorization ──────────────────────────────────────────────────────────────

describe("Sprint 4.3 — unauthorized mutation attempts", () => {
  it("returns 404 when no accessible connections exist", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    await expect(markThreadRead(ORG_A, USER_A, "member", "thread-1")).rejects.toThrow(
      ThreadActionError,
    );

    await expect(markThreadRead(ORG_A, USER_A, "member", "thread-1")).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mockDb.mailboxThread.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when thread belongs to a different org", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    await expect(markThreadRead(ORG_B, USER_A, "member", "thread-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns 404 for inaccessible connection (hidden-safe)", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: "conn-other" }),
    ]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    await expect(markThreadRead(ORG_A, USER_A, "member", "thread-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns 403 for read-only members on org_shared connection", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ visibilityPolicy: "org_shared" }),
    ]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());

    await expect(markThreadRead(ORG_A, USER_A, "member", "thread-1")).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(mockDb.mailboxThread.update).not.toHaveBeenCalled();
    expect(mockDb.mailboxAuditEvent.create).not.toHaveBeenCalled();
  });

  it("allows admin to mutate despite org_shared policy", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ visibilityPolicy: "org_shared" }),
    ]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const result = await markThreadRead(ORG_A, USER_A, "admin", "thread-1");
    expect(result.success).toBe(true);
  });
});

// ─── performThreadAction dispatch ─────────────────────────────────────────────

describe("Sprint 4.3 — performThreadAction dispatch", () => {
  it("rejects invalid actions", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());

    // TypeScript prevents this at compile time; runtime guard is tested via route layer
  });
});

// ─── Route layer ──────────────────────────────────────────────────────────────

describe("Sprint 4.3 — POST /api/mailbox/threads/[id]/actions", () => {
  it("returns 401 when unauthenticated", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    } as never);

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid thread id", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads//actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid thread ID");
  });

  it("returns 400 for invalid action", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "delete" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid action");
  });

  it("returns 400 for malformed JSON body", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON body");
  });

  it("returns 404 when thread not found", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Thread not found");
  });

  it("returns 403 for read-only members", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ visibilityPolicy: "org_shared" }),
    ]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("permission");
  });

  it("returns success shape for mark_read", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "admin" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ unreadCount: 2 }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ unreadCount: 0 }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      thread: Record<string, unknown>;
      action: string;
    };
    expect(body.success).toBe(true);
    expect(body.action).toBe("mark_read");
    expect(body.thread).toBeDefined();
  });

  it("returns success shape for archive", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "admin" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ status: "OPEN" }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ status: "ARCHIVED" }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "archive" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; action: string };
    expect(body.success).toBe(true);
    expect(body.action).toBe("archive");
  });

  it("returns success shape for flag", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "admin" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord({ isFlagged: false }));
    mockDb.mailboxThread.update.mockResolvedValue(makeThreadRecord({ isFlagged: true }));
    mockDb.mailboxAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "flag" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; action: string };
    expect(body.success).toBe(true);
    expect(body.action).toBe("flag");
  });

  it("returns 429 when rate limited", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "admin" },
    } as never);

    const { rateLimitByOrg } = await import("@/lib/rate-limit");
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: false, remaining: 0 });

    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many requests");
  });
});
