import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { getMailboxConnection } from "./connection-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { getMailboxThreadDetail } from "./thread-service";
import { toMailboxDraftReadShape } from "./read-shapes";
import type {
  MailboxDraftListEntryReadShape,
  MailboxDraftReadShape,
  MailboxProviderDraftDetailReadShape,
  MailboxProviderDraftReadShape,
} from "./read-shapes";
import type { MailboxDraftEnvelope } from "./provider-contracts";
import { isMailboxProviderError } from "./provider-contracts";
import { logMailboxAuditTx } from "./audit";
import type { MailboxDraftMode, MailboxDraftStatus } from "./domain-types";
import { cleanupDraftAttachments } from "./attachment-service";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class DraftServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "DraftServiceError";
  }
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  mailboxConnectionId: string;
  mode: MailboxDraftMode;
  /** threadId for reply/reply-all/forward; null for new compose */
  threadId?: string | null;
  /** messageId being replied to / forwarded. Part of canonical draft identity for thread-bound modes. */
  replyToMessageId?: string | null;
  fromIdentity?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface AutosaveDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
  /** ISO string of the last known updatedAt. Used for stale-write guard. */
  lastKnownUpdatedAt?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface DiscardDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
}

export interface GetDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
}

export interface RestoreDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  mailboxConnectionId: string;
  mode: MailboxDraftMode;
  threadId?: string | null;
  replyToMessageId?: string | null;
}

// ─── Permission helpers ───────────────────────────────────────────────────────

async function assertCanAccessConnection(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  connectionId: string,
): Promise<void> {
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const connection = accessible.find((c) => c.id === connectionId);
  if (!connection) {
    throw new DraftServiceError("Mailbox connection not accessible", 403);
  }
  // Members with org_shared policy get read_only access; drafting requires full.
  const isReadOnly = role === "member" && connection.visibilityPolicy === "org_shared";
  if (isReadOnly) {
    throw new DraftServiceError("You do not have permission to compose in this mailbox", 403);
  }
}

async function assertCanMutateDraft(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  draftId: string,
): Promise<{ draft: Prisma.MailboxDraftGetPayload<object>; connectionId: string }> {
  const draft = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
  });

  if (!draft) {
    throw new DraftServiceError("Draft not found", 404);
  }

  // Ownership guard: only the creator or an admin can mutate.
  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new DraftServiceError("You do not have permission to modify this draft", 403);
  }

  await assertCanAccessConnection(orgId, userId, role, draft.mailboxConnectionId);

  return { draft, connectionId: draft.mailboxConnectionId };
}

// ─── Initialization helpers ───────────────────────────────────────────────────

function deriveReplySubject(originalSubject: string): string {
  const prefix = "Re: ";
  if (originalSubject.startsWith(prefix)) return originalSubject;
  return prefix + originalSubject;
}

function deriveForwardSubject(originalSubject: string): string {
  const prefix = "Fwd: ";
  if (originalSubject.startsWith(prefix)) return originalSubject;
  return prefix + originalSubject;
}


/**
 * Build default draft fields for reply/reply-all/forward from thread context.
 * Returns null if the thread is not accessible or does not exist.
 *
 * @param fromIdentity — the sending mailbox email address. Used to exclude the
 *   sender from reply-all recipient buckets so drafts are never self-addressed.
 */
async function buildThreadDerivedDefaults(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  connectionId: string,
  mode: MailboxDraftMode,
  threadId: string,
  fromIdentity: string,
): Promise<{
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
} | null> {
  const detail = await getMailboxThreadDetail(orgId, userId, role, threadId);
  if (!detail) return null;

  // Verify the thread belongs to the requested connection
  if (detail.mailboxConnectionId !== connectionId) {
    return null;
  }

  const messages = detail.messages;
  if (messages.length === 0) return null;

  const lastMessage = messages[messages.length - 1];
  const fromEmail = lastMessage.from?.email ?? "";
  const allTo = lastMessage.to.map((p) => p.email);
  const allCc = lastMessage.cc.map((p) => p.email);
  const selfEmailLower = fromIdentity.trim().toLowerCase();

  switch (mode) {
    case "REPLY": {
      return {
        to: fromEmail ? [fromEmail] : [],
        cc: [],
        bcc: [],
        subject: deriveReplySubject(detail.subject),
        htmlBody: "",
      };
    }
    case "REPLY_ALL": {
      // Reply-all includes:
      //   - original sender
      //   - original to recipients
      //   - original cc recipients
      // Excludes the sending mailbox identity from all buckets.
      // Deduplicates case-insensitively across to and cc.
      const rawTo = [fromEmail, ...allTo].filter((e) => e.length > 0);
      const rawCc = allCc.filter((e) => e.length > 0);

      const seen = new Set<string>();
      const toRecipients: string[] = [];
      const ccRecipients: string[] = [];

      for (const email of rawTo) {
        const lower = email.trim().toLowerCase();
        if (lower === selfEmailLower) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        toRecipients.push(email.trim());
      }
      for (const email of rawCc) {
        const lower = email.trim().toLowerCase();
        if (lower === selfEmailLower) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        ccRecipients.push(email.trim());
      }

      return {
        to: toRecipients,
        cc: ccRecipients,
        bcc: [],
        subject: deriveReplySubject(detail.subject),
        htmlBody: "",
      };
    }
    case "FORWARD": {
      return {
        to: [],
        cc: [],
        bcc: [],
        subject: deriveForwardSubject(detail.subject),
        htmlBody: "",
      };
    }
    default:
      return null;
  }
}

// ─── Core: create or restore draft ────────────────────────────────────────────

export interface CreateDraftResult {
  draft: MailboxDraftReadShape;
  created: boolean;
}

/**
 * Create a new draft or restore an existing one for the given compose context.
 *
 * Canonical restore rules:
 * - For NEW mode: connectionId + mode=NEW + threadId=null + replyToMessageId=null + createdBy=userId.
 * - For REPLY / REPLY_ALL / FORWARD: connectionId + mode + threadId + replyToMessageId + createdBy=userId.
 * - If found, return the existing draft (do not duplicate).
 * - If not found, create a new draft with sensible defaults.
 */
export async function createOrRestoreDraft(
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  const {
    orgId,
    userId,
    role,
    mailboxConnectionId,
    mode,
    threadId = null,
    replyToMessageId = null,
    fromIdentity,
    to,
    cc,
    bcc,
    subject,
    htmlBody,
    textBody,
    attachmentRefs,
  } = input;

  await assertCanAccessConnection(orgId, userId, role, mailboxConnectionId);

  const effectiveReplyToMessageId = replyToMessageId ?? null;

  // Canonical lookup for existing active draft in this context
  const existing = await db.mailboxDraft.findFirst({
    where: {
      orgId,
      mailboxConnectionId,
      mode,
      threadId: threadId ?? null,
      replyToMessageId: effectiveReplyToMessageId,
      createdBy: userId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return { draft: toMailboxDraftReadShape(existing as unknown as import("./domain-types").MailboxDraftRecord), created: false };
  }

  const connection = await db.mailboxConnection.findFirst({
    where: { id: mailboxConnectionId, orgId },
    select: { emailAddress: true },
  });
  const effectiveFromIdentity = fromIdentity ?? connection?.emailAddress ?? "";

  // Derive defaults for thread-bound modes
  let defaults: { to: string[]; cc: string[]; bcc: string[]; subject: string; htmlBody: string } | null = null;
  if (threadId && (mode === "REPLY" || mode === "REPLY_ALL" || mode === "FORWARD")) {
    defaults = await buildThreadDerivedDefaults(
      orgId, userId, role, mailboxConnectionId, mode, threadId, effectiveFromIdentity,
    );
  }

  const effectiveTo = to ?? defaults?.to ?? [];
  const effectiveCc = cc ?? defaults?.cc ?? [];
  const effectiveBcc = bcc ?? defaults?.bcc ?? [];
  const effectiveSubject = subject ?? defaults?.subject ?? "";
  const effectiveHtmlBody = htmlBody ?? defaults?.htmlBody ?? "";

  const draft = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.mailboxDraft.create({
      data: {
        orgId,
        mailboxConnectionId,
        threadId: threadId ?? null,
        replyToMessageId: effectiveReplyToMessageId,
        mode,
        fromIdentity: effectiveFromIdentity,
        toRecipients: effectiveTo as Prisma.InputJsonValue,
        ccRecipients: effectiveCc as Prisma.InputJsonValue,
        bccRecipients: effectiveBcc as Prisma.InputJsonValue,
        subject: effectiveSubject,
        htmlBody: effectiveHtmlBody,
        textBody: textBody ?? null,
        attachmentRefs: (attachmentRefs ?? []) as Prisma.InputJsonValue,
        status: "ACTIVE",
        lastAutosavedAt: new Date(),
        createdBy: userId,
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "DRAFT_CREATED",
      summary: `Created ${mode.toLowerCase()} draft`,
      mailboxConnectionId,
      threadId: threadId ?? null,
      metadata: { draftId: created.id, mode },
    });

    return created;
  });

  return {
    draft: toMailboxDraftReadShape(draft as unknown as import("./domain-types").MailboxDraftRecord),
    created: true,
  };
}

// ─── Core: autosave draft ───────────────────────────────────────────────────

export interface AutosaveDraftResult {
  draft: MailboxDraftReadShape;
  stale: boolean;
}

/**
 * Autosave a draft with an optional stale-write guard.
 *
 * If lastKnownUpdatedAt is provided and does not match the current row's updatedAt,
 * the save is rejected as stale. Callers should refetch and retry.
 *
 * Autosave updates lastAutosavedAt and does not create duplicate rows.
 */
export async function autosaveDraft(
  input: AutosaveDraftInput,
): Promise<AutosaveDraftResult> {
  const { draftId, lastKnownUpdatedAt } = input;

  const { draft } = await assertCanMutateDraft(input.orgId, input.userId, input.role, draftId);

  if (draft.status !== "ACTIVE") {
    throw new DraftServiceError("Cannot autosave a non-active draft", 409);
  }

  // Stale-write guard
  if (lastKnownUpdatedAt) {
    const currentUpdatedAt = draft.updatedAt.toISOString();
    if (currentUpdatedAt !== lastKnownUpdatedAt) {
      // Return the current draft so the caller can reconcile.
      return {
        draft: toMailboxDraftReadShape(draft as unknown as import("./domain-types").MailboxDraftRecord),
        stale: true,
      };
    }
  }

  const updateData: Prisma.MailboxDraftUpdateInput = {
    lastAutosavedAt: new Date(),
  };

  if (input.to !== undefined) {
    updateData.toRecipients = input.to as Prisma.InputJsonValue;
  }
  if (input.cc !== undefined) {
    updateData.ccRecipients = input.cc as Prisma.InputJsonValue;
  }
  if (input.bcc !== undefined) {
    updateData.bccRecipients = input.bcc as Prisma.InputJsonValue;
  }
  if (input.subject !== undefined) {
    updateData.subject = input.subject;
  }
  if (input.htmlBody !== undefined) {
    updateData.htmlBody = input.htmlBody;
  }
  if (input.textBody !== undefined) {
    updateData.textBody = input.textBody;
  }
  if (input.attachmentRefs !== undefined) {
    updateData.attachmentRefs = input.attachmentRefs as Prisma.InputJsonValue;
  }

  const updated = await db.mailboxDraft.update({
    where: { id: draftId, orgId: input.orgId },
    data: updateData,
  });

  return {
    draft: toMailboxDraftReadShape(updated as unknown as import("./domain-types").MailboxDraftRecord),
    stale: false,
  };
}

// ─── Core: discard draft ──────────────────────────────────────────────────────

export interface DiscardDraftResult {
  success: boolean;
  draftId: string;
}

/**
 * Discard a draft. Transitions status to DISCARDED rather than hard-deleting
 * to preserve auditability and support potential recovery.
 *
 * Idempotent: discarding an already-discarded draft succeeds silently.
 */
export async function discardDraft(
  input: DiscardDraftInput,
): Promise<DiscardDraftResult> {
  const { orgId, userId, role, draftId } = input;

  const { draft } = await assertCanMutateDraft(orgId, userId, role, draftId);

  if (draft.status === "DISCARDED") {
    return { success: true, draftId };
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.mailboxDraft.update({
      where: { id: draftId, orgId },
      data: { status: "DISCARDED" as MailboxDraftStatus },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "DRAFT_DISCARDED",
      summary: "Discarded draft",
      mailboxConnectionId: draft.mailboxConnectionId,
      threadId: draft.threadId ?? null,
      metadata: { draftId, previousStatus: draft.status },
    });
  });

  // Best-effort cleanup of staged attachments after discard
  try {
    await cleanupDraftAttachments(orgId, draftId);
  } catch {
    // Non-fatal: attachments may be garbage-collected later
  }

  return { success: true, draftId };
}

// ─── Core: get draft ──────────────────────────────────────────────────────────

export async function getDraft(
  input: GetDraftInput,
): Promise<MailboxDraftReadShape | null> {
  const { orgId, userId, role, draftId } = input;

  const draft = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
    include: { draftAttachments: true },
  });

  if (!draft) return null;

  // Verify the user can access the mailbox connection this draft belongs to
  try {
    await assertCanAccessConnection(orgId, userId, role, draft.mailboxConnectionId);
  } catch {
    return null;
  }

  // Ownership or admin visibility
  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    return null;
  }

  return toMailboxDraftReadShape(draft as unknown as import("./domain-types").MailboxDraftRecord);
}

// ─── Core: restore draft ────────────────────────────────────────────────────

export interface RestoreDraftResult {
  draft: MailboxDraftReadShape | null;
}

/**
 * Restore the canonical active draft for a given compose context.
 *
 * Rules:
 * - For NEW: the active draft for this user + connection + mode=NEW + threadId=null + replyToMessageId=null.
 * - For REPLY/REPLY_ALL/FORWARD: the active draft for this user + connection + threadId + replyToMessageId + mode.
 * - Returns null if no active draft exists.
 */
export async function restoreDraft(
  input: RestoreDraftInput,
): Promise<RestoreDraftResult> {
  const { orgId, userId, role, mailboxConnectionId, mode, threadId = null, replyToMessageId = null } = input;

  await assertCanAccessConnection(orgId, userId, role, mailboxConnectionId);

  const draft = await db.mailboxDraft.findFirst({
    where: {
      orgId,
      mailboxConnectionId,
      mode,
      threadId: threadId ?? null,
      replyToMessageId: replyToMessageId ?? null,
      createdBy: userId,
      status: "ACTIVE",
    },
    include: { draftAttachments: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!draft) {
    return { draft: null };
  }

  return {
    draft: toMailboxDraftReadShape(draft as unknown as import("./domain-types").MailboxDraftRecord),
  };
}

// ─── Convenience: initialize reply/reply-all/forward ──────────────────────────

export async function initializeReplyDraft(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  mailboxConnectionId: string,
  threadId: string,
  replyToMessageId?: string | null,
): Promise<CreateDraftResult> {
  return createOrRestoreDraft({
    orgId,
    userId,
    role,
    mailboxConnectionId,
    mode: "REPLY",
    threadId,
    replyToMessageId: replyToMessageId ?? null,
  });
}

export async function initializeReplyAllDraft(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  mailboxConnectionId: string,
  threadId: string,
  replyToMessageId?: string | null,
): Promise<CreateDraftResult> {
  return createOrRestoreDraft({
    orgId,
    userId,
    role,
    mailboxConnectionId,
    mode: "REPLY_ALL",
    threadId,
    replyToMessageId: replyToMessageId ?? null,
  });
}

export async function initializeForwardDraft(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  mailboxConnectionId: string,
  threadId: string,
  replyToMessageId?: string | null,
): Promise<CreateDraftResult> {
  return createOrRestoreDraft({
    orgId,
    userId,
    role,
    mailboxConnectionId,
    mode: "FORWARD",
    threadId,
    replyToMessageId: replyToMessageId ?? null,
  });
}

// ─── List active drafts for a connection ──────────────────────────────────────

export interface ListActiveDraftsInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  mailboxConnectionId?: string;
  searchQuery?: string;
}

function hasDraftLabel(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const labelIds = (metadata as Record<string, unknown>).labelIds;
  return Array.isArray(labelIds) && labelIds.includes("DRAFT");
}

function getGmailDraftId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const draftId = (metadata as Record<string, unknown>).gmailDraftId;
  return typeof draftId === "string" && draftId.length > 0 ? draftId : null;
}

function toParticipantEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((participant) => {
      if (!participant || typeof participant !== "object" || Array.isArray(participant)) return null;
      const email = (participant as Record<string, unknown>).email;
      return typeof email === "string" ? email : null;
    })
    .filter((email): email is string => !!email);
}

function mapLiveProviderDraft(
  orgId: string,
  mailboxConnectionId: string,
  envelope: MailboxDraftEnvelope,
): MailboxProviderDraftReadShape {
  const fromAddress = envelope.message.from.email;
  const updatedAt = envelope.message.sentAt ?? new Date().toISOString();

  return {
    id: `provider:${envelope.draftId}`,
    orgId,
    mailboxConnectionId,
    threadId: envelope.thread.providerThreadId,
    providerDraftId: envelope.draftId,
    providerMessageId: envelope.message.providerMessageId,
    subject: envelope.message.subject.trim() || "(No subject)",
    snippet: envelope.message.snippet.trim() || fromAddress || "Draft not started yet",
    to: envelope.message.to.map((participant) => participant.email).filter(Boolean),
    cc: envelope.message.cc.map((participant) => participant.email).filter(Boolean),
    bcc: envelope.message.bcc.map((participant) => participant.email).filter(Boolean),
    updatedAt,
    source: "provider",
  };
}

function mapLiveProviderDraftDetail(
  orgId: string,
  mailboxConnectionId: string,
  envelope: MailboxDraftEnvelope,
): MailboxProviderDraftDetailReadShape {
  const isUnavailable = !!(envelope.message.providerMetadata?.isUnavailable);
  const finalHtmlBody = isUnavailable
    ? `<div style="padding: 24px; text-align: center; color: #64748b;"><p style="font-weight: 500; margin-bottom: 8px;">Draft detail unavailable</p><p style="font-size: 14px;">This draft has no message content in the connected Gmail account.</p></div>`
    : (envelope.message.htmlBody?.trim() || "");

  const finalTextBody = isUnavailable
    ? "Draft detail unavailable"
    : (envelope.message.textBody?.trim() || null);

  const finalTo = (envelope.message.to.length > 0)
    ? envelope.message.to
    : (envelope.message.cc.length > 0 || envelope.message.bcc.length > 0)
      ? []
      : [{ email: "", displayName: "(No recipients)" }];

  return {
    id: `provider:${envelope.draftId}`,
    orgId,
    mailboxConnectionId,
    threadId: envelope.thread.providerThreadId,
    providerDraftId: envelope.draftId,
    providerMessageId: envelope.message.providerMessageId,
    from: envelope.message.from,
    to: finalTo,
    cc: envelope.message.cc,
    bcc: envelope.message.bcc,
    subject: envelope.message.subject.trim() || "(No subject)",
    snippet: envelope.message.snippet.trim() || "Draft not started yet",
    htmlBody: finalHtmlBody,
    textBody: finalTextBody,
    sentAt: envelope.message.sentAt,
    updatedAt: envelope.message.sentAt ?? new Date().toISOString(),
    attachments: (envelope.message.attachments ?? []).map((attachment) => ({
      id: `${envelope.draftId}:${attachment.providerAttachmentId}`,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      isInline: attachment.isInline,
      createdAt: envelope.message.sentAt,
    })),
    source: "provider",
  };
}

async function listLiveGmailProviderDrafts(input: ListActiveDraftsInput): Promise<{
  drafts: MailboxProviderDraftReadShape[];
  attempted: boolean;
}> {
  const { orgId, userId, role, mailboxConnectionId } = input;
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleConnections = mailboxConnectionId
    ? accessible.filter((connection) => connection.id === mailboxConnectionId)
    : accessible;

  if (accessibleConnections.length === 0) return { drafts: [], attempted: false };

  const drafts: MailboxProviderDraftReadShape[] = [];
  let attempted = false;
  for (const visibleConnection of accessibleConnections) {
    const connection = await getMailboxConnection(orgId, visibleConnection.id);
    if (!connection || connection.provider !== "GMAIL" || !connection.tokenRef) continue;
    if (connection.status !== "ACTIVE" && connection.status !== "DEGRADED") continue;

    attempted = true;
    const adapter = getMailboxProviderAdapter(connection.provider);
    const syncResult = await adapter.syncDrafts({
      orgId,
      tokenRef: connection.tokenRef,
    });
    if (isMailboxProviderError(syncResult)) {
      continue;
    }

    for (const draft of syncResult.drafts) {
      drafts.push(mapLiveProviderDraft(orgId, connection.id, draft));
    }
  }

  return { drafts, attempted };
}

async function listProviderDrafts(input: ListActiveDraftsInput): Promise<MailboxProviderDraftReadShape[]> {
  const liveGmailDrafts = await listLiveGmailProviderDrafts(input);
  if (liveGmailDrafts.attempted) {
    return liveGmailDrafts.drafts;
  }

  const { orgId, userId, role, mailboxConnectionId } = input;
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((connection) => connection.id);

  if (accessibleIds.length === 0) return [];

  const connectionIds = mailboxConnectionId
    ? accessibleIds.includes(mailboxConnectionId)
      ? [mailboxConnectionId]
      : []
    : accessibleIds;

  if (connectionIds.length === 0) return [];

  const rows = await db.mailboxMessage.findMany({
    where: {
      orgId,
      thread: {
        mailboxConnectionId: { in: connectionIds },
      },
      ...(input.searchQuery
        ? {
            OR: [
              { subject: { contains: input.searchQuery, mode: "insensitive" } },
              { snippet: { contains: input.searchQuery, mode: "insensitive" } },
              { textBody: { contains: input.searchQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      threadId: true,
      providerMessageId: true,
      subject: true,
      snippet: true,
      from: true,
      to: true,
      cc: true,
      bcc: true,
      sentAt: true,
      updatedAt: true,
      providerMetadata: true,
      thread: {
        select: {
          mailboxConnectionId: true,
        },
      },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
  });

  const providerDrafts: MailboxProviderDraftReadShape[] = [];
  for (const row of rows) {
    if (!hasDraftLabel(row.providerMetadata)) continue;
    const providerDraftId = getGmailDraftId(row.providerMetadata);
    const fromAddress = toParticipantEmails(row.from)[0];

    providerDrafts.push({
      id: `provider:${providerDraftId ?? row.providerMessageId}`,
      orgId,
      mailboxConnectionId: row.thread.mailboxConnectionId,
      threadId: row.threadId,
      providerDraftId,
      providerMessageId: row.providerMessageId,
      subject: row.subject.trim() || "(No subject)",
      snippet: row.snippet.trim() || fromAddress || "Draft not started yet",
      to: toParticipantEmails(row.to),
      cc: toParticipantEmails(row.cc),
      bcc: toParticipantEmails(row.bcc),
      updatedAt: row.updatedAt.toISOString(),
      source: "provider",
    });
  }

  return providerDrafts;
}

export async function getProviderDraftDetail(input: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
}): Promise<MailboxProviderDraftDetailReadShape | null> {
  const { orgId, userId, role, draftId } = input;
  const providerKey = draftId.startsWith("provider:") ? draftId.slice("provider:".length) : draftId;
  if (!providerKey) {
    throw new DraftServiceError("Invalid provider draft ID", 400);
  }

  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((connection) => connection.id);
  if (accessibleIds.length === 0) return null;

  let attemptedLiveGmail = false;
  for (const visibleConnection of accessible) {
    const connection = await getMailboxConnection(orgId, visibleConnection.id);
    if (!connection || connection.provider !== "GMAIL" || !connection.tokenRef) continue;
    if (connection.status !== "ACTIVE" && connection.status !== "DEGRADED") continue;

    attemptedLiveGmail = true;
    const adapter = getMailboxProviderAdapter(connection.provider);
    const syncResult = await adapter.syncDrafts({
      orgId,
      tokenRef: connection.tokenRef,
    });
    if (isMailboxProviderError(syncResult)) {
      continue;
    }

    const liveDraft = syncResult.drafts.find(
      (draft) =>
        draft.draftId === providerKey || draft.message.providerMessageId === providerKey,
    );
    if (liveDraft) {
      return mapLiveProviderDraftDetail(orgId, connection.id, liveDraft);
    }
  }
  if (attemptedLiveGmail) {
    return null;
  }

  const row = await db.mailboxMessage.findFirst({
    where: {
      orgId,
      thread: {
        mailboxConnectionId: { in: accessibleIds },
      },
      OR: [
        { providerMessageId: providerKey },
        { providerMetadata: { path: ["gmailDraftId"], equals: providerKey } },
      ],
    },
    select: {
      id: true,
      threadId: true,
      providerMessageId: true,
      subject: true,
      snippet: true,
      htmlBody: true,
      textBody: true,
      from: true,
      to: true,
      cc: true,
      bcc: true,
      sentAt: true,
      updatedAt: true,
      providerMetadata: true,
      attachments: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          isInline: true,
          createdAt: true,
        },
      },
      thread: {
        select: {
          mailboxConnectionId: true,
        },
      },
    },
  });

  if (!row || !hasDraftLabel(row.providerMetadata)) return null;

  const isUnavailable = !!(row.providerMetadata && typeof row.providerMetadata === "object" && !Array.isArray(row.providerMetadata) && (row.providerMetadata as Record<string, unknown>).isUnavailable);
  const finalHtmlBody = isUnavailable
    ? `<div style="padding: 24px; text-align: center; color: #64748b;"><p style="font-weight: 500; margin-bottom: 8px;">Draft detail unavailable</p><p style="font-size: 14px;">This draft has no message content in the connected Gmail account.</p></div>`
    : (row.htmlBody?.trim() || "");

  const finalTextBody = isUnavailable
    ? "Draft detail unavailable"
    : (row.textBody?.trim() || null);

  const mappedTo = toParticipants(row.to);
  const mappedCc = toParticipants(row.cc);
  const mappedBcc = toParticipants(row.bcc);
  const finalTo = (mappedTo.length > 0)
    ? mappedTo
    : (mappedCc.length > 0 || mappedBcc.length > 0)
      ? []
      : [{ email: "", displayName: "(No recipients)" }];

  return {
    id: draftId.startsWith("provider:") ? draftId : `provider:${providerKey}`,
    orgId,
    mailboxConnectionId: row.thread.mailboxConnectionId,
    threadId: row.threadId,
    providerDraftId: getGmailDraftId(row.providerMetadata),
    providerMessageId: row.providerMessageId,
    from: toParticipant(row.from),
    to: finalTo,
    cc: mappedCc,
    bcc: mappedBcc,
    subject: row.subject.trim() || "(No subject)",
    snippet: row.snippet.trim() || "Draft not started yet",
    htmlBody: finalHtmlBody,
    textBody: finalTextBody,
    sentAt: row.sentAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      isInline: attachment.isInline,
      createdAt: attachment.createdAt.toISOString(),
    })),
    source: "provider",
  };
}

function toParticipant(
  value: Prisma.JsonValue | null,
): MailboxProviderDraftDetailReadShape["from"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const email = typeof value.email === "string" ? value.email : null;
  if (!email) return null;
  return {
    email,
    displayName: typeof value.displayName === "string" ? value.displayName : null,
  };
}

function toParticipants(value: Prisma.JsonValue | null): MailboxProviderDraftDetailReadShape["to"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((participant) => {
      if (!participant || typeof participant !== "object" || Array.isArray(participant)) return null;
      const email = typeof participant.email === "string" ? participant.email : null;
      if (!email) return null;
      return {
        email,
        displayName:
          typeof participant.displayName === "string" ? participant.displayName : null,
      };
    })
    .filter((participant): participant is NonNullable<typeof participant> => participant !== null);
}

export async function listActiveDrafts(
  input: ListActiveDraftsInput,
): Promise<MailboxDraftReadShape[]> {
  const { orgId, userId, role, mailboxConnectionId } = input;

  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((c) => c.id);

  if (accessibleIds.length === 0) return [];

  const connectionIds = mailboxConnectionId
    ? accessibleIds.includes(mailboxConnectionId)
      ? [mailboxConnectionId]
      : []
    : accessibleIds;

  if (connectionIds.length === 0) return [];

  const rows = await db.mailboxDraft.findMany({
    where: {
      orgId,
      mailboxConnectionId: { in: connectionIds },
      createdBy: userId,
      status: "ACTIVE",
      ...(input.searchQuery
        ? {
            OR: [
              { subject: { contains: input.searchQuery, mode: "insensitive" } },
              { textBody: { contains: input.searchQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { draftAttachments: true },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((r) => toMailboxDraftReadShape(r as unknown as import("./domain-types").MailboxDraftRecord));
}

export async function listDraftEntries(
  input: ListActiveDraftsInput,
): Promise<MailboxDraftListEntryReadShape[]> {
  const [localDrafts, providerDrafts] = await Promise.all([
    listActiveDrafts(input),
    listProviderDrafts(input),
  ]);

  return [
    ...localDrafts.map((draft) => ({
      ...draft,
      source: "local" as const,
    })),
    ...providerDrafts,
  ].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime();
    const rightTime = new Date(right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}
