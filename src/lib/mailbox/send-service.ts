import "server-only";

/**
 * Mailbox send service — Sprint 5.4 durable send-attempt lifecycle.
 *
 * Orchestrates outbound send for NEW, REPLY, REPLY_ALL, and FORWARD modes.
 * The persisted draft is the authoritative compose state.
 *
 * Rules:
 * - Only the draft creator (or org admin) may send.
 * - The sender identity comes from the draft's mailboxConnection.
 * - Thread-bound sends use the thread's provider metadata for Gmail threading.
 * - Successful send transitions the draft to SENT.
 * - Failed send preserves the draft as ACTIVE for retry.
 * - Audit events are written atomically with the send transition.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { getMailboxThreadDetail, hydrateThreadFromProvider } from "./thread-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";
import { logMailboxAuditTx } from "./audit";
import { toMailboxDraftReadShape } from "./read-shapes";
import type { MailboxDraftReadShape } from "./read-shapes";
import type { MailboxDraftMode } from "./domain-types";
import { DraftServiceError } from "./draft-service";
import {
  resolveAttachmentsForSend,
  cleanupDraftAttachments,
  isAttachmentServiceError,
} from "./attachment-service";
import { withRetry, isRetryableProviderError } from "./retry-utils";
import {
  computeDraftFingerprint,
  findLatestSendAttemptForFingerprint,
  resolveDuplicateSendAttempt,
  generateCorrelationKey,
  generateRfcMessageId,
  createSendAttempt,
  markSendAttemptSent,
  markSendAttemptFailed,
  markSendAttemptPendingReconciliation,
  markSendAttemptReconciled,
  getSendAttemptById,
} from "./send-attempt-service";
import type { SendAttemptRecord } from "./send-attempt-service";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SendServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "SendServiceError";
  }
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface SendDraftInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draftId: string;
}

export type SendDraftResult =
  | {
      status: "sent";
      draft: MailboxDraftReadShape;
      providerMessageId: string;
      providerThreadId: string | null;
      rfcMessageId: string | null;
      sendAttemptId: string;
    }
  | {
      status: "pending_reconciliation";
      sendAttemptId: string;
      retryAfter: number;
      reason: string;
    }
  | {
      status: "failed";
      sendAttemptId: string;
      reason: string;
      retryable: boolean;
    };

export interface ReconcileSendAttemptInput {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  attemptId: string;
}

export type ReconcileSendAttemptResult =
  | {
      status: "reconciled_sent";
      attemptId: string;
      providerMessageId: string;
      providerThreadId: string;
      draft: MailboxDraftReadShape;
    }
  | {
      status: "reconciled_failed";
      attemptId: string;
      message: string;
    }
  | {
      status: "still_pending";
      attemptId: string;
      retryAfter: number;
      message: string;
    };

// ─── Permission helpers ───────────────────────────────────────────────────────

async function assertCanSendFromConnection(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  connectionId: string,
  threadId?: string | null,
): Promise<void> {
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const connection = accessible.find((c) => c.id === connectionId);
  if (!connection) {
    throw new SendServiceError("Mailbox connection not accessible", 403);
  }

  // Connection owner bypass
  if (connection.connectedBy === userId) {
    return;
  }

  const isReadOnly = role === "member" && connection.visibilityPolicy === "org_shared";
  if (isReadOnly) {
    // Thread assignee bypass
    if (threadId) {
      const thread = await db.mailboxThread.findFirst({
        where: { id: threadId, orgId },
        select: { assigneeId: true },
      });
      if (thread && thread.assigneeId === userId) {
        return;
      }
    }
    throw new SendServiceError("You do not have permission to send from this mailbox", 403);
  }
}

// ─── Core: send draft ─────────────────────────────────────────────────────────

/**
 * Send the draft via the provider associated with its mailbox connection.
 *
 * Steps:
 * 1. Load the draft and verify ownership / permissions.
 * 2. Verify the draft is ACTIVE (not already sent or discarded).
 * 3. Load the mailbox connection to get provider + tokenRef.
 * 4. For thread-bound modes: load thread detail to get providerThreadId and
 *    the original message's RFC Message-ID for reply threading.
 * 5. Compute deterministic fingerprint and check for duplicate attempts.
 * 6. Invoke provider adapter's sendMessage with correlation headers.
 * 7. On confirmed success: mark SENT, transition draft, audit.
 * 8. On definitive failure: mark FAILED, preserve draft ACTIVE, audit.
 * 9. On ambiguous failure: mark PENDING_RECONCILIATION, return 202.
 */
export async function sendDraft(input: SendDraftInput): Promise<SendDraftResult> {
  const { orgId, userId, role, draftId } = input;

  const draft = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
  });

  if (!draft) {
    throw new SendServiceError("Draft not found", 404);
  }

  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new SendServiceError("You do not have permission to send this draft", 403);
  }

  if (draft.status !== "ACTIVE") {
    throw new SendServiceError(`Cannot send draft with status ${draft.status}`, 409);
  }

  await assertCanSendFromConnection(orgId, userId, role, draft.mailboxConnectionId, draft.threadId);

  const connection = await db.mailboxConnection.findFirst({
    where: { id: draft.mailboxConnectionId, orgId },
  });

  if (!connection) {
    throw new SendServiceError("Mailbox connection not found", 404);
  }

  if (connection.status !== "ACTIVE" && connection.status !== "DEGRADED") {
    throw new SendServiceError("Mailbox connection is not active; cannot send", 403);
  }

  if (!connection.tokenRef) {
    throw new SendServiceError("Mailbox connection has no valid token; reconnect required", 403);
  }

  // Thread context for reply threading
  let threadContext: {
    providerThreadId: string;
    inReplyToRfcMessageId: string | null;
    references: string[] | null;
  } | null = null;

  if (draft.threadId && (draft.mode === "REPLY" || draft.mode === "REPLY_ALL" || draft.mode === "FORWARD")) {
    const threadDetail = await getMailboxThreadDetail(orgId, userId, role, draft.threadId);
    if (threadDetail) {
      const providerThreadId = threadDetail.providerThreadId;

      const replyToMessageId = draft.replyToMessageId;
      let inReplyToRfcMessageId: string | null = null;
      let references: string[] | null = null;

      if (replyToMessageId && threadDetail.messages) {
        const targetMessage = threadDetail.messages.find((m) => m.providerMessageId === replyToMessageId);
        if (targetMessage) {
          inReplyToRfcMessageId = targetMessage.rfcMessageId ?? null;
          references = threadDetail.messages
            .map((m) => m.rfcMessageId)
            .filter((id): id is string => !!id);
        }
      }

      threadContext = {
        providerThreadId,
        inReplyToRfcMessageId,
        references,
      };
    }
  }

  // Resolve staged attachments for the send path
  let attachmentPayload: Awaited<ReturnType<typeof resolveAttachmentsForSend>> = [];
  try {
    attachmentPayload = await resolveAttachmentsForSend(orgId, draftId);
  } catch (err) {
    if (isAttachmentServiceError(err)) {
      throw new SendServiceError(err.message, err.statusCode);
    }
    throw new SendServiceError("Failed to resolve attachments for send", 500);
  }

  // Backward compatibility: if mailboxSendAttempt is not available (older schema
  // or test mocks without the model), fall back to the legacy send path.
  if (!db.mailboxSendAttempt) {
    return legacySendFallback({
      orgId,
      userId,
      role,
      draft,
      connection,
      draftId,
      attachmentPayload,
      threadContext,
    });
  }

  // Fingerprint and duplicate protection
  const fingerprint = computeDraftFingerprint({
    fromIdentity: draft.fromIdentity,
    toRecipients: draft.toRecipients as string[],
    ccRecipients: (draft.ccRecipients as string[]) ?? [],
    bccRecipients: (draft.bccRecipients as string[]) ?? [],
    subject: draft.subject,
    htmlBody: draft.htmlBody ?? "",
    textBody: draft.textBody ?? null,
    mailboxConnectionId: draft.mailboxConnectionId,
    threadId: draft.threadId,
    mode: draft.mode as MailboxDraftMode,
    attachmentRefs: (draft.attachmentRefs as string[]) ?? [],
    replyToMessageId: draft.replyToMessageId,
  });

  const latestAttempt = await findLatestSendAttemptForFingerprint(orgId, draftId, fingerprint);
  const resolution = resolveDuplicateSendAttempt(latestAttempt);

  if (resolution.action === "return_idempotent_success") {
    const existing = resolution.existingAttempt!;
    return {
      status: "sent",
      draft: toMailboxDraftReadShape(draft as unknown as import("./domain-types").MailboxDraftRecord),
      providerMessageId: existing.providerMessageId ?? existing.id,
      providerThreadId: existing.providerThreadId ?? "",
      rfcMessageId: existing.rfcMessageId,
      sendAttemptId: existing.id,
    };
  }

  if (resolution.action === "return_pending_reconciliation") {
    const existing = resolution.existingAttempt!;
    return {
      status: "pending_reconciliation",
      sendAttemptId: existing.id,
      retryAfter: 60,
      reason: "A previous send attempt is still pending reconciliation",
    };
  }

  // Generate correlation keys and create attempt
  const correlationKey = generateCorrelationKey();
  const rfcMessageId = generateRfcMessageId(correlationKey);

  const attempt = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    return createSendAttempt(tx, {
      orgId,
      draftId,
      mailboxConnectionId: connection.id,
      actorId: userId,
      mode: draft.mode as MailboxDraftMode,
      fingerprint,
      correlationKey,
      rfcMessageId,
    });
  });

  // Invoke provider
  const adapter = getMailboxProviderAdapter(connection.provider);

  let sendResult;
  try {
    sendResult = await withRetry(
      () =>
        adapter.sendMessage({
          orgId,
          tokenRef: connection.tokenRef,
          from: draft.fromIdentity,
          to: draft.toRecipients as string[],
          cc: (draft.ccRecipients as string[]) ?? [],
          bcc: (draft.bccRecipients as string[]) ?? [],
          subject: draft.subject,
          htmlBody: draft.htmlBody ?? "",
          textBody: draft.textBody ?? null,
          threadContext,
          attachments: attachmentPayload,
          correlationKey,
          rfcMessageId,
        }),
      {
        baseDelayMs: 1000,
        maxDelayMs: 15_000,
        maxAttempts: 3,
        retryable: (err) => {
          if (err && typeof err === "object" && "category" in err) {
            const providerErr = err as { category: string; retryable?: boolean };
            return providerErr.retryable !== false || isRetryableProviderError(err);
          }
          return isRetryableProviderError(err);
        },
      },
    );
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Unknown provider error";
    sendResult = {
      category: "provider_unavailable" as const,
      safeMessage,
      retryable: true,
    };
  }

  if (isMailboxProviderError(sendResult)) {
    const isDefinitive = sendResult.category === "auth_expired"
      || sendResult.category === "auth_insufficient"
      || sendResult.category === "not_found"
      || sendResult.category === "quota_exceeded";

    if (isDefinitive) {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await markSendAttemptFailed(tx, attempt.id, sendResult.category, sendResult.safeMessage);
        await logMailboxAuditTx(tx, {
          orgId,
          actorId: userId,
          action: "SEND_FAILED",
          summary: `Send failed: ${sendResult.safeMessage}`,
          mailboxConnectionId: connection.id,
          threadId: draft.threadId ?? null,
          messageId: null,
          metadata: {
            draftId,
            attemptId: attempt.id,
            failureCategory: sendResult.category,
            retryable: sendResult.retryable,
          },
        });
      });

      return {
        status: "failed",
        sendAttemptId: attempt.id,
        reason: sendResult.safeMessage,
        retryable: sendResult.retryable ?? false,
      };
    } else {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await markSendAttemptPendingReconciliation(tx, attempt.id);
        await logMailboxAuditTx(tx, {
          orgId,
          actorId: userId,
          action: "SEND_PENDING_RECONCILIATION",
          summary: `Send pending reconciliation: ${sendResult.safeMessage}`,
          mailboxConnectionId: connection.id,
          threadId: draft.threadId ?? null,
          messageId: null,
          metadata: {
            draftId,
            attemptId: attempt.id,
            failureCategory: sendResult.category,
          },
        });
      });

      return {
        status: "pending_reconciliation",
        sendAttemptId: attempt.id,
        retryAfter: 60,
        reason: sendResult.safeMessage,
      };
    }
  }

  // Confirmed success
  const updatedDraft = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await markSendAttemptSent(tx, attempt.id, sendResult.providerMessageId, sendResult.providerThreadId, sendResult.rfcMessageId);

    const draftSent = await tx.mailboxDraft.update({
      where: { id: draftId, orgId },
      data: {
        status: "SENT",
        lastAutosavedAt: new Date(),
      },
    });

    const auditAction = mapModeToAuditAction(draft.mode as MailboxDraftMode);
    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: auditAction,
      summary: mapModeToAuditSummary(draft.mode as MailboxDraftMode),
      mailboxConnectionId: connection.id,
      threadId: draft.threadId ?? null,
      messageId: sendResult.providerMessageId,
      metadata: {
        draftId,
        mode: draft.mode,
        providerMessageId: sendResult.providerMessageId,
        providerThreadId: sendResult.providerThreadId,
        attachmentCount: attachmentPayload.length,
      },
    });

    return draftSent;
  });

  if (sendResult.providerThreadId) {
    try {
      await hydrateThreadFromProvider({
        orgId,
        connection,
        providerThreadId: sendResult.providerThreadId,
      });
    } catch (hydrateErr) {
      console.error("[sendDraft] Post-send hydration failed:", hydrateErr);
    }
  }

  // Best-effort cleanup of staged attachments after send
  try {
    await cleanupDraftAttachments(orgId, draftId);
  } catch {
    // Non-fatal
  }

  return {
    status: "sent",
    draft: toMailboxDraftReadShape(updatedDraft as unknown as import("./domain-types").MailboxDraftRecord),
    providerMessageId: sendResult.providerMessageId,
    providerThreadId: sendResult.providerThreadId,
    rfcMessageId: sendResult.rfcMessageId,
    sendAttemptId: attempt.id,
  };
}

// ─── Explicit reconciliation ──────────────────────────────────────────────────

export async function reconcileSendAttempt(
  input: ReconcileSendAttemptInput,
): Promise<ReconcileSendAttemptResult> {
  const { orgId, userId, role, attemptId } = input;

  const attempt = await getSendAttemptById(orgId, attemptId);
  if (!attempt) {
    throw new SendServiceError("Send attempt not found", 404);
  }

  const draft = await db.mailboxDraft.findFirst({
    where: { id: attempt.draftId, orgId },
  });

  if (!draft) {
    throw new SendServiceError("Draft not found", 404);
  }

  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new SendServiceError("You do not have permission to reconcile this send", 403);
  }

  if (attempt.status !== "PENDING_RECONCILIATION") {
    throw new SendServiceError(`Cannot reconcile attempt with status ${attempt.status}`, 409);
  }

  const connection = await db.mailboxConnection.findFirst({
    where: { id: draft.mailboxConnectionId, orgId },
  });

  if (!connection || connection.status !== "ACTIVE" || !connection.tokenRef) {
    return {
      status: "still_pending",
      attemptId,
      retryAfter: 60,
      message: "Mailbox connection not available for reconciliation",
    };
  }

  const adapter = getMailboxProviderAdapter(connection.provider);
  const reconcileResult = await adapter.reconcileSend({
    orgId,
    tokenRef: connection.tokenRef,
    correlationKey: attempt.correlationKey,
    rfcMessageId: attempt.rfcMessageId,
  });

  if (isMailboxProviderError(reconcileResult)) {
    return {
      status: "still_pending",
      attemptId,
      retryAfter: 60,
      message: reconcileResult.safeMessage,
    };
  }

  if (!reconcileResult.found) {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await markSendAttemptReconciled(tx, attemptId, "RECONCILED_FAILED");
      await logMailboxAuditTx(tx, {
        orgId,
        actorId: userId,
        action: "SEND_RECONCILED_FAILED",
        summary: "Send attempt reconciled as failed (not found on provider)",
        mailboxConnectionId: connection.id,
        threadId: draft.threadId ?? null,
        messageId: null,
        metadata: {
          draftId: draft.id,
          attemptId,
          correlationKey: attempt.correlationKey,
        },
      });
    });

    return {
      status: "reconciled_failed",
      attemptId,
      message: "Message not found on provider after reconciliation",
    };
  }

  const updatedDraft = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await markSendAttemptReconciled(
      tx,
      attemptId,
      "RECONCILED_SENT",
      reconcileResult.providerMessageId,
      reconcileResult.providerThreadId,
      reconcileResult.rfcMessageId,
    );

    const draftSent = await tx.mailboxDraft.update({
      where: { id: draft.id, orgId },
      data: {
        status: "SENT",
        lastAutosavedAt: new Date(),
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "SEND_RECONCILED_SENT",
      summary: "Send attempt reconciled as sent",
      mailboxConnectionId: connection.id,
      threadId: draft.threadId ?? null,
      messageId: reconcileResult.providerMessageId,
      metadata: {
        draftId: draft.id,
        attemptId,
        providerMessageId: reconcileResult.providerMessageId,
        providerThreadId: reconcileResult.providerThreadId,
      },
    });

    return draftSent;
  });

  return {
    status: "reconciled_sent",
    attemptId,
    providerMessageId: reconcileResult.providerMessageId,
    providerThreadId: reconcileResult.providerThreadId,
    draft: toMailboxDraftReadShape(updatedDraft as unknown as import("./domain-types").MailboxDraftRecord),
  };
}

// ─── Legacy fallback for pre-5.4 environments ─────────────────────────────────

async function legacySendFallback(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  draft: Awaited<ReturnType<typeof db.mailboxDraft.findFirst>> & {};
  connection: Awaited<ReturnType<typeof db.mailboxConnection.findFirst>> & {};
  draftId: string;
  attachmentPayload: Awaited<ReturnType<typeof resolveAttachmentsForSend>>;
  threadContext: {
    providerThreadId: string;
    inReplyToRfcMessageId: string | null;
    references: string[] | null;
  } | null;
}): Promise<SendDraftResult> {
  const { orgId, userId, draft, connection, draftId, attachmentPayload, threadContext } = params;

  const adapter = getMailboxProviderAdapter(connection.provider);

  let sendResult;
  try {
    sendResult = await withRetry(
      () =>
        adapter.sendMessage({
          orgId,
          tokenRef: connection.tokenRef,
          from: draft.fromIdentity,
          to: draft.toRecipients as string[],
          cc: (draft.ccRecipients as string[]) ?? [],
          bcc: (draft.bccRecipients as string[]) ?? [],
          subject: draft.subject,
          htmlBody: draft.htmlBody ?? "",
          textBody: draft.textBody ?? null,
          threadContext,
          attachments: attachmentPayload,
        }),
      {
        baseDelayMs: 1000,
        maxDelayMs: 15_000,
        maxAttempts: 3,
        retryable: (err) => {
          if (err && typeof err === "object" && "category" in err) {
            return (err as { retryable?: boolean }).retryable !== false || isRetryableProviderError(err);
          }
          return isRetryableProviderError(err);
        },
      },
    );
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Unknown provider error";
    sendResult = {
      category: "provider_unavailable" as const,
      safeMessage,
      retryable: true,
    };
  }

  if (isMailboxProviderError(sendResult)) {
    throw new SendServiceError(
      sendResult.safeMessage,
      mapProviderErrorToHttpStatus(sendResult.category),
    );
  }

  const updatedDraft = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const sent = await tx.mailboxDraft.update({
      where: { id: draftId, orgId },
      data: {
        status: "SENT",
        lastAutosavedAt: new Date(),
      },
    });

    const auditAction = mapModeToAuditAction(draft.mode as MailboxDraftMode);
    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: auditAction,
      summary: mapModeToAuditSummary(draft.mode as MailboxDraftMode),
      mailboxConnectionId: draft.mailboxConnectionId,
      threadId: draft.threadId ?? null,
      messageId: sendResult.providerMessageId,
      metadata: {
        draftId,
        mode: draft.mode,
        providerMessageId: sendResult.providerMessageId,
        providerThreadId: sendResult.providerThreadId,
        attachmentCount: attachmentPayload.length,
      },
    });

    return sent;
  });

  try {
    await cleanupDraftAttachments(orgId, draftId);
  } catch {
    // Non-fatal
  }

  return {
    status: "sent",
    draft: toMailboxDraftReadShape(updatedDraft as unknown as import("./domain-types").MailboxDraftRecord),
    providerMessageId: sendResult.providerMessageId,
    providerThreadId: sendResult.providerThreadId,
    rfcMessageId: sendResult.rfcMessageId ?? null,
    sendAttemptId: "legacy-fallback",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapModeToAuditAction(mode: MailboxDraftMode):
  | "MESSAGE_SENT"
  | "MESSAGE_REPLIED"
  | "MESSAGE_FORWARDED" {
  switch (mode) {
    case "REPLY":
    case "REPLY_ALL":
      return "MESSAGE_REPLIED";
    case "FORWARD":
      return "MESSAGE_FORWARDED";
    default:
      return "MESSAGE_SENT";
  }
}

function mapModeToAuditSummary(mode: MailboxDraftMode): string {
  switch (mode) {
    case "REPLY":
      return "Sent reply";
    case "REPLY_ALL":
      return "Sent reply-all";
    case "FORWARD":
      return "Sent forward";
    default:
      return "Sent message";
  }
}

function mapProviderErrorToHttpStatus(category: string): number {
  switch (category) {
    case "auth_expired":
    case "auth_insufficient":
      return 403;
    case "rate_limited":
      return 429;
    case "quota_exceeded":
      return 429;
    case "not_found":
      return 404;
    case "provider_unavailable":
      return 503;
    default:
      return 500;
  }
}
