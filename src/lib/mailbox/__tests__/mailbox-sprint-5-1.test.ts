/**
 * Mailbox Phase 5 Sprint 5.1 — Composer backend and draft persistence tests.
 *
 * Covers:
 * - Draft create/restore service (canonical deduplication, thread-bound modes)
 * - Autosave service (idempotent updates, stale-write guard)
 * - Discard service (status transition, idempotency, audit)
 * - Restore service (canonical draft resolution)
 * - Permission enforcement (org scope, mailbox access, ownership)
 * - Audit event emission for create/discard
 * - API route contracts (POST /api/mailbox/drafts, PATCH /api/mailbox/drafts/[id], DELETE /api/mailbox/drafts/[id])
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxDraft: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          create: vi.fn(),
          update: vi.fn(),
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
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
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
  $transaction: ReturnType<typeof vi.fn>;
};

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 119 }),
  RATE_LIMITS: { api: { maxRequests: 120, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/visibility-service", () => ({
  listMailboxConnectionsForMember: vi.fn(),
}));

import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
const mockListConnections = listMailboxConnectionsForMember as unknown as ReturnType<typeof vi.fn>;

import {
  createOrRestoreDraft,
  autosaveDraft,
  discardDraft,
  getDraft,
  restoreDraft,
  listActiveDrafts,
  DraftServiceError,
} from "@/lib/mailbox/draft-service";

import {
  toMailboxDraftReadShape,
} from "@/lib/mailbox/read-shapes";

import { GET as getDraftsRoute, POST as postDraftsRoute } from "@/app/api/mailbox/drafts/route";
import { GET as getDraftRoute, PATCH as patchDraftRoute, DELETE as deleteDraftRoute } from "@/app/api/mailbox/drafts/[id]/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const CONN_1 = "conn-001";
const CONN_2 = "conn-002";
const THREAD_1 = "thread-001";
const DRAFT_1 = "draft-001";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConnectionListItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_1,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-1",
    emailAddress: "billing@example.com",
    displayName: "Billing",
    status: "ACTIVE" as const,
    visibilityPolicy: "org_shared",
    ...overrides,
  };
}

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
    id: THREAD_1,
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
    preArchiveStatus: null,
    assigneeId: null,
    isFlagged: false,
    primaryLinkSummary: null,
    previewSnippet: "Please find the invoice attached",
    attachmentCount: 0,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    updatedAt: new Date("2026-05-10T10:00:00Z"),
    ...overrides,
  };
}

function makeMessageRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    orgId: ORG_A,
    threadId: THREAD_1,
    providerMessageId: "gmail-msg-1",
    rfcMessageId: "<msg1@example.com>",
    direction: "inbound" as const,
    from: { email: "client@example.com", displayName: "Client" },
    to: [{ email: "billing@example.com", displayName: "Billing Team" }],
    cc: [],
    bcc: [],
    subject: "Invoice #123",
    htmlBody: "<p>Please find the invoice attached</p>",
    textBody: "Please find the invoice attached",
    snippet: "Please find the invoice attached",
    sentAt: new Date("2026-05-10T10:00:00Z"),
    receivedAt: new Date("2026-05-10T10:00:00Z"),
    attachmentCount: 0,
    providerMetadata: null,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    updatedAt: new Date("2026-05-10T10:00:00Z"),
    ...overrides,
  };
}

function makeDraftRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DRAFT_1,
    orgId: ORG_A,
    mailboxConnectionId: CONN_1,
    threadId: null,
    mode: "NEW" as const,
    fromIdentity: "billing@example.com",
    toRecipients: [],
    ccRecipients: [],
    bccRecipients: [],
    subject: "",
    htmlBody: "",
    textBody: null,
    attachmentRefs: [],
    status: "ACTIVE" as const,
    lastAutosavedAt: new Date(),
    createdBy: USER_A,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    updatedAt: new Date("2026-05-10T10:00:00Z"),
    ...overrides,
  };
}

function makeAuthContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    ctx: {
      orgId: ORG_A,
      userId: USER_A,
      role: "owner" as const,
      org: { id: ORG_A },
      user: { id: USER_A },
    },
    ...overrides,
  };
}

// ─── Service: createOrRestoreDraft ────────────────────────────────────────────

describe("createOrRestoreDraft", () => {
  it("creates a new draft for new compose when none exists", async () => {
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());

    // Capture transaction create
    let createdData: unknown;
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
            createdData = data;
            return { id: DRAFT_1, ...data, createdAt: new Date(), updatedAt: new Date() };
          }),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const result = await createOrRestoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "NEW",
    });

    expect(result.created).toBe(true);
    expect(result.draft.mode).toBe("NEW");
    expect(result.draft.mailboxConnectionId).toBe(CONN_1);
    expect(result.draft.createdBy).toBe(USER_A);
    expect(result.draft.status).toBe("ACTIVE");
    expect(createdData).toBeDefined();
  });

  it("restores existing active draft instead of duplicating for same context", async () => {
    const existing = makeDraftRecord({ id: "existing-draft" });
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(existing);

    const result = await createOrRestoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "NEW",
    });

    expect(result.created).toBe(false);
    expect(result.draft.id).toBe("existing-draft");
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("derives reply defaults from thread context", async () => {
    const thread = makeThreadRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...thread,
      messages: [makeMessageRecord()],
    });

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
            return { id: DRAFT_1, ...data, createdAt: new Date(), updatedAt: new Date() };
          }),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const result = await createOrRestoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "REPLY",
      threadId: THREAD_1,
    });

    expect(result.created).toBe(true);
    expect(result.draft.mode).toBe("REPLY");
    expect(result.draft.subject).toBe("Re: Invoice #123");
    expect(result.draft.to).toEqual(["client@example.com"]);
    expect(result.draft.threadId).toBe(THREAD_1);
  });

  it("derives forward defaults from thread context", async () => {
    const thread = makeThreadRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      ...thread,
      messages: [makeMessageRecord()],
    });

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
            return { id: DRAFT_1, ...data, createdAt: new Date(), updatedAt: new Date() };
          }),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const result = await createOrRestoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "FORWARD",
      threadId: THREAD_1,
    });

    expect(result.created).toBe(true);
    expect(result.draft.mode).toBe("FORWARD");
    expect(result.draft.subject).toBe("Fwd: Invoice #123");
    expect(result.draft.to).toEqual([]);
  });

  it("rejects when user lacks mailbox access", async () => {
    mockListConnections.mockResolvedValue({ accessible: [], restricted: [] });

    await expect(
      createOrRestoreDraft({
        orgId: ORG_A,
        userId: USER_A,
        role: "member",
        mailboxConnectionId: CONN_1,
        mode: "NEW",
      }),
    ).rejects.toThrow(DraftServiceError);
  });
});

// ─── Service: autosaveDraft ───────────────────────────────────────────────────

describe("autosaveDraft", () => {
  it("updates the same draft without creating duplicates", async () => {
    const draft = makeDraftRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);
    mockDb.mailboxDraft.update.mockResolvedValue({
      ...draft,
      subject: "Updated subject",
      updatedAt: new Date("2026-05-10T11:00:00Z"),
    });

    const result = await autosaveDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
      subject: "Updated subject",
    });

    expect(result?.stale).toBe(false);
    expect(result?.draft.subject).toBe("Updated subject");
    expect(mockDb.mailboxDraft.update).toHaveBeenCalledTimes(1);
  });

  it("rejects stale write when lastKnownUpdatedAt does not match", async () => {
    const draft = makeDraftRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    const result = await autosaveDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
      lastKnownUpdatedAt: "2026-05-09T10:00:00Z",
      subject: "Updated subject",
    });

    expect(result?.stale).toBe(true);
    expect(mockDb.mailboxDraft.update).not.toHaveBeenCalled();
  });

  it("prevents autosave on non-active draft", async () => {
    const draft = makeDraftRecord({ status: "DISCARDED" });
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    await expect(
      autosaveDraft({
        orgId: ORG_A,
        userId: USER_A,
        role: "owner",
        draftId: DRAFT_1,
        subject: "Updated subject",
      }),
    ).rejects.toThrow(DraftServiceError);
  });
});

// ─── Service: discardDraft ────────────────────────────────────────────────────

describe("discardDraft", () => {
  it("transitions active draft to discarded", async () => {
    const draft = makeDraftRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);
    mockDb.mailboxDraft.update.mockResolvedValue({ ...draft, status: "DISCARDED" });

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          update: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
            return { ...draft, ...data };
          }),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const result = await discardDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
    });

    expect(result.success).toBe(true);
    expect(result.draftId).toBe(DRAFT_1);
  });

  it("is idempotent when draft is already discarded", async () => {
    const draft = makeDraftRecord({ status: "DISCARDED" });
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    const result = await discardDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
    });

    expect(result.success).toBe(true);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

// ─── Service: getDraft / restoreDraft ───────────────────────────────────────────

describe("getDraft", () => {
  it("returns draft when user has access and is creator", async () => {
    const draft = makeDraftRecord();
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    const result = await getDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(DRAFT_1);
  });

  it("returns null when draft belongs to different org", async () => {
    const draft = makeDraftRecord({ orgId: ORG_B });
    mockDb.mailboxDraft.findFirst.mockImplementation(async ({ where }: { where: { id: string; orgId: string } }) => {
      if (where.orgId !== draft.orgId) return null;
      return draft;
    });

    const result = await getDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      draftId: DRAFT_1,
    });

    expect(result).toBeNull();
  });

  it("returns null when user is not creator and not admin", async () => {
    const draft = makeDraftRecord({ createdBy: USER_B });
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    const result = await getDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
      draftId: DRAFT_1,
    });

    expect(result).toBeNull();
  });
});

describe("restoreDraft", () => {
  it("returns the canonical active draft for a compose context", async () => {
    const draft = makeDraftRecord({ mode: "REPLY", threadId: THREAD_1 });
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draft);

    const result = await restoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "REPLY",
      threadId: THREAD_1,
    });

    expect(result.draft).not.toBeNull();
    expect(result.draft?.id).toBe(DRAFT_1);
    expect(result.draft?.mode).toBe("REPLY");
  });

  it("returns null when no active draft exists for the context", async () => {
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);

    const result = await restoreDraft({
      orgId: ORG_A,
      userId: USER_A,
      role: "owner",
      mailboxConnectionId: CONN_1,
      mode: "NEW",
    });

    expect(result.draft).toBeNull();
  });
});

// ─── Service: listActiveDrafts ────────────────────────────────────────────────

describe("listActiveDrafts", () => {
  it("returns only drafts for accessible connections", async () => {
    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem({ id: CONN_1 })],
      restricted: [makeConnectionListItem({ id: CONN_2 })],
    });
    mockDb.mailboxDraft.findMany.mockResolvedValue([
      makeDraftRecord({ id: "draft-a", mailboxConnectionId: CONN_1 }),
      makeDraftRecord({ id: "draft-b", mailboxConnectionId: CONN_2 }),
    ]);

    const result = await listActiveDrafts({
      orgId: ORG_A,
      userId: USER_A,
      role: "member",
    });

    // The service queries with connectionIds from accessible list, so findMany
    // result is returned directly in this test. In reality, Prisma filters by
    // the connectionIds we pass. We verify the where clause used the accessible list.
    expect(mockDb.mailboxDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mailboxConnectionId: { in: [CONN_1] },
        }),
      }),
    );
  });
});

// ─── Read shape mapper ────────────────────────────────────────────────────────

describe("toMailboxDraftReadShape", () => {
  it("maps a domain draft record to a read shape", () => {
    const record = makeDraftRecord({
      id: "draft-read-1",
      toRecipients: ["a@example.com", "b@example.com"],
      attachmentRefs: ["ref-1", "ref-2"],
      lastAutosavedAt: new Date("2026-05-10T12:00:00Z"),
    });

    const shape = toMailboxDraftReadShape(record as unknown as import("@/lib/mailbox/domain-types").MailboxDraftRecord);

    expect(shape.id).toBe("draft-read-1");
    expect(shape.to).toEqual(["a@example.com", "b@example.com"]);
    expect(shape.attachmentRefs).toEqual(["ref-1", "ref-2"]);
    expect(shape.lastAutosavedAt).toBe("2026-05-10T12:00:00.000Z");
    expect(shape.status).toBe("ACTIVE");
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

describe("POST /api/mailbox/drafts", () => {
  it("creates a draft and returns it with created flag", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    (requireIntegrationMemberRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAuthContext());

    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(null);
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          create: vi.fn().mockResolvedValue(makeDraftRecord({ id: "api-draft-1" })),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const req = new NextRequest("http://localhost/api/mailbox/drafts", {
      method: "POST",
      body: JSON.stringify({
        mailboxConnectionId: CONN_1,
        mode: "NEW",
      }),
    });

    const res = await postDraftsRoute(req);
    const body = (await res.json()) as { draft: { id: string }; created: boolean };

    expect(res.status).toBe(200);
    expect(body.created).toBe(true);
    expect(body.draft.id).toBe("api-draft-1");
  });

  it("returns 400 for invalid mode", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    (requireIntegrationMemberRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAuthContext());

    const req = new NextRequest("http://localhost/api/mailbox/drafts", {
      method: "POST",
      body: JSON.stringify({
        mailboxConnectionId: CONN_1,
        mode: "INVALID",
      }),
    });

    const res = await postDraftsRoute(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/mailbox/drafts/[id]", () => {
  it("autosaves draft and returns updated shape", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    (requireIntegrationMemberRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAuthContext());

    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraft.update.mockResolvedValue({
      ...makeDraftRecord(),
      subject: "Updated",
      updatedAt: new Date("2026-05-10T11:00:00Z"),
    });

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft-001", {
      method: "PATCH",
      body: JSON.stringify({ subject: "Updated" }),
    });

    const res = await patchDraftRoute(req, { params: Promise.resolve({ id: "draft-001" }) });
    const body = (await res.json()) as { draft: { subject: string }; stale: boolean };

    expect(res.status).toBe(200);
    expect(body.stale).toBe(false);
    expect(body.draft.subject).toBe("Updated");
  });
});

describe("DELETE /api/mailbox/drafts/[id]", () => {
  it("discards draft and returns success", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    (requireIntegrationMemberRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAuthContext());

    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          update: vi.fn().mockResolvedValue({ ...makeDraftRecord(), status: "DISCARDED" }),
        },
        mailboxAuditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const req = new NextRequest("http://localhost/api/mailbox/drafts/draft-001", {
      method: "DELETE",
    });

    const res = await deleteDraftRoute(req, { params: Promise.resolve({ id: "draft-001" }) });
    const body = (await res.json()) as { success: boolean; draftId: string };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.draftId).toBe("draft-001");
  });
});

describe("GET /api/mailbox/drafts", () => {
  it("lists active drafts for the caller", async () => {
    const { requireIntegrationMemberRoute } = await import("@/app/api/integrations/_auth");
    (requireIntegrationMemberRoute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeAuthContext());

    mockListConnections.mockResolvedValue({
      accessible: [makeConnectionListItem()],
      restricted: [],
    });
    mockDb.mailboxDraft.findMany.mockResolvedValue([makeDraftRecord({ id: "draft-a" }), makeDraftRecord({ id: "draft-b" })]);

    const req = new NextRequest("http://localhost/api/mailbox/drafts", { method: "GET" });
    const res = await getDraftsRoute(req);
    const body = (await res.json()) as { drafts: unknown[] };

    expect(res.status).toBe(200);
    expect(body.drafts).toHaveLength(2);
  });
});
