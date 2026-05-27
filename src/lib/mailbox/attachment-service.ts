import "server-only";

/**
 * Mailbox attachment service boundary.
 *
 * Handles:
 * - Staging outbound attachments against drafts (upload + persistence)
 * - Resolving staged attachments for the send path
 * - Secure download with org-scoped access control
 * - Cleanup on draft discard or send
 *
 * Rules:
 * - All file data goes through the configured storage provider (Supabase/S3).
 * - attachmentRefs stored on MailboxDraft are opaque storage keys, not file content.
 * - Access is always verified against org + draft ownership.
 * - Orphaned rows are a known seam; a future garbage-collector should sweep them.
 */

import { db } from "@/lib/db";
import {
  uploadFileServer,
  deleteFileServer,
  downloadFileServer,
  getSignedUrlServer,
} from "@/lib/storage/upload-server";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AttachmentServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "AttachmentServiceError";
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ATTACHMENT_BUCKET = "attachments" as const;

/** Gmail's documented upload limit for non-Google-Workspace accounts. */
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** Blocked MIME type prefixes for security. */
const BLOCKED_MIME_PREFIXES = [
  "application/x-ms",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-sh",
  "application/x-csh",
  "application/x-bsh",
  "text/x-script",
];

// ─── Input types ──────────────────────────────────────────────────────────────

export interface StageDraftAttachmentInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  fileBuffer: Buffer;
}

export interface RemoveDraftAttachmentInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
  attachmentId: string;
}

export interface ResolveAttachmentForSendResult {
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentBase64: string;
}

export interface GetAttachmentDownloadInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  attachmentId: string;
}

export interface GetMailboxAttachmentDownloadInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  attachmentId: string;
}

// ─── Permission helpers ─────────────────────────────────────────────────────────

async function assertCanAccessDraft(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  draftId: string,
): Promise<void> {
  const draft = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
    select: { createdBy: true, mailboxConnectionId: true },
  });

  if (!draft) {
    throw new AttachmentServiceError("Draft not found", 404);
  }

  const isCreator = draft.createdBy === userId;
  const isAdmin = role === "owner" || role === "admin";
  if (!isCreator && !isAdmin) {
    throw new AttachmentServiceError("You do not have permission to access this draft", 403);
  }

  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  if (!accessible.find((c) => c.id === draft.mailboxConnectionId)) {
    throw new AttachmentServiceError("Mailbox connection not accessible", 403);
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────────

function validateAttachmentInput(
  filename: string,
  mimeType: string,
  size: number,
): void {
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AttachmentServiceError(
      `Attachment exceeds maximum size of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB`,
      413,
    );
  }

  if (size <= 0) {
    throw new AttachmentServiceError("Attachment size must be greater than zero", 400);
  }

  const lowerMime = mimeType.toLowerCase();
  for (const blocked of BLOCKED_MIME_PREFIXES) {
    if (lowerMime.startsWith(blocked)) {
      throw new AttachmentServiceError("File type not allowed", 400);
    }
  }

  if (!filename.trim()) {
    throw new AttachmentServiceError("Filename is required", 400);
  }
}

function generateStoragePath(orgId: string, draftId: string, attachmentId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${orgId}/mailbox/drafts/${draftId}/${attachmentId}_${sanitized}`;
}

// ─── Core: stage attachment ─────────────────────────────────────────────────

export async function stageDraftAttachment(
  input: StageDraftAttachmentInput,
): Promise<{ attachmentId: string; storageKey: string }> {
  const { orgId, draftId, filename, mimeType, size, isInline, fileBuffer } = input;

  await assertCanAccessDraft(orgId, input.userId, input.role, draftId);
  validateAttachmentInput(filename, mimeType, size);

  const record = await db.mailboxDraftAttachment.create({
    data: {
      orgId,
      draftId,
      filename,
      mimeType,
      size,
      isInline,
      storageRef: "pending",
    },
  });

  const storagePath = generateStoragePath(orgId, draftId, record.id, filename);

  try {
    const uploadResult = await uploadFileServer(
      ATTACHMENT_BUCKET,
      storagePath,
      fileBuffer,
      mimeType,
    );

    await db.mailboxDraftAttachment.update({
      where: { id: record.id, orgId },
      data: { storageRef: uploadResult.storageKey },
    });

    return { attachmentId: record.id, storageKey: uploadResult.storageKey };
  } catch (err) {
    try {
      await db.mailboxDraftAttachment.delete({ where: { id: record.id, orgId } });
    } catch {
      // Ignore cleanup failure
    }
    throw new AttachmentServiceError(
      `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      500,
    );
  }
}

// ─── Core: remove attachment ─────────────────────────────────────────────────

export async function removeDraftAttachment(
  input: RemoveDraftAttachmentInput,
): Promise<void> {
  const { orgId, draftId, attachmentId } = input;

  await assertCanAccessDraft(orgId, input.userId, input.role, draftId);

  const record = await db.mailboxDraftAttachment.findFirst({
    where: { id: attachmentId, orgId, draftId },
  });

  if (!record) {
    throw new AttachmentServiceError("Attachment not found", 404);
  }

  if (record.storageRef && record.storageRef !== "pending") {
    try {
      await deleteFileServer(ATTACHMENT_BUCKET, record.storageRef);
    } catch {
      // Best-effort
    }
  }

  await db.mailboxDraftAttachment.delete({
    where: { id: attachmentId, orgId },
  });
}

// ─── Core: resolve attachments for send ───────────────────────────────────────

export async function resolveAttachmentsForSend(
  orgId: string,
  draftId: string,
): Promise<ResolveAttachmentForSendResult[]> {
  const records = await db.mailboxDraftAttachment.findMany({
    where: { orgId, draftId },
  });

  const results: ResolveAttachmentForSendResult[] = [];

  for (const record of records) {
    if (!record.storageRef || record.storageRef === "pending") {
      throw new AttachmentServiceError(
        `Attachment ${record.id} has no valid storage reference`,
        500,
      );
    }

    try {
      const bytes = await downloadFileServer(ATTACHMENT_BUCKET, record.storageRef);
      results.push({
        filename: record.filename,
        mimeType: record.mimeType,
        size: record.size,
        isInline: record.isInline,
        contentBase64: Buffer.from(bytes).toString("base64"),
      });
    } catch (err) {
      throw new AttachmentServiceError(
        `Failed to resolve attachment ${record.id}: ${err instanceof Error ? err.message : "Unknown error"}`,
        500,
      );
    }
  }

  return results;
}

// ─── Core: cleanup all attachments for a draft ─────────────────────────────────

export async function cleanupDraftAttachments(
  orgId: string,
  draftId: string,
): Promise<void> {
  const records = await db.mailboxDraftAttachment.findMany({
    where: { orgId, draftId },
  });

  for (const record of records) {
    if (record.storageRef && record.storageRef !== "pending") {
      try {
        await deleteFileServer(ATTACHMENT_BUCKET, record.storageRef);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  await db.mailboxDraftAttachment.deleteMany({
    where: { orgId, draftId },
  });
}

// ─── Core: get attachment download ────────────────────────────────────────────

export async function getAttachmentDownloadUrl(
  input: GetAttachmentDownloadInput,
): Promise<{ signedUrl: string; filename: string; mimeType: string }> {
  const { orgId, attachmentId } = input;

  const record = await db.mailboxDraftAttachment.findFirst({
    where: { id: attachmentId, orgId },
  });

  if (!record) {
    throw new AttachmentServiceError("Attachment not found", 404);
  }

  await assertCanAccessDraft(orgId, input.userId, input.role, record.draftId);

  if (!record.storageRef || record.storageRef === "pending") {
    throw new AttachmentServiceError("Attachment storage reference is missing", 500);
  }

  const signedUrl = await getSignedUrlServer(
    ATTACHMENT_BUCKET,
    record.storageRef,
    300,
    { download: record.filename },
  );

  return { signedUrl, filename: record.filename, mimeType: record.mimeType };
}

// ─── Core: get real mailbox attachment download ─────────────────────────────────

async function assertCanAccessThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<void> {
  const thread = await db.mailboxThread.findFirst({
    where: { id: threadId, orgId },
    select: { mailboxConnectionId: true },
  });
  if (!thread) {
    throw new AttachmentServiceError("Thread not found", 404);
  }
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  if (!accessible.find((c) => c.id === thread.mailboxConnectionId)) {
    throw new AttachmentServiceError("Mailbox connection not accessible", 403);
  }
}

export async function getMailboxAttachmentDownloadUrl(
  input: GetMailboxAttachmentDownloadInput,
): Promise<{ signedUrl: string; filename: string; mimeType: string }> {
  const { orgId, attachmentId } = input;

  const record = await db.mailboxAttachment.findFirst({
    where: { id: attachmentId },
    include: { message: { select: { threadId: true, orgId: true, providerMessageId: true } } },
  });

  if (!record) {
    throw new AttachmentServiceError("Attachment not found", 404);
  }

  if (record.message.orgId !== orgId) {
    throw new AttachmentServiceError("Attachment not found", 404);
  }

  await assertCanAccessThread(orgId, input.userId, input.role, record.message.threadId);

  // If the attachment is cached locally, serve a signed URL directly.
  if (record.storageRef) {
    const signedUrl = await getSignedUrlServer(
      ATTACHMENT_BUCKET,
      record.storageRef,
      300,
      { download: record.filename },
    );
    return { signedUrl, filename: record.filename, mimeType: record.mimeType };
  }

  // If not cached, fall back to provider fetch.
  // This requires the parent message's provider info and the connection token.
  const message = await db.mailboxMessage.findFirst({
    where: { id: record.messageId, orgId },
    include: { thread: { select: { mailboxConnectionId: true } } },
  });
  if (!message || !message.thread) {
    throw new AttachmentServiceError("Parent message not found", 404);
  }

  const connection = await db.mailboxConnection.findFirst({
    where: { id: message.thread.mailboxConnectionId, orgId },
    select: { tokenRef: true, provider: true },
  });
  if (!connection || !connection.tokenRef) {
    throw new AttachmentServiceError("Mailbox connection not available for attachment fetch", 403);
  }

  const adapter = getMailboxProviderAdapter(connection.provider);
  const fetchResult = await adapter.fetchAttachment({
    orgId,
    tokenRef: connection.tokenRef,
    providerMessageId: message.providerMessageId,
    providerAttachmentId: record.providerAttachmentId,
  });

  if (isMailboxProviderError(fetchResult)) {
    throw new AttachmentServiceError(fetchResult.safeMessage, 502);
  }

  // Cache the fetched bytes so future downloads are local.
  const cachePath = `${orgId}/mailbox/messages/${message.id}/${attachmentId}_${record.filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  try {
    await uploadFileServer(ATTACHMENT_BUCKET, cachePath, fetchResult.bytes, record.mimeType);
    await db.mailboxAttachment.update({
      where: { id: attachmentId },
      data: { storageRef: cachePath },
    });
  } catch {
    // Best-effort cache; if it fails, still return the bytes via a temporary signed URL
    // In production, a data URI or inline response would be more appropriate here.
  }

  // After caching (or attempting to), try to serve a signed URL.
  const signedUrl = await getSignedUrlServer(
    ATTACHMENT_BUCKET,
    cachePath,
    300,
    { download: record.filename },
  );
  return { signedUrl, filename: record.filename, mimeType: record.mimeType };
}

// ─── Type guard ─────────────────────────────────────────────────────────────────

export function isAttachmentServiceError(err: unknown): err is AttachmentServiceError {
  return err instanceof AttachmentServiceError;
}
