/**
 * Mailbox Gmail-Grade Search Sprint A — Truth and Coverage test suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockQueryRaw = vi.fn().mockImplementation(async (sql, ...values) => {
  const queryStr = (Array.isArray(sql) ? sql.join(" ") : String(sql)).toUpperCase();
  const allValues = values.map(v => String(v).toUpperCase());
  const hasThread = queryStr.includes("THREAD") || allValues.some(v => v.includes("THREAD"));
  const hasMessage = queryStr.includes("MESSAGE") || allValues.some(v => v.includes("MESSAGE"));

  if (queryStr.includes("COUNT")) {
    if (hasThread) {
      return [{ count: 11n }];
    }
    if (hasMessage) {
      return [{ count: 10n }];
    }
    return [{ count: 0n }];
  }

  if (hasThread) {
    return [
      { threadId: "local-t-1" },
      { threadId: "local-t-2" },
      { threadId: "t-1" },
      { threadId: "t-2" },
      { threadId: "thread-123" },
      { threadId: "thread-456" },
      { threadId: "thread-789" },
      { threadId: "thread-abc" },
      { threadId: "thread-def" },
      { threadId: "thread-xyz" },
      { threadId: "restricted-t-1" },
    ];
  }

  if (hasMessage) {
    return [
      { messageId: "local-m-1" },
      { messageId: "local-m-2" },
      { messageId: "m-1" },
      { messageId: "m-2" },
      { messageId: "msg-123" },
      { messageId: "msg-456" },
      { messageId: "msg-789" },
      { messageId: "msg-abc" },
      { messageId: "msg-def" },
      { messageId: "msg-xyz" },
    ];
  }

  return [];
});

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: (...args: any[]) => mockQueryRaw(...args),
    mailboxThread: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxConnection: {
      findMany: vi.fn(),
    },
    mailboxFolderCoverage: {
      findMany: vi.fn(),
    },
    mailboxMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import { db } from "@/lib/db";
import { getFriendlyDegradedMessage } from "@/app/app/mailbox/mailbox-empty-states";

const mockDb = db as unknown as {
  mailboxThread: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxFolderCoverage: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockSearchThreads = vi.fn();
const mockFetchThreadDetail = vi.fn();

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: () => ({
    descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true, supportsSearch: true, syncCursorType: "HISTORY_ID" },
    searchThreads: mockSearchThreads,
    fetchThreadDetail: mockFetchThreadDetail,
  }),
  findMailboxProviderAdapter: (provider) =>
    provider === "GMAIL"
      ? { descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true, supportsSearch: true, syncCursorType: "HISTORY_ID" } }
      : null,
}));

import { listMailboxThreads } from "@/lib/mailbox/thread-service";

const ORG_A = "org-aaa";
const USER_A = "user-aaa";
const CONN_1 = "conn-001";

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchThreads.mockReset();
  mockSearchThreads.mockResolvedValue({
    hits: [],
    nextPageToken: null,
    estimatedTotal: 0,
  });
  mockFetchThreadDetail.mockReset();
  mockFetchThreadDetail.mockResolvedValue({ messages: [] });
});

function makeConnectionRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_1,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-1",
    emailAddress: "test@example.com",
    displayName: "Test Connection",
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

describe("Mailbox Gmail-Grade Search Sprint A — Truth and Coverage", () => {
  it("1. search metadata marks results partial when coverage is incomplete", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    // coverage incomplete: only some folders are complete
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SENT", state: "BOOTSTRAPPING" },
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    expect(result.searchMeta).toEqual({
      mode: "gmail_exact",
      searchMode: "threads",
      totalCountIsExact: false,
      partial: true,
      partialConnectionIds: [CONN_1],
      coverageState: "partial",
      connectionStates: [
        {
          connectionId: CONN_1,
          status: "coverage_incomplete",
          reason: "Search coverage still catching up (status: BOOTSTRAPPING)",
        },
      ],
    });
  });

  it("2. search metadata marks mailbox-specific degraded states when provider search fails", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SENT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SPAM", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "DRAFT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
    ]);
    // Provider search fails
    mockSearchThreads.mockResolvedValue({
      category: "provider_unavailable",
      safeMessage: "Gmail API quota exceeded",
      retryable: false,
    });
    mockDb.mailboxThread.findMany.mockResolvedValue([]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    expect(result.searchMeta).toEqual({
      mode: "gmail_exact",
      searchMode: "threads",
      totalCountIsExact: false,
      partial: true,
      partialConnectionIds: [CONN_1],
      coverageState: "complete",
      connectionStates: [
        {
          connectionId: CONN_1,
          status: "provider_failed",
          reason: "Gmail API quota exceeded",
        },
      ],
    });
  });

  it("3. search metadata marks auth-expired/reconnect-required mailbox state truthfully", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      makeConnectionRecord({ status: "RECONNECT_REQUIRED" }),
    ]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SENT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SPAM", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "DRAFT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.count.mockResolvedValue(0);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    // falls back to local search but marks status auth_expired
    expect(result.searchMeta).toEqual({
      mode: "local",
      searchMode: "threads",
      totalCountIsExact: true,
      partial: true,
      partialConnectionIds: [CONN_1],
      coverageState: "complete",
      connectionStates: [
        {
          connectionId: CONN_1,
          status: "auth_expired",
          reason: "Authentication token is expired or revoked. Reconnect required.",
        },
      ],
    });
  });

  it("4. hydration failures become explicit degraded mailbox states", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SENT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SPAM", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "DRAFT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
    ]);
    mockSearchThreads.mockResolvedValue({
      hits: [{ providerThreadId: "unhydrated-thread-id", providerMessageId: "msg-1" }],
      nextPageToken: null,
      estimatedTotal: 1,
    });
    mockFetchThreadDetail.mockRejectedValue(new Error("Hydration network timeout"));
    // Hydration fails (by returning empty resolved thread keys)
    mockDb.mailboxThread.findMany.mockResolvedValue([]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    expect(result.searchMeta).toEqual({
      mode: "gmail_exact",
      searchMode: "threads",
      totalCountIsExact: false,
      partial: true,
      partialConnectionIds: [CONN_1],
      coverageState: "complete",
      connectionStates: [
        {
          connectionId: CONN_1,
          status: "hydration_failed",
          reason: "Hydration network timeout",
        },
      ],
    });
  });

  it("5. getFriendlyDegradedMessage maps connection state truthfully", () => {
    expect(getFriendlyDegradedMessage("auth_expired", "Billing")).toBe(
      'Gmail account "Billing" needs reconnect'
    );
    expect(getFriendlyDegradedMessage("coverage_incomplete", "Billing")).toBe(
      'Search coverage for "Billing" still catching up'
    );
    expect(getFriendlyDegradedMessage("provider_failed", "Billing")).toBe(
      'Provider temporarily unavailable for "Billing"'
    );
    expect(getFriendlyDegradedMessage("hydration_failed", "Billing")).toBe(
      'Some results still loading into Slipwise for "Billing"'
    );
  });

  it("6. complete/healthy search does not falsely show degraded banner", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SENT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "SPAM", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "DRAFT", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
      { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
    ]);
    mockSearchThreads.mockResolvedValue({
      hits: [],
      nextPageToken: null,
      estimatedTotal: 0,
    });

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    expect(result.searchMeta?.partial).toBe(false);
    expect(result.searchMeta?.partialConnectionIds).toEqual([]);
    expect(result.searchMeta?.connectionStates[0].status).toBe("ok");
  });

  it("7. no security regression in org/mailbox scoping for the new metadata", async () => {
    // Member does not have access toCONN_1 since it's restricted and not owner/admin
    const restrictedConnection = makeConnectionRecord({
      id: "restricted-conn",
      visibilityPolicy: "restricted",
    });
    mockDb.mailboxConnection.findMany.mockResolvedValue([restrictedConnection]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([]);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    // Restricted mailbox should yield empty results and NO searchMeta leakage for the restricted connection
    expect(result.threads).toEqual([]);
    expect(result.searchMeta).toBeUndefined();
  });
  it("8. non-Gmail connection in local search is NOT degraded merely because provider search is unsupported", async () => {
    const NON_GMAIL_CONN = "conn-outlook-001";
    const nonGmailConnection = makeConnectionRecord({
      id: NON_GMAIL_CONN,
      provider: "OUTLOOK" as const,
      providerAccountId: "outlook-1",
      emailAddress: "user@outlook.com",
      displayName: "Outlook Mailbox",
      tokenRef: "outlook-token-1",
    });
    mockDb.mailboxConnection.findMany.mockResolvedValue([nonGmailConnection]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      {
        id: "thread-outlook-1",
        orgId: ORG_A,
        mailboxConnectionId: NON_GMAIL_CONN,
        providerThreadId: "outlook-t-1",
        subject: "Invoice from Outlook",
        previewSnippet: "Please find attached",
        lastMessageAt: new Date("2026-06-01"),
        unreadCount: 1,
        status: "OPEN",
        isFlagged: false,
        assigneeId: null,
        attachmentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      connectionId: NON_GMAIL_CONN,
      searchQuery: "invoice",
      limit: 10,
    });

    expect(result.searchMeta?.mode).toBe("local");
    expect(result.searchMeta?.partial).toBe(false);
    expect(result.searchMeta?.partialConnectionIds).toEqual([]);
    expect(result.searchMeta?.connectionStates).toEqual([
      {
        connectionId: NON_GMAIL_CONN,
        status: "provider_unsupported",
        reason: "Provider search is unsupported for this provider",
      },
    ]);
    expect(result.searchMeta?.coverageState).toBe("unknown");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].subject).toBe("Invoice from Outlook");
  });

  it("9. mixed Gmail + non-Gmail: only Gmail connection triggers degraded when auth expired", async () => {
    const GMAIL_CONN = "conn-gmail-001";
    const OUTLOOK_CONN = "conn-outlook-001";
    const gmailConn = makeConnectionRecord({
      id: GMAIL_CONN,
      provider: "GMAIL" as const,
      providerAccountId: "gmail-1",
      emailAddress: "user@gmail.com",
      displayName: "Gmail Mailbox",
      status: "RECONNECT_REQUIRED" as const,
    });
    const outlookConn = makeConnectionRecord({
      id: OUTLOOK_CONN,
      provider: "OUTLOOK" as const,
      providerAccountId: "outlook-1",
      emailAddress: "user@outlook.com",
      displayName: "Outlook Mailbox",
      tokenRef: "outlook-token-1",
    });
    mockDb.mailboxConnection.findMany.mockResolvedValue([gmailConn, outlookConn]);
    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      { mailboxConnectionId: GMAIL_CONN, folder: "INBOX", state: "COMPLETE" },
      { mailboxConnectionId: GMAIL_CONN, folder: "SENT", state: "COMPLETE" },
      { mailboxConnectionId: GMAIL_CONN, folder: "SPAM", state: "COMPLETE" },
      { mailboxConnectionId: GMAIL_CONN, folder: "DRAFT", state: "COMPLETE" },
      { mailboxConnectionId: GMAIL_CONN, folder: "STARRED", state: "COMPLETE" },
      { mailboxConnectionId: GMAIL_CONN, folder: "TRASH", state: "COMPLETE" },
    ]);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      {
        id: "thread-o-1",
        orgId: ORG_A,
        mailboxConnectionId: OUTLOOK_CONN,
        providerThreadId: "outlook-t-1",
        subject: "Outlook thread",
        previewSnippet: "Body text",
        lastMessageAt: new Date("2026-06-01"),
        unreadCount: 0,
        status: "OPEN",
        isFlagged: false,
        assigneeId: null,
        attachmentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDb.mailboxThread.count.mockResolvedValue(1);

    const result = await listMailboxThreads({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      searchQuery: "test",
      limit: 10,
    });

    expect(result.searchMeta?.mode).toBe("local");
    expect(result.searchMeta?.partial).toBe(true);
    expect(result.searchMeta?.partialConnectionIds).toEqual([GMAIL_CONN]);
    const outlookState = result.searchMeta?.connectionStates.find(
      cs => cs.connectionId === OUTLOOK_CONN,
    );
    expect(outlookState?.status).toBe("provider_unsupported");
    const gmailState = result.searchMeta?.connectionStates.find(
      cs => cs.connectionId === GMAIL_CONN,
    );
    expect(gmailState?.status).toBe("auth_expired");
  });

  it("10. getFriendlyDegradedMessage handles provider_unsupported without implying search failure", () => {
    const msg = getFriendlyDegradedMessage("provider_unsupported", "Invoices");
    expect(msg).toBe('Search is unsupported for "Invoices"');
    expect(msg).not.toContain("failed");
    expect(msg).not.toContain("error");
    expect(msg).not.toContain("degraded");
  });

});
