/**
 * Mailbox Phase 5 Sprint 5.2 — Send, reply, reply-all, and forward tests.
 *
 * Covers:
 * - Send service: permission enforcement, sender identity, draft state transitions
 * - Provider send path: Gmail adapter MIME construction, threading, error mapping
 * - API route: POST /api/mailbox/drafts/[id]/send
 * - Audit: outbound events without raw body content
 * - Error handling: safe provider error mapping, draft preservation on failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxDraft: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxThread: {
      findFirst: vi.fn(),
    },
    mailboxConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    mailboxCredential: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: vi.fn().mockResolvedValue(makeDraftRecord({ status: "SENT" })),
        },
        mailboxAuditEvent: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    }),
  },
}));

import { db } from "@/lib/db";

const mockDb = db as unknown as {
  mailboxDraft: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
  mailboxCredential: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 29 }),
}));

vi.mock("@/lib/mailbox/visibility-service", () => ({
  listMailboxConnectionsForMember: vi.fn(),
}));

vi.mock("@/lib/mailbox/thread-service", () => ({
  getMailboxThreadDetail: vi.fn(),
}));

vi.mock("@/lib/mailbox/audit", () => ({
  logMailboxAuditTx: vi.fn(),
}));

vi.mock("@/lib/mailbox/provider-registry", () => ({
  getMailboxProviderAdapter: vi.fn(),
}));

vi.mock("@/lib/mailbox/sanitize-message-html", () => ({
  sanitizeMessageHtml: vi.fn((html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")),
}));

import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { getMailboxThreadDetail } from "@/lib/mailbox/thread-service";
import { logMailboxAuditTx } from "@/lib/mailbox/audit";
import { getMailboxProviderAdapter } from "@/lib/mailbox/provider-registry";
import { sendDraft, SendServiceError } from "@/lib/mailbox/send-service";
import { POST as sendDraftPost } from "@/app/api/mailbox/drafts/[id]/send/route";

const mockRequireAuth = requireIntegrationMemberRoute as ReturnType<typeof vi.fn>;
const mockListConnections = listMailboxConnectionsForMember as ReturnType<typeof vi.fn>;
const mockGetThreadDetail = getMailboxThreadDetail as ReturnType<typeof vi.fn>;
const mockLogAudit = logMailboxAuditTx as ReturnType<typeof vi.fn>;
const mockGetAdapter = getMailboxProviderAdapter as ReturnType<typeof vi.fn>;

const ORG_ID = "org_123";
const USER_ID = "user_456";
const CONNECTION_ID = "conn_789";
const DRAFT_ID = "draft_abc";
const THREAD_ID = "thread_def";
const PROVIDER_THREAD_ID = "prov_thread_001";

function makeDraftRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DRAFT_ID,
    orgId: ORG_ID,
    mailboxConnectionId: CONNECTION_ID,
    threadId: null as string | null,
    replyToMessageId: null as string | null,
    mode: "NEW",
    status: "ACTIVE",
    fromIdentity: "user@example.com",
    toRecipients: ["recipient@example.com"],
    ccRecipients: [] as string[],
    bccRecipients: [] as string[],
    subject: "Hello",
    htmlBody: "<p>Hello world</p>",
    textBody: null as string | null,
    attachmentRefs: [] as string[],
    createdBy: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAutosavedAt: new Date(),
    ...overrides,
  };
}

function makeConnectionRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONNECTION_ID,
    orgId: ORG_ID,
    provider: "GMAIL" as const,
    emailAddress: "user@example.com",
    tokenRef: "token_ref_001",
    status: "ACTIVE",
    ...overrides,
  };
}

function makeMockAdapter(sendResult: unknown) {
  return {
    sendMessage: vi.fn().mockResolvedValue(sendResult),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ ok: true, ctx: { orgId: ORG_ID, userId: USER_ID, role: "owner" } });
  mockListConnections.mockResolvedValue({ accessible: [makeConnectionRecord()] });
});

// ─── Send service tests ──────────────────────────────────────────────────────

describe("sendDraft service", () => {
  it("sends a new message via the Gmail provider", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    const adapter = makeMockAdapter({
      providerMessageId: "msg_123",
      providerThreadId: "thread_456",
      rfcMessageId: "<abc@mail.gmail.com>",
    });
    mockGetAdapter.mockReturnValue(adapter);

    const result = await sendDraft({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      draftId: DRAFT_ID,
    });

    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        tokenRef: "token_ref_001",
        from: "user@example.com",
        to: ["recipient@example.com"],
        subject: "Hello",
        htmlBody: "<p>Hello world</p>",
        threadContext: null,
      }),
    );
    expect(result.providerMessageId).toBe("msg_123");
  });

  it("sends a reply with correct thread context and In-Reply-To header", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({
        mode: "REPLY",
        threadId: THREAD_ID,
        replyToMessageId: "msg_original",
      }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetThreadDetail.mockResolvedValue({
      threadId: THREAD_ID,
      providerThreadId: PROVIDER_THREAD_ID,
      messages: [
        {
          providerMessageId: "msg_original",
          rfcMessageId: "<original@mail.gmail.com>",
        },
        {
          providerMessageId: "msg_other",
          rfcMessageId: "<other@mail.gmail.com>",
        },
      ],
    });

    const adapter = makeMockAdapter({
      providerMessageId: "msg_reply",
      providerThreadId: PROVIDER_THREAD_ID,
      rfcMessageId: "<reply@mail.gmail.com>",
    });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadContext: expect.objectContaining({
          providerThreadId: PROVIDER_THREAD_ID,
          inReplyToRfcMessageId: "<original@mail.gmail.com>",
          references: expect.arrayContaining(["<original@mail.gmail.com>", "<other@mail.gmail.com>"]),
        }),
      }),
    );
  });

  it("sends a reply-all using the draft's recipient list", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({
        mode: "REPLY_ALL",
        threadId: THREAD_ID,
        toRecipients: ["alice@example.com", "bob@example.com"],
        ccRecipients: ["carol@example.com"],
      }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue({
      providerThreadId: PROVIDER_THREAD_ID,
      messages: [],
    });

    const adapter = makeMockAdapter({ providerMessageId: "msg_ra", providerThreadId: PROVIDER_THREAD_ID, rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    const call = adapter.sendMessage.mock.calls[0][0];
    expect(call.to).toEqual(["alice@example.com", "bob@example.com"]);
    expect(call.cc).toEqual(["carol@example.com"]);
  });

  it("sends a forward with explicit recipients only (no thread auto-population)", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({
        mode: "FORWARD",
        threadId: THREAD_ID,
        toRecipients: ["forward-recipient@example.com"],
        ccRecipients: [],
      }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue({
      providerThreadId: PROVIDER_THREAD_ID,
      messages: [],
    });

    const adapter = makeMockAdapter({ providerMessageId: "msg_fwd", providerThreadId: PROVIDER_THREAD_ID, rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    const call = adapter.sendMessage.mock.calls[0][0];
    expect(call.to).toEqual(["forward-recipient@example.com"]);
    expect(call.cc).toEqual([]);
  });

  it("derives sender identity from the mailbox connection, ignoring draft fromIdentity", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({ fromIdentity: "forged@example.com" }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRecord({ emailAddress: "connection@example.com" }),
    );
    mockGetThreadDetail.mockResolvedValue(null);

    const adapter = makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: "connection@example.com" }),
    );
  });

  it("rejects concurrent send attempts with a CAS guard", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockDb.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirstOrThrow: vi.fn().mockResolvedValue(makeDraftRecord({ status: "SENT" })),
        },
        mailboxAuditEvent: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const adapter = makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(/concurrent send detected/);
  });

  it("rejects send when draft is not ACTIVE", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord({ status: "SENT" }));

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);
  });

  it("rejects send when user does not own the draft and is not admin/owner", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord({ createdBy: "other_user" }));

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "member", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);
  });

  it("rejects send when mailbox connection is inaccessible", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockListConnections.mockResolvedValue({ accessible: [] });

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);
  });

  it("rejects send when mailbox connection is not ACTIVE", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord({ status: "DISCONNECTED" }));

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);
  });

  it("rejects send when mailbox connection has no tokenRef", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord({ tokenRef: null }));

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);
  });

  it("maps provider auth_expired to 403", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "auth_expired",
        safeMessage: "Token expired",
        retryable: true,
      }),
    });

    try {
      await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SendServiceError);
      expect((e as SendServiceError).statusCode).toBe(403);
    }
  });

  it("maps provider rate_limited to 429", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "rate_limited",
        safeMessage: "Too many requests",
        retryable: true,
      }),
    });

    try {
      await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SendServiceError);
      expect((e as SendServiceError).statusCode).toBe(429);
    }
  });

  it("maps provider provider_unavailable to 503", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Provider unavailable",
        retryable: true,
      }),
    });

    try {
      await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SendServiceError);
      expect((e as SendServiceError).statusCode).toBe(503);
    }
  });

  it("transitions draft to SENT on success and writes audit event", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue(
      makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null }),
    );

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(mockDb.$transaction).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("preserves draft as ACTIVE on provider failure", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Down",
        retryable: true,
      }),
    });

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow(SendServiceError);

    // Draft update should NOT have been called outside the transaction
    expect(mockDb.mailboxDraft.update).not.toHaveBeenCalled();
    expect(mockDb.mailboxDraft.updateMany).not.toHaveBeenCalled();
  });

  it("sanitizes outbound htmlBody before provider send", async () => {
    const { sanitizeMessageHtml } = await import("@/lib/mailbox/sanitize-message-html");
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({ htmlBody: "<script>alert('xss')</script><p>Hello</p>" }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    const adapter = makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(sanitizeMessageHtml).toHaveBeenCalledWith("<script>alert('xss')</script><p>Hello</p>");
    const call = adapter.sendMessage.mock.calls[0][0];
    expect(call.htmlBody).not.toContain("<script>");
  });

  it("does not include raw body content in audit metadata", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord({ htmlBody: "<p>Secret content</p>" }));
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue(
      makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null }),
    );

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    const auditCall = mockLogAudit.mock.calls[0];
    const metadata = auditCall[1].metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("body");
    expect(metadata).not.toHaveProperty("htmlBody");
    expect(metadata).not.toHaveProperty("textBody");
  });

  it("uses MESSAGE_REPLIED audit action for REPLY and REPLY_ALL", async () => {
    for (const mode of ["REPLY", "REPLY_ALL"] as const) {
      vi.clearAllMocks();
      mockDb.mailboxDraft.findFirst.mockResolvedValue(
        makeDraftRecord({ mode, threadId: THREAD_ID, replyToMessageId: "msg_1" }),
      );
      mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
      mockGetThreadDetail.mockResolvedValue({
        providerThreadId: PROVIDER_THREAD_ID,
        messages: [{ providerMessageId: "msg_1", rfcMessageId: "<a@b>" }],
      });
      mockGetAdapter.mockReturnValue(
        makeMockAdapter({ providerMessageId: "msg_new", providerThreadId: PROVIDER_THREAD_ID, rfcMessageId: null }),
      );

      await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

      const auditCall = mockLogAudit.mock.calls[0];
      expect(auditCall[1].action).toBe("MESSAGE_REPLIED");
    }
  });

  it("uses MESSAGE_FORWARDED audit action for FORWARD", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(
      makeDraftRecord({ mode: "FORWARD", threadId: THREAD_ID }),
    );
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue({
      providerThreadId: PROVIDER_THREAD_ID,
      messages: [],
    });
    mockGetAdapter.mockReturnValue(
      makeMockAdapter({ providerMessageId: "msg_fwd", providerThreadId: PROVIDER_THREAD_ID, rfcMessageId: null }),
    );

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    const auditCall = mockLogAudit.mock.calls[0];
    expect(auditCall[1].action).toBe("MESSAGE_FORWARDED");
  });
});

// ─── API route tests ──────────────────────────────────────────────────────────

describe("POST /api/mailbox/drafts/[id]/send", () => {
  it("returns 200 with provider message/thread IDs on success", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);
    mockGetAdapter.mockReturnValue(
      makeMockAdapter({ providerMessageId: "msg_1", providerThreadId: "t1", rfcMessageId: null }),
    );

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providerMessageId).toBe("msg_1");
  });

  it("returns 403 for inaccessible connection", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockListConnections.mockResolvedValue({ accessible: [] });

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not accessible/);
  });

  it("returns 404 when draft does not exist", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate-limited", async () => {
    const { rateLimitByOrg } = await import("@/lib/rate-limit");
    (rateLimitByOrg as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, remaining: 0 });

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(429);
  });
});
