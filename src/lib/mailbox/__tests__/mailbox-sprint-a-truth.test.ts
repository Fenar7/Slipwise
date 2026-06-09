/**
 * Mailbox Gmail-Grade Search Sprint A — Truth and Coverage test suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
    mailboxFolderCoverage: {
      findMany: vi.fn(),
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
    descriptor: { provider: "GMAIL", displayName: "Gmail", supportsPushSync: true, supportsSend: true },
    searchThreads: mockSearchThreads,
    fetchThreadDetail: mockFetchThreadDetail,
  }),
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
});
