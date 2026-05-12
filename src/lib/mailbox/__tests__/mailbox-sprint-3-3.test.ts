/**
 * Mailbox Phase 3 Sprint 3.3 — Thread/message normalization and participant
 * extraction tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxThread: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxMessage: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    mailboxAttachment: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

import {
  normalizeParticipant,
  normalizeParticipants,
  deduplicateParticipants,
  classifyMessageDirection,
  extractParticipantsFromMessage,
  deriveThreadParticipants,
} from "@/lib/mailbox/participant-service";

import {
  MAILBOX_SNIPPET_MAX_LENGTH,
  normalizeSnippet,
  deriveThreadLastMessageAt,
  computeThreadAttachmentCount,
  deriveThreadPreviewSnippet,
} from "@/lib/mailbox/normalization-service";

import {
  upsertMailboxThread,
  upsertMailboxMessage,
  upsertMailboxAttachment,
} from "@/lib/mailbox/ingestion-service";

import {
  toMailboxThreadReadShape,
  toMailboxMessageReadShape,
  toMailboxAttachmentReadShape,
} from "@/lib/mailbox/read-shapes";

import type { MailboxMessageRecord } from "@/lib/mailbox/domain-types";

const mockDb = db as unknown as {
  mailboxThread: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxMessage: {
    upsert: ReturnType<typeof vi.fn>;
  };
  mailboxAttachment: {
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe("Sprint 3.3 — Participant normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeParticipant", () => {
    it("normalizes email and trims display name", () => {
      const result = normalizeParticipant({
        email: "  Alice@Example.COM ",
        displayName: "  Alice Smith  ",
      });
      expect(result).toEqual({ email: "alice@example.com", displayName: "Alice Smith" });
    });

    it("returns null for missing email", () => {
      expect(normalizeParticipant({ displayName: "Bob" })).toBeNull();
    });

    it("returns null for invalid email shape", () => {
      expect(normalizeParticipant({ email: "not-an-email" })).toBeNull();
      expect(normalizeParticipant({ email: "@nodomain.com" })).toBeNull();
      expect(normalizeParticipant({ email: "no-local@" })).toBeNull();
    });

    it("converts empty displayName to null", () => {
      const result = normalizeParticipant({ email: "a@b.com", displayName: "   " });
      expect(result).toEqual({ email: "a@b.com", displayName: null });
    });

    it("handles unknown object keys gracefully", () => {
      const result = normalizeParticipant({ email: "c@d.com", name: "Charlie" });
      expect(result).toEqual({ email: "c@d.com", displayName: null });
    });
  });

  describe("normalizeParticipants", () => {
    it("filters out nulls and normalizes each", () => {
      const result = normalizeParticipants([
        { email: "A@Example.com", displayName: "A" },
        { email: "invalid" },
        { email: "B@Example.com", displayName: "B" },
        null,
      ]);
      expect(result).toEqual([
        { email: "a@example.com", displayName: "A" },
        { email: "b@example.com", displayName: "B" },
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(normalizeParticipants([])).toEqual([]);
    });
  });

  describe("deduplicateParticipants", () => {
    it("keeps first-seen and preserves order", () => {
      const result = deduplicateParticipants([
        { email: "a@example.com", displayName: "Alice" },
        { email: "b@example.com", displayName: "Bob" },
        { email: "a@example.com", displayName: "Alice Duplicate" },
      ]);
      expect(result).toEqual([
        { email: "a@example.com", displayName: "Alice" },
        { email: "b@example.com", displayName: "Bob" },
      ]);
    });
  });

  describe("classifyMessageDirection", () => {
    it("returns outbound when sender matches mailbox", () => {
      expect(classifyMessageDirection("ops@example.com", "ops@example.com")).toBe("outbound");
    });

    it("returns inbound when sender differs from mailbox", () => {
      expect(classifyMessageDirection("ops@example.com", "customer@example.com")).toBe("inbound");
    });

    it("returns inbound when mailbox email is invalid", () => {
      expect(classifyMessageDirection("not-an-email", "a@b.com")).toBe("inbound");
    });

    it("is case-insensitive", () => {
      expect(classifyMessageDirection("OPS@EXAMPLE.COM", "ops@example.com")).toBe("outbound");
    });
  });

  describe("extractParticipantsFromMessage", () => {
    it("collects sender, to, cc, bcc and deduplicates", () => {
      const message = makeMessageRecord({
        from: { email: "sender@example.com", displayName: "Sender" },
        to: [{ email: "to@example.com", displayName: "To" }],
        cc: [{ email: "to@example.com", displayName: "To" }],
        bcc: [{ email: "bcc@example.com", displayName: "Bcc" }],
      });
      const result = extractParticipantsFromMessage(message);
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.email)).toEqual([
        "sender@example.com",
        "to@example.com",
        "bcc@example.com",
      ]);
    });
  });

  describe("deriveThreadParticipants", () => {
    it("collects unique participants across multiple messages", () => {
      const messages: MailboxMessageRecord[] = [
        makeMessageRecord({
          from: { email: "a@example.com", displayName: "A" },
          to: [{ email: "b@example.com", displayName: "B" }],
        }),
        makeMessageRecord({
          from: { email: "b@example.com", displayName: "B" },
          to: [{ email: "a@example.com", displayName: "A" }, { email: "c@example.com", displayName: "C" }],
        }),
      ];
      const result = deriveThreadParticipants(messages);
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.email)).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    });
  });
});

describe("Sprint 3.3 — Snippet and thread summary normalization", () => {
  describe("normalizeSnippet", () => {
    it("collapses whitespace and trims", () => {
      expect(normalizeSnippet("  hello   \n\t  world  ")).toBe("hello world");
    });

    it("strips HTML tags", () => {
      expect(normalizeSnippet("<p>hello</p> world")).toBe("hello world");
    });

    it("truncates to max length with ellipsis", () => {
      const long = "a".repeat(MAILBOX_SNIPPET_MAX_LENGTH + 10);
      const result = normalizeSnippet(long);
      expect(result.length).toBe(MAILBOX_SNIPPET_MAX_LENGTH);
      expect(result.endsWith("…")).toBe(true);
    });

    it("does not add ellipsis when under max length", () => {
      expect(normalizeSnippet("short")).toBe("short");
    });
  });

  describe("deriveThreadLastMessageAt", () => {
    it("returns the latest sentAt", () => {
      const d1 = new Date("2024-01-01");
      const d2 = new Date("2024-01-05");
      const d3 = new Date("2024-01-03");
      const messages = [
        makeMessageRecord({ sentAt: d1 }),
        makeMessageRecord({ sentAt: d2 }),
        makeMessageRecord({ sentAt: d3 }),
      ];
      expect(deriveThreadLastMessageAt(messages, d1)).toEqual(d2);
    });

    it("falls back when no messages", () => {
      const fallback = new Date("2024-01-01");
      expect(deriveThreadLastMessageAt([], fallback)).toEqual(fallback);
    });
  });

  describe("computeThreadAttachmentCount", () => {
    it("sums attachment counts", () => {
      const messages = [
        makeMessageRecord({ attachmentCount: 2 }),
        makeMessageRecord({ attachmentCount: 3 }),
        makeMessageRecord({ attachmentCount: 0 }),
      ];
      expect(computeThreadAttachmentCount(messages)).toBe(5);
    });
  });

  describe("deriveThreadPreviewSnippet", () => {
    it("returns snippet from the most recent message", () => {
      const messages = [
        makeMessageRecord({ sentAt: new Date("2024-01-01"), snippet: "older" }),
        makeMessageRecord({ sentAt: new Date("2024-01-05"), snippet: "newer" }),
      ];
      expect(deriveThreadPreviewSnippet(messages)).toBe("newer");
    });

    it("returns empty string when no messages", () => {
      expect(deriveThreadPreviewSnippet([])).toBe("");
    });
  });
});

describe("Sprint 3.3 — Ingestion service normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts thread with provider metadata stripped from core fields", async () => {
    mockDb.mailboxThread.upsert.mockResolvedValue(makeThreadRow());

    const envelope = {
      providerThreadId: "gmail-thread-1",
      subject: "Test",
      lastMessageAt: new Date().toISOString(),
      unreadCount: 1,
      participants: [{ email: "a@example.com", displayName: "A" }],
      providerMetadata: { gmailHistoryId: "123" },
    };

    const result = await upsertMailboxThread({
      orgId: "org-1",
      mailboxConnectionId: "conn-1",
      envelope,
    });

    expect(mockDb.mailboxThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({
          providerMetadata: expect.anything(),
        }),
      }),
    );
    expect(result.providerThreadId).toBe("gmail-thread-1");
  });

  it("classifies direction and normalizes participants on message upsert", async () => {
    mockDb.mailboxMessage.upsert.mockResolvedValue(
      makeMessageRow({
        direction: "outbound",
        from: { email: "ops@example.com", displayName: null },
        to: [{ email: "customer@example.com", displayName: "Customer" }],
      }),
    );

    const envelope = {
      providerMessageId: "gmail-msg-1",
      rfcMessageId: "<msg@example.com>",
      direction: "inbound" as const,
      from: { email: "ops@example.com", displayName: "Ops" },
      to: [{ email: "customer@example.com", displayName: "Customer" }],
      cc: [],
      bcc: [],
      subject: "Hello",
      snippet: "  Hello   world  ",
      sentAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      attachmentCount: 0,
      providerMetadata: {},
      htmlBody: "<p>Hello</p>",
      textBody: "Hello",
    };

    const result = await upsertMailboxMessage({
      orgId: "org-1",
      threadId: "thread-1",
      envelope,
      mailboxEmail: "ops@example.com",
    });

    expect(mockDb.mailboxMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          direction: "outbound",
          from: { email: "ops@example.com", displayName: "Ops" },
          to: [{ email: "customer@example.com", displayName: "Customer" }],
          snippet: "Hello world",
        }),
      }),
    );
    expect(result.direction).toBe("outbound");
  });

  it("normalizes snippet during message upsert", async () => {
    mockDb.mailboxMessage.upsert.mockResolvedValue(makeMessageRow());

    const envelope = {
      providerMessageId: "gmail-msg-1",
      rfcMessageId: null,
      direction: "inbound" as const,
      from: { email: "a@example.com", displayName: "A" },
      to: [{ email: "b@example.com", displayName: "B" }],
      cc: [],
      bcc: [],
      subject: "Test",
      snippet: "<div>  Hello   \n  world  </div>",
      sentAt: new Date().toISOString(),
      receivedAt: null,
      attachmentCount: 0,
      providerMetadata: {},
      htmlBody: "<div>Hello</div>",
      textBody: "Hello",
    };

    await upsertMailboxMessage({
      orgId: "org-1",
      threadId: "thread-1",
      envelope,
      mailboxEmail: "b@example.com",
    });

    const upsertCall = mockDb.mailboxMessage.upsert.mock.calls[0][0];
    expect(upsertCall.create.snippet).toBe("Hello world");
  });

  it("upserts attachment with correct fields", async () => {
    mockDb.mailboxAttachment.upsert.mockResolvedValue(makeAttachmentRow());

    const envelope = {
      providerAttachmentId: "gmail-attach-1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 2048,
      isInline: false,
    };

    const result = await upsertMailboxAttachment({ messageId: "msg-1", envelope });

    expect(mockDb.mailboxAttachment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          size: 2048,
          isInline: false,
        }),
      }),
    );
    expect(result.providerAttachmentId).toBe("gmail-attach-1");
  });
});

describe("Sprint 3.3 — Read shape mappers", () => {
  it("maps thread record to read shape with normalized participants", () => {
    const record = makeThreadRow({
      participantsSummary: [
        { email: "a@example.com", displayName: "A" },
        { email: "b@example.com", displayName: "B" },
      ],
    });
    const shape = toMailboxThreadReadShape(record);
    expect(shape.id).toBe(record.id);
    expect(shape.participants).toEqual([
      { email: "a@example.com", displayName: "A" },
      { email: "b@example.com", displayName: "B" },
    ]);
    expect(shape.lastMessageAt).toBe(record.lastMessageAt.toISOString());
  });

  it("maps message record to read shape with participant arrays", () => {
    const record = makeMessageRow({
      from: { email: "sender@example.com", displayName: "Sender" },
      to: [{ email: "to@example.com", displayName: "To" }],
      cc: [],
      bcc: [{ email: "bcc@example.com", displayName: "Bcc" }],
    });
    const shape = toMailboxMessageReadShape(record);
    expect(shape.from).toEqual({ email: "sender@example.com", displayName: "Sender" });
    expect(shape.to).toEqual([{ email: "to@example.com", displayName: "To" }]);
    expect(shape.cc).toEqual([]);
    expect(shape.bcc).toEqual([{ email: "bcc@example.com", displayName: "Bcc" }]);
    expect(shape.sentAt).toBe(record.sentAt.toISOString());
  });

  it("maps attachment record to read shape", () => {
    const record = makeAttachmentRow();
    const shape = toMailboxAttachmentReadShape(record);
    expect(shape.id).toBe(record.id);
    expect(shape.filename).toBe("test.pdf");
    expect(shape.mimeType).toBe("application/pdf");
  });

  it("handles malformed participantsSummary gracefully in thread mapper", () => {
    const record = makeThreadRow({ participantsSummary: { notAnArray: true } });
    const shape = toMailboxThreadReadShape(record);
    expect(shape.participants).toEqual([]);
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMessageRecord(overrides: Partial<MailboxMessageRecord> = {}): MailboxMessageRecord {
  return {
    id: "msg-1",
    orgId: "org-1",
    threadId: "thread-1",
    providerMessageId: "gmail-msg-1",
    rfcMessageId: null,
    direction: "inbound",
    from: { email: "a@example.com", displayName: "A" },
    to: [{ email: "b@example.com", displayName: "B" }],
    cc: [],
    bcc: [],
    subject: "Test",
    htmlBody: "<p>Hello</p>",
    textBody: "Hello",
    snippet: "Hello",
    sentAt: new Date(),
    receivedAt: null,
    attachmentCount: 0,
    providerMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeThreadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "thread-1",
    orgId: "org-1",
    mailboxConnectionId: "conn-1",
    providerThreadId: "gmail-thread-1",
    subject: "Test",
    participantsSummary: [],
    lastMessageAt: new Date(),
    unreadCount: 0,
    status: "OPEN" as const,
    assigneeId: null,
    isFlagged: false,
    primaryLinkSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    orgId: "org-1",
    threadId: "thread-1",
    providerMessageId: "gmail-msg-1",
    rfcMessageId: null,
    direction: "inbound" as const,
    from: { email: "a@example.com" },
    to: [],
    cc: [],
    bcc: [],
    subject: "Test",
    snippet: "Hello",
    htmlBody: "<p>Hello</p>",
    textBody: "Hello",
    sentAt: new Date(),
    receivedAt: null,
    attachmentCount: 0,
    providerMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "attach-1",
    messageId: "msg-1",
    providerAttachmentId: "gmail-attach-1",
    filename: "test.pdf",
    mimeType: "application/pdf",
    size: 1024,
    isInline: false,
    storageRef: null,
    ...overrides,
  };
}
