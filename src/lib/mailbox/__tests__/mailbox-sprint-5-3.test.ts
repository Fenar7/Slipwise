/**
 * Mailbox Phase 5 Sprint 5.3 — Attachment handling tests.
 *
 * Covers:
 * - Attachment service: stage, remove, resolve, cleanup, download
 * - Provider send path: Gmail adapter MIME construction with attachments
 * - Send service: attachment resolution and passing to adapter
 * - Draft discard: attachment cleanup
 * - API routes: POST upload, DELETE remove, GET download
 * - Access control: org-scoped, draft ownership
 * - Failure states: invalid file, missing storage ref, oversized file
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
    mailboxDraftAttachment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    mailboxAttachment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    mailboxThread: {
      findFirst: vi.fn(),
    },
    mailboxMessage: {
      findFirst: vi.fn(),
    },
    mailboxConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mailboxCredential: {
      findFirst: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxDraft: {
          update: vi.fn().mockResolvedValue(makeDraftRecord({ status: "SENT" })),
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
  mailboxDraftAttachment: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  mailboxAttachment: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxMessage: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxCredential: {
    findFirst: ReturnType<typeof vi.fn>;
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
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 29 }),
}));

vi.mock("@/lib/mailbox/credential-store", () => ({
  readMailboxCredential: vi.fn().mockResolvedValue({
    accessToken: "test_access_token",
    refreshToken: "test_refresh_token",
    expiresAtMs: Date.now() + 3600000,
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
  }),
  ensureValidAccessToken: vi.fn().mockResolvedValue("test_access_token"),
  revokeMailboxCredential: vi.fn(),
}));

vi.mock("../credential-store", () => ({
  readMailboxCredential: vi.fn().mockResolvedValue({
    accessToken: "test_access_token",
    refreshToken: "test_refresh_token",
    expiresAtMs: Date.now() + 3600000,
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
  }),
  ensureValidAccessToken: vi.fn().mockResolvedValue("test_access_token"),
  revokeMailboxCredential: vi.fn(),
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

vi.mock("@/lib/storage/upload-server", () => ({
  uploadFileServer: vi.fn(),
  deleteFileServer: vi.fn(),
  downloadFileServer: vi.fn(),
  getSignedUrlServer: vi.fn(),
}));

import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { getMailboxThreadDetail } from "@/lib/mailbox/thread-service";
import { getMailboxProviderAdapter } from "@/lib/mailbox/provider-registry";
import {
  uploadFileServer,
  deleteFileServer,
  downloadFileServer,
  getSignedUrlServer,
} from "@/lib/storage/upload-server";

import {
  stageDraftAttachment,
  removeDraftAttachment,
  resolveAttachmentsForSend,
  cleanupDraftAttachments,
  getAttachmentDownloadUrl,
  getMailboxAttachmentDownload,
  AttachmentServiceError,
} from "@/lib/mailbox/attachment-service";

import { sendDraft, SendServiceError } from "@/lib/mailbox/send-service";
import { discardDraft } from "@/lib/mailbox/draft-service";

import { POST as uploadAttachmentPost } from "@/app/api/mailbox/drafts/[id]/attachments/route";
import { DELETE as removeAttachmentDelete } from "@/app/api/mailbox/drafts/[id]/attachments/[ref]/route";
import { GET as downloadAttachmentGet } from "@/app/api/mailbox/attachments/[id]/download/route";
import { GET as downloadMailboxAttachmentGet } from "@/app/api/mailbox/attachments/message/[id]/download/route";

const mockRequireAuth = requireIntegrationMemberRoute as ReturnType<typeof vi.fn>;
const mockListConnections = listMailboxConnectionsForMember as ReturnType<typeof vi.fn>;
const mockGetThreadDetail = getMailboxThreadDetail as ReturnType<typeof vi.fn>;
const mockGetAdapter = getMailboxProviderAdapter as ReturnType<typeof vi.fn>;
const mockUploadFile = uploadFileServer as ReturnType<typeof vi.fn>;
const mockDeleteFile = deleteFileServer as ReturnType<typeof vi.fn>;
const mockDownloadFile = downloadFileServer as ReturnType<typeof vi.fn>;
const mockGetSignedUrl = getSignedUrlServer as ReturnType<typeof vi.fn>;

const ORG_ID = "org_123";
const USER_ID = "user_456";
const CONNECTION_ID = "conn_789";
const DRAFT_ID = "draft_abc";
const ATTACHMENT_ID = "att_xyz";

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
    draftAttachments: [] as unknown[],
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

function makeAttachmentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    orgId: ORG_ID,
    draftId: DRAFT_ID,
    filename: "report.pdf",
    mimeType: "application/pdf",
    size: 12345,
    isInline: false,
    storageRef: `${ORG_ID}/mailbox/drafts/${DRAFT_ID}/${ATTACHMENT_ID}_report.pdf`,
    createdAt: new Date(),
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

// ─── Attachment service: stage ────────────────────────────────────────────────

describe("stageDraftAttachment", () => {
  it("creates a draft attachment record and uploads to storage", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.create.mockResolvedValue(makeAttachmentRecord());
    mockUploadFile.mockResolvedValue({ storageKey: "key_001" });

    const result = await stageDraftAttachment({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      draftId: DRAFT_ID,
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 12345,
      isInline: false,
      fileBuffer: Buffer.from("pdf-content"),
    });

    expect(result.attachmentId).toBe(ATTACHMENT_ID);
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockDb.mailboxDraftAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTACHMENT_ID, orgId: ORG_ID },
        data: { storageRef: "key_001" },
      }),
    );
  });

  it("rejects files exceeding 25MB", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());

    await expect(
      stageDraftAttachment({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        draftId: DRAFT_ID,
        filename: "huge.zip",
        mimeType: "application/zip",
        size: 26 * 1024 * 1024,
        isInline: false,
        fileBuffer: Buffer.from(""),
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });

  it("rejects blocked executable MIME types", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());

    await expect(
      stageDraftAttachment({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        draftId: DRAFT_ID,
        filename: "malicious.exe",
        mimeType: "application/x-msdownload",
        size: 1024,
        isInline: false,
        fileBuffer: Buffer.from(""),
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });

  it("rolls back DB record on upload failure", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.create.mockResolvedValue(makeAttachmentRecord());
    mockUploadFile.mockRejectedValue(new Error("Storage unreachable"));
    mockDb.mailboxDraftAttachment.delete.mockResolvedValue({});

    await expect(
      stageDraftAttachment({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        draftId: DRAFT_ID,
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 12345,
        isInline: false,
        fileBuffer: Buffer.from("pdf-content"),
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);

    expect(mockDb.mailboxDraftAttachment.delete).toHaveBeenCalled();
  });
});

// ─── Attachment service: remove ───────────────────────────────────────────────

describe("removeDraftAttachment", () => {
  it("deletes storage and DB record", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(makeAttachmentRecord());

    await removeDraftAttachment({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      draftId: DRAFT_ID,
      attachmentId: ATTACHMENT_ID,
    });

    expect(mockDeleteFile).toHaveBeenCalledWith("attachments", expect.any(String));
    expect(mockDb.mailboxDraftAttachment.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTACHMENT_ID, orgId: ORG_ID },
      }),
    );
  });

  it("succeeds even if storage delete fails", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(makeAttachmentRecord());
    mockDeleteFile.mockRejectedValue(new Error("Storage error"));

    await expect(
      removeDraftAttachment({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        draftId: DRAFT_ID,
        attachmentId: ATTACHMENT_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws 404 when attachment does not exist", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(null);

    await expect(
      removeDraftAttachment({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        draftId: DRAFT_ID,
        attachmentId: ATTACHMENT_ID,
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });
});

// ─── Attachment service: resolve for send ─────────────────────────────────────

describe("resolveAttachmentsForSend", () => {
  it("returns base64-encoded attachments for send", async () => {
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord(),
    ]);
    mockDownloadFile.mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]));

    const results = await resolveAttachmentsForSend(ORG_ID, DRAFT_ID);

    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe("report.pdf");
    expect(results[0].contentBase64).toBe(Buffer.from([1, 2, 3, 4, 5]).toString("base64"));
  });

  it("throws when an attachment has a pending storage ref", async () => {
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord({ storageRef: "pending" }),
    ]);

    await expect(resolveAttachmentsForSend(ORG_ID, DRAFT_ID)).rejects.toBeInstanceOf(
      AttachmentServiceError,
    );
  });
});

// ─── Attachment service: cleanup ────────────────────────────────────────────────

describe("cleanupDraftAttachments", () => {
  it("removes all attachments for a draft", async () => {
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord(),
      makeAttachmentRecord({ id: "att_002", filename: "image.png" }),
    ]);

    await cleanupDraftAttachments(ORG_ID, DRAFT_ID);

    expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    expect(mockDb.mailboxDraftAttachment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_ID, draftId: DRAFT_ID } }),
    );
  });
});

// ─── Attachment service: download ─────────────────────────────────────────────

describe("getAttachmentDownloadUrl", () => {
  it("returns a signed URL for a valid attachment", async () => {
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(makeAttachmentRecord());
    mockGetSignedUrl.mockResolvedValue("https://signed.url/file");

    const result = await getAttachmentDownloadUrl({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      attachmentId: ATTACHMENT_ID,
    });

    expect(result.signedUrl).toBe("https://signed.url/file");
    expect(result.filename).toBe("report.pdf");
  });

  it("throws 404 when attachment is not found", async () => {
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(null);

    await expect(
      getAttachmentDownloadUrl({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        attachmentId: ATTACHMENT_ID,
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });
});

// ─── Send service with attachments ──────────────────────────────────────────

describe("sendDraft with attachments", () => {
  it("resolves attachments and passes them to the provider adapter", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord({ filename: "doc.pdf", mimeType: "application/pdf", size: 1000, isInline: false }),
    ]);
    mockDownloadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

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
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: "doc.pdf",
            mimeType: "application/pdf",
            size: 1000,
            isInline: false,
            contentBase64: expect.any(String),
          }),
        ]),
      }),
    );
    expect(result.providerMessageId).toBe("msg_123");
  });

  it("fails send when attachment resolution fails", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord({ storageRef: "pending" }),
    ]);

    await expect(
      sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID }),
    ).rejects.toBeInstanceOf(SendServiceError);
  });

  it("cleans up attachments after successful send", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRecord());
    mockGetThreadDetail.mockResolvedValue(null);
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([]);

    const adapter = makeMockAdapter({
      providerMessageId: "msg_123",
      providerThreadId: "thread_456",
      rfcMessageId: null,
    });
    mockGetAdapter.mockReturnValue(adapter);

    await sendDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(mockDb.mailboxDraftAttachment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_ID, draftId: DRAFT_ID } }),
    );
  });
});

// ─── Draft discard with attachments ─────────────────────────────────────────

describe("discardDraft with attachments", () => {
  it("cleans up staged attachments on discard", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.findMany.mockResolvedValue([
      makeAttachmentRecord(),
    ]);

    const result = await discardDraft({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      draftId: DRAFT_ID,
    });

    expect(result.success).toBe(true);
    expect(mockDeleteFile).toHaveBeenCalled();
    expect(mockDb.mailboxDraftAttachment.deleteMany).toHaveBeenCalled();
  });
});

// ─── API route: upload attachment ─────────────────────────────────────────────

describe("POST /api/mailbox/drafts/[id]/attachments", () => {
  it("uploads an attachment via multipart form", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.create.mockResolvedValue(makeAttachmentRecord());
    mockUploadFile.mockResolvedValue({ storageKey: "key_001" });

    const formData = new FormData();
    formData.append("file", new File(["pdf-data"], "report.pdf", { type: "application/pdf" }));
    formData.append("isInline", "false");

    const request = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/attachments", {
      method: "POST",
      body: formData,
    });

    const response = await uploadAttachmentPost(request, { params: Promise.resolve({ id: DRAFT_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attachmentId).toBe(ATTACHMENT_ID);
  });

  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("isInline", "false");

    const request = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/attachments", {
      method: "POST",
      body: formData,
    });

    const response = await uploadAttachmentPost(request, { params: Promise.resolve({ id: DRAFT_ID }) });
    expect(response.status).toBe(400);
  });
});

// ─── API route: remove attachment ────────────────────────────────────────────

describe("DELETE /api/mailbox/drafts/[id]/attachments/[ref]", () => {
  it("removes an attachment", async () => {
    mockDb.mailboxDraft.findFirst.mockResolvedValue(makeDraftRecord());
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(makeAttachmentRecord());

    const request = new NextRequest("http://localhost/api/mailbox/drafts/draft_abc/attachments/att_xyz", {
      method: "DELETE",
    });

    const response = await removeAttachmentDelete(request, { params: Promise.resolve({ id: DRAFT_ID, ref: ATTACHMENT_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── API route: download attachment ───────────────────────────────────────────

describe("GET /api/mailbox/attachments/[id]/download", () => {
  it("returns a signed download URL", async () => {
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(makeAttachmentRecord());
    mockGetSignedUrl.mockResolvedValue("https://signed.url/download");

    const request = new NextRequest("http://localhost/api/mailbox/attachments/att_xyz/download");

    const response = await downloadAttachmentGet(request, { params: Promise.resolve({ id: ATTACHMENT_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signedUrl).toBe("https://signed.url/download");
    expect(body.filename).toBe("report.pdf");
  });

  it("returns 404 for unknown attachment", async () => {
    mockDb.mailboxDraftAttachment.findFirst.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/mailbox/attachments/unknown/download");

    const response = await downloadAttachmentGet(request, { params: Promise.resolve({ id: "unknown" }) });
    expect(response.status).toBe(404);
  });
});

// ─── Draft read shape: attachments are first-class state ──────────────────────

import { getDraft, restoreDraft } from "@/lib/mailbox/draft-service";

describe("draft read shape with attachments", () => {
  it("getDraft returns staged attachment metadata", async () => {
    const draftWithAttachments = makeDraftRecord({
      draftAttachments: [
        makeAttachmentRecord({ id: "att_1", filename: "doc.pdf", mimeType: "application/pdf", size: 5000, isInline: false }),
        makeAttachmentRecord({ id: "att_2", filename: "logo.png", mimeType: "image/png", size: 2000, isInline: true }),
      ],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draftWithAttachments);

    const result = await getDraft({ orgId: ORG_ID, userId: USER_ID, role: "owner", draftId: DRAFT_ID });

    expect(result).not.toBeNull();
    expect(result!.attachments).toHaveLength(2);
    expect(result!.attachments[0].filename).toBe("doc.pdf");
    expect(result!.attachments[0].isInline).toBe(false);
    expect(result!.attachments[1].filename).toBe("logo.png");
    expect(result!.attachments[1].isInline).toBe(true);
    // attachmentRefs stays as a compatibility field
    expect(result!.attachmentRefs).toEqual([]);
  });

  it("restoreDraft returns staged attachment metadata", async () => {
    const draftWithAttachments = makeDraftRecord({
      draftAttachments: [
        makeAttachmentRecord({ id: "att_1", filename: "doc.pdf", mimeType: "application/pdf", size: 5000, isInline: false }),
      ],
    });
    mockDb.mailboxDraft.findFirst.mockResolvedValue(draftWithAttachments);

    const result = await restoreDraft({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      mailboxConnectionId: CONNECTION_ID,
      mode: "NEW",
    });

    expect(result.draft).not.toBeNull();
    expect(result.draft!.attachments).toHaveLength(1);
    expect(result.draft!.attachments[0].filename).toBe("doc.pdf");
    expect(result.draft!.attachments[0].size).toBe(5000);
  });
});

// ─── Mailbox attachment download ─────────────────────────────────────────────

describe("getMailboxAttachmentDownload", () => {
  it("returns a signed URL for a cached mailbox attachment", async () => {
    mockDb.mailboxAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      messageId: "msg_001",
      providerAttachmentId: "provider_att_001",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 12345,
      isInline: false,
      storageRef: `${ORG_ID}/mailbox/messages/msg_001/${ATTACHMENT_ID}_invoice.pdf`,
      message: { threadId: "thread_001", orgId: ORG_ID, providerMessageId: "pm_001" },
    });
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      id: "thread_001",
      mailboxConnectionId: CONNECTION_ID,
    });
    mockGetSignedUrl.mockResolvedValue("https://signed.url/invoice");

    const result = await getMailboxAttachmentDownload({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "owner",
      attachmentId: ATTACHMENT_ID,
    });

    expect(result.kind).toBe("signed-url");
    if (result.kind === "signed-url") {
      expect(result.signedUrl).toBe("https://signed.url/invoice");
      expect(result.filename).toBe("invoice.pdf");
    }
  });

  it("throws 404 when mailbox attachment is not found", async () => {
    mockDb.mailboxAttachment.findFirst.mockResolvedValue(null);

    await expect(
      getMailboxAttachmentDownload({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        attachmentId: ATTACHMENT_ID,
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });

  it("throws 404 for cross-org attachment access", async () => {
    mockDb.mailboxAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      messageId: "msg_001",
      providerAttachmentId: "provider_att_001",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 12345,
      isInline: false,
      storageRef: "some-ref",
      message: { threadId: "thread_001", orgId: "other_org", providerMessageId: "pm_001" },
    });

    await expect(
      getMailboxAttachmentDownload({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "owner",
        attachmentId: ATTACHMENT_ID,
      }),
    ).rejects.toBeInstanceOf(AttachmentServiceError);
  });
});

describe("GET /api/mailbox/attachments/message/[id]/download", () => {
  it("returns a signed download URL for a real mailbox attachment", async () => {
    mockDb.mailboxAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      messageId: "msg_001",
      providerAttachmentId: "provider_att_001",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 12345,
      isInline: false,
      storageRef: `${ORG_ID}/mailbox/messages/msg_001/${ATTACHMENT_ID}_invoice.pdf`,
      message: { threadId: "thread_001", orgId: ORG_ID, providerMessageId: "pm_001" },
    });
    mockDb.mailboxThread.findFirst.mockResolvedValue({
      id: "thread_001",
      mailboxConnectionId: CONNECTION_ID,
    });
    mockGetSignedUrl.mockResolvedValue("https://signed.url/invoice");

    const request = new NextRequest("http://localhost/api/mailbox/attachments/message/att_xyz/download");

    const response = await downloadMailboxAttachmentGet(request, { params: Promise.resolve({ id: ATTACHMENT_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signedUrl).toBe("https://signed.url/invoice");
    expect(body.filename).toBe("invoice.pdf");
  });

  it("returns 404 for unknown mailbox attachment", async () => {
    mockDb.mailboxAttachment.findFirst.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/mailbox/attachments/message/unknown/download");

    const response = await downloadMailboxAttachmentGet(request, { params: Promise.resolve({ id: "unknown" }) });
    expect(response.status).toBe(404);
  });
});

// ─── Gmail MIME: inline attachment structure ────────────────────────────────

describe("Gmail MIME inline attachments", () => {
  beforeEach(() => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      id: "token_ref_001",
      orgId: ORG_ID,
      encryptedPayload: "v2:iv:ciphertext:tag",
    });
  });

  it("sendMessage encodes multipart/related with Content-ID for inline attachments", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "msg_123", threadId: "thread_456" }),
    });
    global.fetch = fetchSpy;

    const { gmailProviderAdapter: adapter } = await import("@/lib/mailbox/gmail-provider");

    const sendResult = await adapter.sendMessage({
      orgId: ORG_ID,
      tokenRef: "token_ref_001",
      from: "from@example.com",
      to: ["to@example.com"],
      subject: "Test",
      htmlBody: "<p>Hello</p>",
      attachments: [
        { filename: "logo.png", mimeType: "image/png", size: 100, isInline: true, contentBase64: "aW1n" },
        { filename: "doc.pdf", mimeType: "application/pdf", size: 200, isInline: false, contentBase64: "cGRm" },
      ],
    });

    // Ensure send succeeded; if it returned a provider error, print it for debugging.
    expect(sendResult).toBeDefined();
    if ("category" in (sendResult as object)) {
      expect.fail(`sendMessage returned error: ${(sendResult as { safeMessage: string }).safeMessage}`);
    }

    const call = fetchSpy.mock.calls.find((c) => {
      const url = typeof c[0] === "string" ? c[0] : "";
      return url.includes("googleapis.com");
    });
    expect(call).toBeDefined();

    const body = JSON.parse((call[1] as { body: string }).body) as { raw: string };
    const raw = body.raw;
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");

    // Outer should be multipart/mixed
    expect(decoded).toContain("Content-Type: multipart/mixed");
    // Should contain multipart/related for HTML + inline
    expect(decoded).toContain("Content-Type: multipart/related");
    // Inline attachment should have Content-ID
    expect(decoded).toContain("Content-ID: <slipwise-inline-logo.png-0>");
    expect(decoded).toContain('Content-Disposition: inline; filename="logo.png"');
    // File attachment should be attachment disposition
    expect(decoded).toContain('Content-Disposition: attachment; filename="doc.pdf"');
  });

  it("sendMessage does not use multipart/related when no inline attachments", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "msg_123", threadId: "thread_456" }),
    });
    global.fetch = fetchSpy;

    const { gmailProviderAdapter: adapter } = await import("@/lib/mailbox/gmail-provider");

    await adapter.sendMessage({
      orgId: ORG_ID,
      tokenRef: "token_ref_001",
      from: "from@example.com",
      to: ["to@example.com"],
      subject: "Test",
      htmlBody: "<p>Hello</p>",
      attachments: [
        { filename: "doc.pdf", mimeType: "application/pdf", size: 200, isInline: false, contentBase64: "cGRm" },
      ],
    });

    const call = fetchSpy.mock.calls.find((c) => {
      const url = typeof c[0] === "string" ? c[0] : "";
      return url.includes("googleapis.com");
    });
    expect(call).toBeDefined();

    const body = JSON.parse((call[1] as { body: string }).body) as { raw: string };
    const raw = body.raw;
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");

    // Should be multipart/mixed without multipart/related
    expect(decoded).toContain("Content-Type: multipart/mixed");
    expect(decoded).not.toContain("Content-Type: multipart/related");
    expect(decoded).not.toContain("Content-ID:");
    expect(decoded).toContain('Content-Disposition: attachment; filename="doc.pdf"');
  });
});
