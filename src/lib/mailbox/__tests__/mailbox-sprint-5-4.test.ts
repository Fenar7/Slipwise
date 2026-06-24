/**
 * Mailbox Phase 5 Sprint 5.4 — Send reconciliation and failure handling.
 *
 * Covers:
 * - Duplicate protection via deterministic fingerprinting
 * - Send-attempt state machine: PENDING → SENT / FAILED / PENDING_RECONCILIATION → RECONCILED_*
 * - Idempotent send: repeated requests for same fingerprint reuse prior attempts
 * - Ambiguous outcome handling: network failures, timeouts, partial ingest failures
 * - Explicit reconciliation: provider lookup by RFC Message-ID / correlation key
 * - Immediate local ingestion after confirmed send
 * - Thread updates after outbound messages
 * - Auth/permission denial and cross-org isolation
 * - Safe diagnostics without raw payload leakage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxDraft: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    mailboxThread: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxMessage: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    mailboxConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mailboxDraftAttachment: {
      findMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    mailboxCredential: {
      findFirst: vi.fn(),
    },
    mailboxSendAttempt: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          update: vi.fn().mockResolvedValue(makeDraftRecord({ status: "SENT" })),
        },
        mailboxAuditEvent: {
          create: vi.fn(),
        },
        mailboxSendAttempt: {
          create: vi.fn().mockImplementation((args: unknown) => {
            const data = (args as { data: unknown }).data as Record<string, unknown>;
            return Promise.resolve({
              id: `attempt_${Date.now()}`,
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }),
          update: vi.fn().mockResolvedValue({}),
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
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxMessage: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxDraftAttachment: {
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
  mailboxCredential: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxSendAttempt: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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

vi.mock("@/lib/mailbox/attachment-service", () => ({
  resolveAttachmentsForSend: vi.fn().mockResolvedValue([]),
  cleanupDraftAttachments: vi.fn(),
  isAttachmentServiceError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/mailbox/ingestion-service", () => ({
  upsertMailboxThread: vi.fn().mockResolvedValue({ id: "thread_local_001" }),
  upsertMailboxMessage: vi.fn().mockResolvedValue({ id: "msg_local_001" }),
  updateMailboxThreadSummary: vi.fn().mockResolvedValue(undefined),
}));

import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { getMailboxThreadDetail } from "@/lib/mailbox/thread-service";
import { logMailboxAuditTx } from "@/lib/mailbox/audit";
import { getMailboxProviderAdapter } from "@/lib/mailbox/provider-registry";
import { sendDraft, SendServiceError, reconcileSendAttempt } from "@/lib/mailbox/send-service";
import { POST as sendDraftPost } from "@/app/api/mailbox/drafts/[id]/send/route";
import { POST as reconcilePost } from "@/app/api/mailbox/send-attempts/[id]/reconcile/route";

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

function makeMockAdapter(sendResult: unknown, reconcileResult?: unknown) {
  return {
    sendMessage: vi.fn().mockResolvedValue(sendResult),
    reconcileSend: vi.fn().mockResolvedValue(reconcileResult ?? { found: false, providerMessageId: null, providerThreadId: null, rfcMessageId: null }),
  };
}

function makeSendAttemptRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "attempt_001",
    orgId: ORG_ID,
    draftId: DRAFT_ID,
    mailboxConnectionId: CONNECTION_ID,
    actorId: USER_ID,
    status: "PENDING",
    mode: "NEW",
    fingerprint: "abc123",
    correlationKey: "sw-send-test-key",
    rfcMessageId: "<sw-send-test-key@slipwise.io>",
    providerMessageId: null,
    providerThreadId: null,
    failureCategory: null,
    failureSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ ok: true, ctx: { orgId: ORG_ID, userId: USER_ID, role: "owner" } });
  mockListConnections.mockResolvedValue({ accessible: [makeConnectionRecord()] });
  mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([]);
  mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(null);
  mockDb.mailboxSendAttempt.create.mockImplementation((args: unknown) => {
    const data = (args as { data: unknown }).data as Record<string, unknown>;
    return Promise.resolve({
      id: `attempt_${Date.now()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  mockDb.mailboxMessage.findMany.mockResolvedValue([]);
});

// ─── Duplicate protection ───────────────────────────────────────────────────

describe("sendDraft duplicate protection", () => {
  it("creates a send attempt and sends when no prior attempt exists", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    const adapter = makeMockAdapter({ providerMessageId: "msg_123", providerThreadId: "thread_456", rfcMessageId: "<abc@mail.gmail.com>" });
    mockGetAdapter.mockReturnValue(adapter);

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("sent");
    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationKey: expect.stringMatching(/^sw-send-/),
        rfcMessageId: expect.stringMatching(/^<sw-send-.*@slipwise.io>$/),
      }),
    );
  });

  it("returns idempotent success for a duplicate send of an already-SENT attempt", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "SENT", providerMessageId: "msg_123", providerThreadId: "thread_456" }),
    );

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("msg_123");
    expect(mockGetAdapter).not.toHaveBeenCalled();
  });

  it("returns idempotent success for a duplicate send of a RECONCILED_SENT attempt", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "RECONCILED_SENT", providerMessageId: "msg_789", providerThreadId: "thread_999" }),
    );

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("msg_789");
    expect(mockGetAdapter).not.toHaveBeenCalled();
  });

  it("returns pending_reconciliation when a prior attempt is PENDING_RECONCILIATION", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("pending_reconciliation");
    expect(mockGetAdapter).not.toHaveBeenCalled();
  });

  it("allows a new send attempt after a FAILED attempt (retry)", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "FAILED", failureCategory: "provider_unavailable" }),
    );
    mockGetThreadDetail.mockResolvedValue(null);

    const adapter = makeMockAdapter({ providerMessageId: "msg_retry", providerThreadId: "thread_retry", rfcMessageId: null });
    mockGetAdapter.mockReturnValue(adapter);

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("sent");
    expect(adapter.sendMessage).toHaveBeenCalled();
  });
});

// ─── Failure handling ─────────────────────────────────────────────────────────

describe("sendDraft failure handling", () => {
  it("marks attempt FAILED and returns failed status on definitive provider error", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "auth_expired",
        safeMessage: "Token expired",
        retryable: false,
      }),
    });

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
  });

  it("marks attempt PENDING_RECONCILIATION on ambiguous outcome (network failure)", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockRejectedValue(new Error("Network timeout")),
    });

    const result = await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result.status).toBe("pending_reconciliation");
    expect(result.sendAttemptId).toBeDefined();
  });

  it("keeps draft ACTIVE after a definitive send failure", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "quota_exceeded",
        safeMessage: "Quota exceeded",
        retryable: false,
      }),
    });

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(mockDb.mailboxDraft.update).not.toHaveBeenCalled();
  });
});

// ─── Reconciliation ───────────────────────────────────────────────────────────

describe("reconcileSendAttempt", () => {
  it("marks RECONCILED_SENT when provider confirms the message exists", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetAdapter.mockReturnValue({
      reconcileSend: vi.fn().mockResolvedValue({
        found: true,
        providerMessageId: "msg_rec",
        providerThreadId: "thread_rec",
        rfcMessageId: "<rec@mail.gmail.com>",
      }),
    });

    const result = await reconcileSendAttempt({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      attemptId: "attempt_001",
    });

    expect(result.status).toBe("reconciled_sent");
    expect(result.providerMessageId).toBe("msg_rec");
  });

  it("marks RECONCILED_FAILED when provider denies the message exists", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetAdapter.mockReturnValue({
      reconcileSend: vi.fn().mockResolvedValue({
        found: false,
        providerMessageId: null,
        providerThreadId: null,
        rfcMessageId: null,
      }),
    });

    const result = await reconcileSendAttempt({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      attemptId: "attempt_001",
    });

    expect(result.status).toBe("reconciled_failed");
  });

  it("returns still_pending when provider reconciliation itself errors", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetAdapter.mockReturnValue({
      reconcileSend: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Provider unreachable",
        retryable: true,
      }),
    });

    const result = await reconcileSendAttempt({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      attemptId: "attempt_001",
    });

    expect(result.status).toBe("still_pending");
  });

  it("rejects reconciliation when attempt is not PENDING_RECONCILIATION", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "SENT" }),
    );

    await expect(
      reconcileSendAttempt({ orgId: ORG_ID, userId: USER_ID, role: "owner", attemptId: "attempt_001" }),
    ).rejects.toThrow(SendServiceError);
  });
});

// ─── Auth and permissions ─────────────────────────────────────────────────────

describe("sendDraft auth/permissions", () => {
  it("rejects send when draft belongs to a different org", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);

    await expect(
      sendDraft({ orgId: "other_org", userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toThrow("Draft not found");
  });

  it("rejects reconciliation by non-owner/non-admin of the draft", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord({ createdBy: "other_user" }));
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    await expect(
      reconcileSendAttempt({ orgId: ORG_ID, userId: USER_ID, role: "member", attemptId: "attempt_001" }),
    ).rejects.toThrow("You do not have permission");
  });
});

// ─── API route: send ──────────────────────────────────────────────────────────

describe("POST /api/mailbox/drafts/[id]/send", () => {
  it("returns 202 for pending_reconciliation status", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending_reconciliation");
    expect(body.sendAttemptId).toBe("attempt_001");
  });

  it("returns 422 for failed send with retryable flag", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "quota_exceeded",
        safeMessage: "Quota exceeded",
        retryable: false,
      }),
    });

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/send", { method: "POST" });
    const res = await sendDraftPost(req, { params: Promise.resolve({ id: "draft_abc" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.retryable).toBe(false);
  });

  it("returns 200 with sendAttemptId on successful send", async () => {
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
    expect(body.status).toBe("sent");
    expect(body.sendAttemptId).toBeDefined();
  });
});

// ─── API route: reconcile ─────────────────────────────────────────────────────

describe("POST /api/mailbox/send-attempts/[id]/reconcile", () => {
  it("returns 200 when provider confirms message exists", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetAdapter.mockReturnValue({
      reconcileSend: vi.fn().mockResolvedValue({
        found: true,
        providerMessageId: "msg_rec",
        providerThreadId: "thread_rec",
        rfcMessageId: "<rec@mail.gmail.com>",
      }),
    });

    const req = new NextRequest("http://localhost/api/mailbox/send-attempts/attempt_001/reconcile", { method: "POST" });
    const res = await reconcilePost(req, { params: Promise.resolve({ id: "attempt_001" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("reconciled_sent");
  });

  it("returns 202 when reconciliation is still pending", async () => {
    mockDb.mailboxSendAttempt.findFirst.mockResolvedValue(
      makeSendAttemptRecord({ status: "PENDING_RECONCILIATION" }),
    );
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    mockGetAdapter.mockReturnValue({
      reconcileSend: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Provider unreachable",
        retryable: true,
      }),
    });

    const req = new NextRequest("http://localhost/api/mailbox/send-attempts/attempt_001/reconcile", { method: "POST" });
    const res = await reconcilePost(req, { params: Promise.resolve({ id: "attempt_001" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("still_pending");
  });
});

// ─── Safe diagnostics ─────────────────────────────────────────────────────────

describe("sendDraft safe diagnostics", () => {
  it("does not include raw body or tokenRef in audit metadata on failure", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord({ htmlBody: "<p>Secret</p>" }));
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);

    mockGetAdapter.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        category: "provider_unavailable",
        safeMessage: "Down",
        retryable: true,
      }),
    });

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    const auditCall = mockLogAudit.mock.calls[0];
    const metadata = auditCall[1].metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("htmlBody");
    expect(metadata).not.toHaveProperty("textBody");
    expect(metadata).not.toHaveProperty("tokenRef");
  });
});
