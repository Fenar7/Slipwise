/**
 * Mailbox Phase 4 Sprint 4.2 — Thread detail and message stack rendering tests.
 *
 * Covers:
 * - getMailboxThreadDetail service (full detail with messages, attachments, ordering)
 * - GET /api/mailbox/threads/[id] route (auth, 404, invalid id, response shape)
 * - Read shape mapping (thread detail, message detail with attachments)
 * - Org-scoped isolation and access control
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxThread: {
      findFirst: vi.fn(),
    },
    mailboxConnection: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockDb = db as unknown as {
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 119 }),
  RATE_LIMITS: { api: { maxRequests: 120, window: "60 s" } },
}));

import { getMailboxThreadDetail } from "@/lib/mailbox/thread-service";
import { toMailboxThreadDetailReadShape } from "@/lib/mailbox/read-shapes";
import { sanitizeMessageHtml } from "@/lib/mailbox/sanitize-message-html";

const ORG_A = "org-aaa";
const USER_A = "00000000-0000-0000-0000-000000000001";
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
    participantsSummary: [
      { email: "client@example.com", displayName: "Client" },
      { email: "billing@example.com", displayName: "Billing Team" },
    ],
    lastMessageAt: new Date("2026-05-10T10:00:00Z"),
    unreadCount: 1,
    status: "OPEN" as const,
    assigneeId: USER_A,
    isFlagged: false,
    primaryLinkSummary: null,
    previewSnippet: "Please find the attached invoice",
    attachmentCount: 2,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-10T10:00:00Z"),
    ...overrides,
  };
}

function makeMessageRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    orgId: ORG_A,
    threadId: "thread-1",
    providerMessageId: "gmail-msg-1",
    rfcMessageId: "<abc123@example.com>",
    direction: "inbound" as const,
    from: { email: "client@example.com", displayName: "Client" },
    to: [{ email: "billing@example.com", displayName: "Billing Team" }],
    cc: [],
    bcc: [],
    subject: "Invoice #123",
    htmlBody: "<p>Hi team,</p><p>Could you send the invoice?</p>",
    textBody: "Hi team, Could you send the invoice?",
    snippet: "Could you send the invoice?",
    sentAt: new Date("2026-05-10T09:00:00Z"),
    receivedAt: new Date("2026-05-10T09:05:00Z"),
    attachmentCount: 1,
    providerMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [
      {
        id: "att-1",
        messageId: "msg-1",
        providerAttachmentId: "gmail-att-1",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 145000,
        isInline: false,
        storageRef: null,
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

// ─── Thread detail service ────────────────────────────────────────────────────

describe("Sprint 4.2 — getMailboxThreadDetail", () => {
  it("returns null when no accessible connections exist", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result).toBeNull();
    expect(mockDb.mailboxThread.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when thread is not found", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "missing-thread",
    );

    expect(result).toBeNull();
  });

  it("returns null when thread belongs to inaccessible connection", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ id: "conn-other" }),
    ]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result).toBeNull();
    expect(mockDb.mailboxThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "thread-1",
          orgId: ORG_A,
          mailboxConnectionId: { in: ["conn-other"] },
        }),
      }),
    );
  });

  it("returns full thread detail with messages and attachments", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord(),
      messages: [
        makeMessageRecord({ id: "msg-1", sentAt: new Date("2026-05-10T09:00:00Z") }),
        makeMessageRecord({
          id: "msg-2",
          direction: "outbound" as const,
          htmlBody: "<p>Sure, here it is.</p>",
          sentAt: new Date("2026-05-10T10:00:00Z"),
          attachments: [
            {
              id: "att-2",
              messageId: "msg-2",
              providerAttachmentId: "gmail-att-2",
              filename: "invoice-v2.pdf",
              mimeType: "application/pdf",
              size: 150000,
              isInline: false,
              storageRef: null,
              createdAt: new Date(),
            },
          ],
        }),
      ],
    });

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("thread-1");
    expect(result!.subject).toBe("Invoice #123");
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0].id).toBe("msg-1");
    expect(result!.messages[1].id).toBe("msg-2");
    expect(result!.messages[0].attachments).toHaveLength(1);
    expect(result!.messages[0].attachments[0].filename).toBe("invoice.pdf");
    expect(result!.messages[1].attachments).toHaveLength(1);
    expect(result!.messages[1].attachments[0].filename).toBe("invoice-v2.pdf");
  });

  it("returns messages in chronological order (sentAt ASC)", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    // Prisma include with orderBy returns in sorted order; mock returns as-is
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord(),
      messages: [
        makeMessageRecord({ id: "msg-earlier", sentAt: new Date("2026-05-10T08:00:00Z") }),
        makeMessageRecord({ id: "msg-middle", sentAt: new Date("2026-05-10T10:00:00Z") }),
        makeMessageRecord({ id: "msg-later", sentAt: new Date("2026-05-10T12:00:00Z") }),
      ],
    });

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result!.messages.map((m) => m.id)).toEqual([
      "msg-earlier",
      "msg-middle",
      "msg-later",
    ]);
  });

  it("includes participant fields in detail shape", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord(),
      messages: [makeMessageRecord()],
    });

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result!.participants).toHaveLength(2);
    expect(result!.participants[0]).toMatchObject({
      email: "client@example.com",
      displayName: "Client",
    });
    expect(result!.participants[1]).toMatchObject({
      email: "billing@example.com",
      displayName: "Billing Team",
    });
  });

  it("handles thread with no messages gracefully", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord(),
      messages: [],
    });

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result).not.toBeNull();
    expect(result!.messages).toEqual([]);
    expect(result!.attachmentCount).toBe(2);
  });

  it("handles missing optional participant data without crashing", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord({
        participantsSummary: [{ email: "unknown@example.com" }],
      }),
      messages: [makeMessageRecord({ from: { email: "unknown@example.com" } })],
    });

    const result = await getMailboxThreadDetail(
      ORG_A,
      USER_A,
      "member",
      "thread-1",
    );

    expect(result!.participants[0].displayName).toBeNull();
    expect(result!.participants[0].email).toBe("unknown@example.com");
    expect(result!.messages[0].from.displayName).toBeNull();
  });
});

// ─── Thread detail route ───────────────────────────────────────────────────────

describe("Sprint 4.2 — GET /api/mailbox/threads/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: false,
      error: "Unauthorized",
      status: 401,
    } as never);

    const { GET } = await import("@/app/api/mailbox/threads/[id]/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1");
    const res = await GET(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when thread is not found", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      org: { id: ORG_A },
      user: { id: USER_A },
      role: "member",
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/mailbox/threads/[id]/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/missing");
    const res = await GET(req, { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Thread not found");
  });

  it("returns 400 for invalid thread id", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      org: { id: ORG_A },
      user: { id: USER_A },
      role: "member",
    } as never);

    const { GET } = await import("@/app/api/mailbox/threads/[id]/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/");
    const res = await GET(req, { params: Promise.resolve({ id: "" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid thread ID");
  });

  it("returns thread detail with stable shape for accessible thread", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      org: { id: ORG_A },
      user: { id: USER_A },
      role: "member",
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...makeThreadRecord(),
      messages: [makeMessageRecord()],
    });

    const { GET } = await import("@/app/api/mailbox/threads/[id]/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread-1");
    const res = await GET(req, { params: Promise.resolve({ id: "thread-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { thread: Record<string, unknown> };
    expect(body.thread).toBeDefined();
    expect(body.thread.id).toBe("thread-1");
    expect(body.thread.subject).toBe("Invoice #123");
    expect(Array.isArray(body.thread.messages)).toBe(true);
    expect(body.thread.messages).toHaveLength(1);
    expect((body.thread.messages as Record<string, unknown>[])[0]).toMatchObject({
      id: "msg-1",
      subject: "Invoice #123",
    });
    expect(
      Array.isArray((body.thread.messages as Record<string, unknown>[])[0].attachments),
    ).toBe(true);
  });
});

// ─── Sanitizer ─────────────────────────────────────────────────────────────────

describe("Sprint 4.2 — sanitizeMessageHtml", () => {
  it("allows basic formatting tags", () => {
    const html = "<p><b>Bold</b> and <i>italic</i></p>";
    expect(sanitizeMessageHtml(html)).toBe(html);
  });

  it("strips script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeMessageHtml(html)).toBe("<p>Hello</p>");
  });

  it("strips event handlers", () => {
    const html = '<p onclick="alert(1)">Hello</p>';
    expect(sanitizeMessageHtml(html)).toBe("<p>Hello</p>");
  });

  it("preserves blockquote elements", () => {
    const html = "<p>Original</p><blockquote><p>Quoted</p></blockquote>";
    expect(sanitizeMessageHtml(html)).toBe(html);
  });

  it("strips style tags but keeps content", () => {
    const html = '<style>body{color:red}</style><p>Hello</p>';
    expect(sanitizeMessageHtml(html)).toBe("<p>Hello</p>");
  });

  it("handles empty input", () => {
    expect(sanitizeMessageHtml("")).toBe("");
    expect(sanitizeMessageHtml(null as unknown as string)).toBe("");
  });

  it("preserves links with href", () => {
    const html = '<a href="https://example.com">Link</a>';
    expect(sanitizeMessageHtml(html)).toBe(html);
  });
});
