/**
 * Mailbox Gmail-Grade Search Sprint B — Dual-Mode Retrieval and Rendering test suite.
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
  mailboxMessage: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const mockSearchThreads = vi.fn();
const mockSearchMessages = vi.fn();
const mockFetchThreadDetail = vi.fn();

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: () => ({
    descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true, supportsSearch: true, syncCursorType: "HISTORY_ID" },
    searchThreads: mockSearchThreads,
    searchMessages: mockSearchMessages,
    fetchThreadDetail: mockFetchThreadDetail,
  }),
  findMailboxProviderAdapter: (provider: string) =>
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
  mockSearchMessages.mockReset();
  mockSearchMessages.mockResolvedValue({
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

describe("Mailbox Gmail-Grade Search Sprint B — Dual-Mode Retrieval and Rendering", () => {
  describe("Search mode defaults and persistence", () => {
    it("1. threads mode is the default when no searchMode is provided", async () => {
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
        hits: [{ providerThreadId: "t-1", providerMessageId: null }],
        nextPageToken: null,
        estimatedTotal: 1,
      });
      mockDb.mailboxThread.findMany.mockResolvedValue([]);
      mockDb.mailboxThread.count.mockResolvedValue(0);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        limit: 10,
      });

      // Default mode should be threads
      expect(result.searchMeta?.searchMode).toBe("threads");
      expect(result.messages).toBeUndefined();
      expect(result.threads).toBeDefined();
    });

    it("2. searchMode persists correctly in query state (threads)", async () => {
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
        searchMode: "threads",
        limit: 10,
      });

      expect(result.searchMeta?.searchMode).toBe("threads");
    });

    it("3. searchMode persists correctly in query state (messages)", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [],
        nextPageToken: null,
        estimatedTotal: 0,
      });

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      expect(result.searchMeta?.searchMode).toBe("messages");
    });
  });

  describe("Threads mode behavior", () => {
    it("4. threads mode returns thread results, not message results", async () => {
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
        hits: [
          { providerThreadId: "t-1", providerMessageId: "m-1" },
          { providerThreadId: "t-2", providerMessageId: "m-2" },
        ],
        nextPageToken: null,
        estimatedTotal: 2,
      });
      // Threads are resolved from local DB
      mockDb.mailboxThread.findMany.mockResolvedValue([
        {
          id: "local-t-1",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "t-1",
          subject: "Thread 1",
          previewSnippet: "Preview 1",
          lastMessageAt: new Date(),
          unreadCount: 1,
          status: "OPEN",
          isFlagged: false,
          assigneeId: null,
          attachmentCount: 0,
          participantsSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "local-t-2",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "t-2",
          subject: "Thread 2",
          previewSnippet: "Preview 2",
          lastMessageAt: new Date(),
          unreadCount: 0,
          status: "OPEN",
          isFlagged: false,
          assigneeId: null,
          attachmentCount: 0,
          participantsSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "threads",
        limit: 10,
      });

      expect(result.threads).toHaveLength(2);
      expect(result.messages).toBeUndefined();
      expect(result.searchMeta?.searchMode).toBe("threads");
    });
  });

  describe("Messages mode behavior", () => {
    it("5. messages mode returns message-level results", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [
          {
            providerThreadId: "t-1",
            providerMessageId: "m-1",
            snippet: "Hello about invoice",
            subject: "Invoice #123",
            from: { email: "sender@test.com", displayName: "Test Sender" },
            sentAt: "2026-06-01T10:00:00Z",
          },
          {
            providerThreadId: "t-1",
            providerMessageId: "m-2",
            snippet: "Re: Invoice #123",
            subject: "Re: Invoice #123",
            from: { email: "reply@test.com", displayName: "Reply Sender" },
            sentAt: "2026-06-02T10:00:00Z",
          },
        ],
        nextPageToken: null,
        estimatedTotal: 2,
      });
      // Parent thread resolved from local DB
      mockDb.mailboxThread.findMany.mockResolvedValue([
        {
          id: "local-t-1",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "t-1",
          subject: "Invoice #123",
          previewSnippet: "Hello about invoice",
          lastMessageAt: new Date(),
          unreadCount: 1,
          status: "OPEN",
          isFlagged: false,
          assigneeId: null,
          attachmentCount: 0,
          participantsSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "invoice",
        searchMode: "messages",
        limit: 10,
      });

      expect(result.threads).toHaveLength(0);
      expect(result.messages).toHaveLength(2);
      expect(result.searchMeta?.searchMode).toBe("messages");

      // First message
      expect(result.messages![0].providerMessageId).toBe("m-1");
      expect(result.messages![0].subject).toBe("Invoice #123");
      expect(result.messages![0].from?.email).toBe("sender@test.com");
      expect(result.messages![0].threadSubject).toBe("Invoice #123");
      expect(result.messages![0].isShellResult).toBe(false);

      // Second message (same thread, different message)
      expect(result.messages![1].providerMessageId).toBe("m-2");
      expect(result.messages![1].subject).toBe("Re: Invoice #123");
    });

    it("6. multiple matching messages in one thread appear separately in messages mode", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [
          {
            providerThreadId: "t-1",
            providerMessageId: "m-1",
            snippet: "First match",
            subject: "Thread Subject",
            from: { email: "a@test.com", displayName: "A" },
            sentAt: "2026-06-01T10:00:00Z",
          },
          {
            providerThreadId: "t-1",
            providerMessageId: "m-2",
            snippet: "Second match",
            subject: "Thread Subject",
            from: { email: "b@test.com", displayName: "B" },
            sentAt: "2026-06-02T10:00:00Z",
          },
          {
            providerThreadId: "t-1",
            providerMessageId: "m-3",
            snippet: "Third match",
            subject: "Thread Subject",
            from: { email: "a@test.com", displayName: "A" },
            sentAt: "2026-06-03T10:00:00Z",
          },
        ],
        nextPageToken: null,
        estimatedTotal: 3,
      });
      mockDb.mailboxThread.findMany.mockResolvedValue([]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      // All three messages appear separately
      expect(result.messages).toHaveLength(3);
      expect(result.messages![0].providerMessageId).toBe("m-1");
      expect(result.messages![1].providerMessageId).toBe("m-2");
      expect(result.messages![2].providerMessageId).toBe("m-3");
    });
  });

  describe("Provider-hit shell rendering", () => {
    it("7. shell results render when hydration is pending", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
        { mailboxConnectionId: CONN_1, folder: "DRAFT", state: "COMPLETE" },
        { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
        { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [
          {
            providerThreadId: "unhydrated-t",
            providerMessageId: "unhydrated-m",
            snippet: "Provider snippet",
            subject: "Provider subject",
            from: { email: "provider@test.com", displayName: "Provider" },
            sentAt: "2026-06-01T10:00:00Z",
          },
        ],
        nextPageToken: null,
        estimatedTotal: 1,
      });
      // Thread not found locally → shell result
      mockDb.mailboxThread.findMany.mockResolvedValue([]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].isShellResult).toBe(true);
      expect(result.messages![0].threadSubject).toBe("Provider subject");
      expect(result.messages![0].snippet).toBe("Provider snippet");
      expect(result.messages![0].mailboxDisplayName).toBe("Test Connection");
    });

    it("8. shell results reconcile correctly after hydration (thread resolved locally)", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
        { mailboxConnectionId: CONN_1, folder: "STARRED", state: "COMPLETE" },
        { mailboxConnectionId: CONN_1, folder: "TRASH", state: "COMPLETE" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [
          {
            providerThreadId: "hydrated-t",
            providerMessageId: "hydrated-m",
            snippet: "Provider snippet",
            subject: "Provider subject",
            from: { email: "provider@test.com", displayName: "Provider" },
            sentAt: "2026-06-01T10:00:00Z",
          },
        ],
        nextPageToken: null,
        estimatedTotal: 1,
      });
      // Thread IS found locally → not a shell result
      mockDb.mailboxThread.findMany.mockResolvedValue([
        {
          id: "local-t",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "hydrated-t",
          subject: "Local Thread Subject",
          previewSnippet: "Local preview",
          lastMessageAt: new Date(),
          unreadCount: 0,
          status: "OPEN",
          isFlagged: false,
          assigneeId: null,
          attachmentCount: 0,
          participantsSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].isShellResult).toBe(false);
      expect(result.messages![0].threadSubject).toBe("Local Thread Subject");
      expect(result.messages![0].threadId).toBe("local-t");
    });
  });

  describe("Security and permission scoping", () => {
    it("9. restricted mailbox visibility is preserved in messages mode", async () => {
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
        searchMode: "messages",
        limit: 10,
      });

      // Restricted mailbox should yield empty results
      expect(result.messages ?? []).toHaveLength(0);
      expect(result.threads).toHaveLength(0);
      expect(result.searchMeta).toBeUndefined();
    });

    it("10. no cross-org or cross-connection leakage in message-mode rendering", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      // Use INCOMPLETE coverage so the test exercises the provider search path
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "BOOTSTRAPPING" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [
          {
            providerThreadId: "t-1",
            providerMessageId: "m-1",
            snippet: "Test",
            subject: "Test",
            from: { email: "test@test.com", displayName: "Test" },
            sentAt: "2026-06-01T10:00:00Z",
          },
        ],
        nextPageToken: null,
        estimatedTotal: 1,
      });
      mockDb.mailboxThread.findMany.mockResolvedValue([]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      // Only the accessible connection's results are returned
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].mailboxConnectionId).toBe(CONN_1);
      expect(result.messages![0].mailboxDisplayName).toBe("Test Connection");
    });
  });

  describe("Degraded-state correctness", () => {
    it("11. partial/degraded search truth remains correct in messages mode", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
        { mailboxConnectionId: CONN_1, folder: "INBOX", state: "COMPLETE" },
        { mailboxConnectionId: CONN_1, folder: "SENT", state: "BOOTSTRAPPING" },
      ]);
      mockSearchMessages.mockResolvedValue({
        hits: [],
        nextPageToken: null,
        estimatedTotal: 0,
      });

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "test",
        searchMode: "messages",
        limit: 10,
      });

      expect(result.searchMeta?.partial).toBe(true);
      expect(result.searchMeta?.searchMode).toBe("messages");
      expect(result.searchMeta?.connectionStates[0].status).toBe("coverage_incomplete");
    });

    it("12. non-Gmail local-authoritative search remains healthy in messages mode", async () => {
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
      mockDb.mailboxThread.findMany.mockResolvedValue([]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        connectionId: NON_GMAIL_CONN,
        searchQuery: "invoice",
        searchMode: "messages",
        limit: 10,
      });

      // Non-Gmail: message search not supported, but not degraded for local search
      expect(result.searchMeta?.searchMode).toBe("messages");
      expect(result.searchMeta?.connectionStates[0].status).toBe("provider_unsupported");
    });
  });

  describe("Existing thread-first operations not regressed", () => {
    it("13. threads mode still works correctly with search (thread-first operations preserved)", async () => {
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
        hits: [{ providerThreadId: "t-1", providerMessageId: null }],
        nextPageToken: null,
        estimatedTotal: 1,
      });
      mockDb.mailboxThread.findMany.mockResolvedValue([
        {
          id: "local-t-1",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "t-1",
          subject: "Invoice Thread",
          previewSnippet: "Invoice content",
          lastMessageAt: new Date(),
          unreadCount: 1,
          status: "OPEN",
          isFlagged: true,
          assigneeId: USER_A,
          attachmentCount: 2,
          participantsSummary: [{ email: "test@test.com", displayName: "Test" }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        searchQuery: "invoice",
        searchMode: "threads",
        limit: 10,
      });

      // Thread-first: thread results with assignment, status, etc.
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].assigneeId).toBe(USER_A);
      expect(result.threads[0].isFlagged).toBe(true);
      expect(result.threads[0].attachmentCount).toBe(2);
      expect(result.messages).toBeUndefined();
    });

    it("14. no search mode does not break non-search thread listing", async () => {
      mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRecord()]);
      mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([]);
      mockDb.mailboxThread.findMany.mockResolvedValue([
        {
          id: "local-t-1",
          orgId: ORG_A,
          mailboxConnectionId: CONN_1,
          providerThreadId: "t-1",
          subject: "Regular Thread",
          previewSnippet: "Content",
          lastMessageAt: new Date(),
          unreadCount: 0,
          status: "OPEN",
          isFlagged: false,
          assigneeId: null,
          attachmentCount: 0,
          participantsSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockDb.mailboxThread.count.mockResolvedValue(1);

      const result = await listMailboxThreads({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        limit: 10,
      });

      // No search → regular thread listing, no searchMeta
      expect(result.threads).toHaveLength(1);
      expect(result.searchMeta).toBeUndefined();
      expect(result.messages).toBeUndefined();
    });
  });
});
