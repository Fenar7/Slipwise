/**
 * Mailbox Gmail-Grade Search Sprint D — Query Semantics and Ranking test suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockQueryRaw = vi.fn().mockImplementation(async (sql, ...values) => {
  let queryText = "";
  if (Array.isArray(sql)) {
    for (let i = 0; i < sql.length; i++) {
      queryText += sql[i];
      if (i < values.length) {
        const val = values[i];
        if (val && typeof val === "object" && "text" in val) {
          queryText += val.text;
        } else {
          queryText += String(val);
        }
      }
    }
  } else if (sql && typeof sql === "object" && "text" in sql) {
    queryText = sql.text;
  } else {
    queryText = String(sql);
  }

  const queryStr = queryText.toUpperCase();
  const allValues = values.map((v) => String(v).toUpperCase());
  const hasThread = queryStr.includes("THREAD") || allValues.some((v) => v.includes("THREAD"));
  const hasMessage = queryStr.includes("MESSAGE") || allValues.some((v) => v.includes("MESSAGE"));

  if (queryStr.includes("COUNT")) {
    return [{ count: 2n }];
  }

  if (hasThread) {
    return Array.from({ length: 15 }, (_, i) => ({
      threadId: `t-${i + 1}`,
      max_relevance: 100 - i,
      max_last_activity: new Date(Date.now() - i * 1000 * 60),
    }));
  }

  if (hasMessage) {
    return [
      { messageId: "m-1" },
      { messageId: "m-2" },
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
    mailboxCredential: {
      findFirst: vi.fn().mockResolvedValue({ encryptedPayload: "enc" }),
    },
  },
}));

import { db } from "@/lib/db";
import { listMailboxThreads } from "../thread-service";

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

describe("Mailbox Gmail-Grade Search Sprint D — Query Semantics and Ranking", () => {
  const ORG_ID = "org-sprint-d";
  const USER_ID = "user-sprint-d";
  const CONNECTION_ID = "conn-sprint-d";

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb.mailboxConnection.findMany.mockResolvedValue([
      {
        id: CONNECTION_ID,
        orgId: ORG_ID,
        provider: "OUTLOOK",
        providerAccountId: "outlook-d",
        emailAddress: "sprint-d@outlook.com",
        displayName: "Sprint D Mailbox",
        status: "CONNECTED",
        tokenRef: "token-d",
      },
    ]);

    mockDb.mailboxFolderCoverage.findMany.mockResolvedValue([
      {
        id: "cov-1",
        orgId: ORG_ID,
        mailboxConnectionId: CONNECTION_ID,
        folderName: "INBOX",
        syncState: "COMPLETE",
      },
    ]);
  });

  it("1. correctly applies search operator conditions inside buildLocalSearchQuery", async () => {
    mockDb.mailboxThread.count.mockResolvedValue(2);
    mockDb.mailboxThread.findMany.mockResolvedValue([
      {
        id: "t-1",
        orgId: ORG_ID,
        mailboxConnectionId: CONNECTION_ID,
        providerThreadId: "pt-1",
        subject: "Meeting with partner",
        previewSnippet: "Let's align",
        lastMessageAt: new Date("2026-06-10"),
        unreadCount: 1,
        status: "OPEN",
        isFlagged: false,
        attachmentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "t-2",
        orgId: ORG_ID,
        mailboxConnectionId: CONNECTION_ID,
        providerThreadId: "pt-2",
        subject: "Weekly update",
        previewSnippet: "Here is the summary",
        lastMessageAt: new Date("2026-06-09"),
        unreadCount: 0,
        status: "OPEN",
        isFlagged: true,
        attachmentCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listMailboxThreads({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      connectionId: CONNECTION_ID,
      searchQuery: "subject:meeting is:unread has:attachment",
      limit: 10,
    });

    expect(result.threads).toHaveLength(2);
    expect(mockQueryRaw).toHaveBeenCalled();

    // Verify the query raw arguments contained operator parsing values
    const querySql = mockQueryRaw.mock.calls[0][0];
    const queryVals = mockQueryRaw.mock.calls[0].slice(1);
    let reconstructedText = "";
    if (Array.isArray(querySql)) {
      for (let i = 0; i < querySql.length; i++) {
        reconstructedText += querySql[i];
        if (i < queryVals.length) {
          const val = queryVals[i];
          if (val && typeof val === "object" && "text" in val) {
            reconstructedText += val.text;
          } else {
            reconstructedText += String(val);
          }
        }
      }
    } else {
      reconstructedText = String(querySql.text || querySql);
    }

    expect(reconstructedText).toContain(`"isUnread" = true`);
  });

  it("2. decodes search cursors correctly and applies pagination offsets", async () => {
    mockDb.mailboxThread.count.mockResolvedValue(15);
    mockDb.mailboxThread.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `t-${i + 11}`,
        orgId: ORG_ID,
        mailboxConnectionId: CONNECTION_ID,
        providerThreadId: `pt-${i + 11}`,
        subject: `Thread ${i + 11}`,
        previewSnippet: `Preview ${i + 11}`,
        lastMessageAt: new Date(),
        unreadCount: 0,
        status: "OPEN",
        isFlagged: false,
        attachmentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );

    // Base64 encoded SearchCursorPayload {"kind":"search","query":"invoice","offset":10}
    const searchCursor = Buffer.from(
      JSON.stringify({ kind: "search", query: "invoice", offset: 10 })
    ).toString("base64");

    const result = await listMailboxThreads({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      connectionId: CONNECTION_ID,
      searchQuery: "invoice",
      cursor: searchCursor,
      limit: 10,
    });

    // Verify that it only queried database for the page threads (t-11 to t-15)
    expect(mockDb.mailboxThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              id: { in: ["t-11", "t-12", "t-13", "t-14", "t-15"] },
            }),
          ]),
        }),
      })
    );

    expect(result.threads).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });
});
