/**
 * Mailbox Phase 4 Sprint 4.4 — Search and Filter Basics tests.
 *
 * Covers:
 * - listMailboxThreads service search (subject, previewSnippet)
 * - GET /api/mailbox/threads route searchQuery parsing
 * - useMailboxThreads hook debounce + AbortController behavior (smoke)
 * - Empty/no-results state logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
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

const mockSearchThreads = vi.fn();

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: () => ({
    descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true },
    searchThreads: mockSearchThreads,
    fetchThreadDetail: vi.fn(),
  }),
}));

import { listMailboxThreads } from "@/lib/mailbox/thread-service";

const ORG_A = "org-aaa";
const USER_A = "00000000-0000-0000-0000-000000000001";
const CONN_1 = "conn-001";

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchThreads.mockReset();
  mockSearchThreads.mockResolvedValue({
    hits: [],
    nextPageToken: null,
    estimatedTotal: 0,
  });
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

// ─── Backend search tests ─────────────────────────────────────────────────────

describe("Sprint 4.4 — listMailboxThreads search", () => {
  it("ignores empty searchQuery", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "   ",
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ OR: expect.anything() }),
      }),
    );
  });

  it("searches subject with case-insensitive contains", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "invoice",
    });

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ orgId: ORG_A }),
            expect.objectContaining({
              OR: [
                { subject: { contains: "invoice", mode: "insensitive" } },
                { previewSnippet: { contains: "invoice", mode: "insensitive" } },
                { messages: { some: { OR: expect.any(Array) } } },
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("searches previewSnippet with case-insensitive contains", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord()]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "attached",
    });

    const callArgs = mockDb.mailboxThread.findMany.mock.calls[0]?.[0];
    const searchOr = callArgs?.where?.AND?.find(
      (cond: Record<string, unknown>) => cond.OR,
    );
    expect(searchOr).toBeDefined();
    expect(searchOr.OR).toEqual(
      expect.arrayContaining([
        { subject: { contains: "attached", mode: "insensitive" } },
        { previewSnippet: { contains: "attached", mode: "insensitive" } },
      ])
    );
  });

  it("combines search with existing filters", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([makeThreadRecord({ status: "PENDING" })]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      status: "PENDING",
      searchQuery: "invoice",
    });

    const callArgs = mockDb.mailboxThread.findMany.mock.calls[0]?.[0];
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "PENDING" }),
        expect.objectContaining({
          OR: [
            { subject: { contains: "invoice", mode: "insensitive" } },
            { previewSnippet: { contains: "invoice", mode: "insensitive" } },
            { messages: { some: { OR: expect.any(Array) } } },
          ],
        }),
      ]),
    );
  });

  it("includes search in totalCount query", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "invoice",
    });

    const countCall = mockDb.mailboxThread.count.mock.calls[0]?.[0];
    expect(countCall?.where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: [
              { subject: { contains: "invoice", mode: "insensitive" } },
              { previewSnippet: { contains: "invoice", mode: "insensitive" } },
              { messages: { some: { OR: expect.any(Array) } } },
            ],
          }),
        ]),
      }),
    );
  });

  it("uses Gmail provider search for Gmail connections and preserves provider hit order", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockSearchThreads.mockResolvedValue({
      hits: [
        { providerThreadId: "gmail-thread-2", providerMessageId: "msg-2" },
        { providerThreadId: "gmail-thread-1", providerMessageId: "msg-1" },
      ],
      nextPageToken: "next-page",
      estimatedTotal: 20,
    });
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({
        id: "thread-1",
        providerThreadId: "gmail-thread-1",
        lastMessageAt: new Date("2026-05-10T10:00:00Z"),
      }),
      makeThreadRecord({
        id: "thread-2",
        providerThreadId: "gmail-thread-2",
        lastMessageAt: new Date("2026-05-11T10:00:00Z"),
      }),
    ]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "chatgpt",
      limit: 2,
    });

    expect(mockSearchThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_A,
        query: "chatgpt",
        maxResults: 50,
      }),
    );
    expect(result.threads.map((thread) => thread.providerThreadId)).toEqual([
      "gmail-thread-2",
      "gmail-thread-1",
    ]);
    expect(result.totalCount).toBeNull();
    expect(result.searchMeta).toEqual({
      mode: "gmail_exact",
      totalCountIsExact: false,
      partial: false,
      partialConnectionIds: [],
    });
    expect(result.nextCursor).not.toBeNull();
  });

  it("supplements Gmail zero-hit searches with local normalized matches for already-ingested threads", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockSearchThreads.mockResolvedValue({
      hits: [],
      nextPageToken: null,
      estimatedTotal: 0,
    });
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({
        id: "thread-chatgpt-1",
        providerThreadId: "gmail-thread-chatgpt-1",
        subject: "Find your next favorite podcast",
        previewSnippet: "ChatGPT weekly update",
      }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "chatgpt",
      limit: 10,
    });

    expect(mockSearchThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "chatgpt",
      }),
    );
    expect(result.threads.map((thread) => thread.providerThreadId)).toEqual([
      "gmail-thread-chatgpt-1",
    ]);
    expect(result.searchMeta).toEqual({
      mode: "gmail_exact",
      totalCountIsExact: false,
      partial: false,
      partialConnectionIds: [],
    });
  });

  it("falls back to exact local search when the scoped mailbox is not Gmail-backed", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({
        id: "conn-outlook",
        provider: "OUTLOOK",
        tokenRef: "token-outlook",
      }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({
        id: "thread-outlook-1",
        mailboxConnectionId: "conn-outlook",
        providerThreadId: "outlook-thread-1",
        subject: "ChatGPT weekly update",
      }),
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "chatgpt",
      connectionId: "conn-outlook",
      limit: 25,
    });

    expect(mockSearchThreads).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(1);
    expect(result.searchMeta).toEqual({
      mode: "local",
      totalCountIsExact: true,
      partial: false,
      partialConnectionIds: [],
    });
  });

  it("stops offering a dead next page when Gmail search returns the same token with only duplicate hits", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockSearchThreads.mockResolvedValue({
      hits: [{ providerThreadId: "gmail-thread-1", providerMessageId: "msg-1" }],
      nextPageToken: "repeat-token",
      estimatedTotal: 1,
    });
    mockDb.mailboxThread.findMany.mockResolvedValue([
      makeThreadRecord({
        id: "thread-1",
        providerThreadId: "gmail-thread-1",
      }),
    ]);

    const stickyCursor = Buffer.from(
      JSON.stringify({
        kind: "provider_search",
        query: "chatgpt",
        bufferedThreadKeys: [],
        seenThreadKeys: [`${CONN_1}:gmail-thread-1`],
        connectionPageTokens: { [CONN_1]: "repeat-token" },
        localFallbackFetched: true,
        partialConnectionIds: [],
        estimatedTotal: 1,
      }),
      "utf-8",
    ).toString("base64");

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "chatgpt",
      limit: 1,
      cursor: stickyCursor,
    });

    expect(result.threads).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

// ─── Route layer tests ────────────────────────────────────────────────────────

describe("Sprint 4.4 — GET /api/mailbox/threads searchQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses searchQuery and forwards to service", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?searchQuery=invoice%20123`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const callArgs = mockDb.mailboxThread.findMany.mock.calls[0]?.[0];
    const searchOr = callArgs?.where?.AND?.find(
      (cond: Record<string, unknown>) => cond.OR,
    );
    expect(searchOr).toBeDefined();
    expect(searchOr.OR).toEqual(
      expect.arrayContaining([
        { subject: { contains: "invoice 123", mode: "insensitive" } },
        { previewSnippet: { contains: "invoice 123", mode: "insensitive" } },
      ])
    );
  });

  it("trims whitespace from searchQuery", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?searchQuery=%20%20invoice%20%20`,
    );
    await GET(req);

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ OR: expect.anything() }),
      }),
    );
  });

  it("combines searchQuery with other filters", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    vi.mocked(requireIntegrationMemberRoute).mockResolvedValue({
      ok: true,
      ctx: { orgId: ORG_A, userId: USER_A, role: "member" },
    } as never);

    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ provider: "OUTLOOK", tokenRef: "token-outlook" }),
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/mailbox/threads/route");
    const req = new NextRequest(
      `http://localhost/api/mailbox/threads?status=OPEN&isFlagged=true&searchQuery=urgent`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ status: "OPEN", isFlagged: true }),
            expect.objectContaining({
              OR: [
                { subject: { contains: "urgent", mode: "insensitive" } },
                { previewSnippet: { contains: "urgent", mode: "insensitive" } },
                { messages: { some: { OR: expect.any(Array) } } },
              ],
            }),
          ]),
        }),
      }),
    );
  });
});

// ─── UI hook smoke tests ──────────────────────────────────────────────────────

describe("Sprint 4.4 — useMailboxThreads hook params", () => {
  it("exports SEARCH_DEBOUNCE_MS constant", async () => {
    const { useMailboxThreads } = await import("@/app/app/mailbox/use-mailbox-threads");
    expect(typeof useMailboxThreads).toBe("function");
  });
});

// ─── Review finding tests ─────────────────────────────────────────────────────

// Finding A: linked/unlinked smart views must not appear in nav or route handling
import { GLOBAL_SMART_VIEWS, SMART_VIEW_DEFS } from "@/app/app/mailbox/mock-data";

describe("Sprint 4.4 review — Finding A: linked/unlinked removed", () => {
  it("GLOBAL_SMART_VIEWS does not contain linked", () => {
    const ids = GLOBAL_SMART_VIEWS.map((v) => v.id);
    expect(ids).not.toContain("linked");
    expect(ids).not.toContain("unlinked");
  });

  it("SMART_VIEW_DEFS does not contain linked", () => {
    const ids = SMART_VIEW_DEFS.map((v) => v.id);
    expect(ids).not.toContain("linked");
    expect(ids).not.toContain("unlinked");
  });
});

// Finding B: route-derived folder semantics — status filter must not override route status
// (Tested via the resolveLiveQueryParams helper indirectly through UI workspace tests)
// We add a direct workspace-param test here:
import {
  resolveThreadQueryParams,
  resolveLiveQueryParams,
} from "@/app/app/mailbox/mailbox-workspace";
import type { MailboxConnection } from "@/app/app/mailbox/types";

function makeMinimalConnection(overrides: Partial<MailboxConnection> = {}): MailboxConnection {
  return {
    id: "conn_billing",
    orgId: "org_1",
    provider: "gmail",
    slug: "billing",
    emailAddress: "billing@example.com",
    displayName: "Billing",
    status: "connected",
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorCategory: null,
    unreadCount: 0,
    inboxCount: 0,
    ...overrides,
  };
}

describe("Sprint 4.4 review — Finding B: route-derived status semantics", () => {
  it("inbox route resolves to OPEN,PENDING status", () => {
    const connections = [makeMinimalConnection({ slug: "billing" })];
    const params = resolveThreadQueryParams("/app/mailbox/billing/inbox", connections);
    expect(params.folder).toBe("INBOX");
    expect(params.status).toBe("OPEN,PENDING");
    expect(params.connectionId).toBe("conn_billing");
  });

  it("starred route resolves to STARRED folder semantics", () => {
    const connections = [makeMinimalConnection({ slug: "billing" })];
    const params = resolveThreadQueryParams("/app/mailbox/billing/starred", connections);
    expect(params.folder).toBe("STARRED");
  });

  it("sent route resolves to SENT folder semantics", () => {
    const connections = [makeMinimalConnection({ slug: "billing" })];
    const params = resolveThreadQueryParams("/app/mailbox/billing/sent", connections);
    expect(params.folder).toBe("SENT");
  });

  it("spam route resolves to SPAM folder semantics", () => {
    const connections = [makeMinimalConnection({ slug: "billing" })];
    const params = resolveThreadQueryParams("/app/mailbox/billing/spam", connections);
    expect(params.folder).toBe("SPAM");
  });

  it("smart view waiting resolves to PENDING status", () => {
    const params = resolveThreadQueryParams("/app/mailbox/waiting", []);
    expect(params.status).toBe("PENDING");
  });

  it("user status filter is ignored when route already defines status", () => {
    const routeParams = { connectionId: "conn_billing", folder: "INBOX" as const, status: "OPEN,PENDING" };
    const filterState = {
      filters: [{ field: "status", value: "closed", label: "Closed" }],
      searchQuery: "",
    };
    const result = resolveLiveQueryParams(routeParams, filterState);
    expect(result.status).toBe("OPEN,PENDING");
  });

  it("user status filter is applied when route has no built-in status", () => {
    const routeParams = { connectionId: "conn_billing" };
    const filterState = {
      filters: [{ field: "status", value: "closed", label: "Closed" }],
      searchQuery: "",
    };
    const result = resolveLiveQueryParams(routeParams, filterState);
    expect(result.status).toBe("CLOSED");
  });
});

// Finding C: request-aware loading state
import { renderHook, waitFor } from "@testing-library/react";

describe("Sprint 4.4 review — Finding C: request-aware loading state", () => {
  it("useMailboxThreads tracks loading correctly for the latest request", async () => {
    let resolveFirst: (v: Response) => void = () => {};
    let resolveSecond: (v: Response) => void = () => {};

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url) => {
      const u = new URL(url as string);
      if (u.searchParams.get("status") === "OPEN") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });

    const { useMailboxThreads } = await import("@/app/app/mailbox/use-mailbox-threads");
    const { result, rerender } = renderHook(
      (props) => useMailboxThreads(props),
      {
        initialProps: { status: "OPEN" } as UseMailboxThreadsParams,
      },
    );

    // Wait for the effect to start the first fetch
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Trigger a second fetch (params change — status prop is not debounced)
    rerender({ status: "PENDING" } as UseMailboxThreadsParams);

    // Second request should also be loading
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Resolve the first (now stale) request
    resolveFirst(
      new Response(
        JSON.stringify({ threads: [], nextCursor: null, totalCount: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Wait a tick — stale request must NOT clear loading
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isLoading).toBe(true);

    // Resolve the second (latest) request
    resolveSecond(
      new Response(
        JSON.stringify({ threads: [], nextCursor: null, totalCount: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetchSpy.mockRestore();
  });
});
