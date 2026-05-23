import "server-only";

import { db } from "@/lib/db";
import {
  computeDraftFingerprint,
  findLatestSendAttemptForFingerprint,
  createSendAttempt,
  markSendAttemptSent,
  markSendAttemptFailed,
  markSendAttemptPendingReconciliation,
  resolveDuplicateSendAttempt,
} from "./send-attempt-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { logMailboxAuditTx } from "./audit";
import { getMailboxThreadDetail } from "./thread-service";
import { upsertMailboxThread, upsertMailboxMessage, updateMailboxThreadSummary } from "./ingestion-service";
import type { MailboxDraftRecord } from "./domain-types";

export class SendServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = "SendServiceError";
  }
}

interface SendDraftResult {
  status: "sent" | "failed" | "pending_reconciliation";
  providerMessageId?: string;
  providerThreadId?: string;
  sendAttemptId?: string;
  retryable?: boolean;
}

interface ReconcileResult {
  status: "reconciled_sent" | "reconciled_failed" | "still_pending";
  providerMessageId?: string;
  providerThreadId?: string;
  message?: string;
}

async function getMailboxDraft(orgId: string, draftId: string): Promise<MailboxDraftRecord | null> {
  const row = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
  });
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    threadId: row.threadId,
    mode: row.mode,
    fromIdentity: row.fromIdentity,
    toRecipients: row.toRecipients as string[],
    ccRecipients: row.ccRecipients as string[],
    bccRecipients: row.bccRecipients as string[],
    subject: row.subject,
    htmlBody: row.htmlBody,
    textBody: row.textBody,
    attachmentRefs: row.attachmentRefs as string[],
    status: row.status,
    lastAutosavedAt: row.lastAutosavedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function sendDraft({
  orgId,
  userId,
  role,
  draftId,
}: {
  orgId: string;
  userId: string;
  role: string;
  draftId: string;
}): Promise<SendDraftResult> {
  const draft = await getMailboxDraft(orgId, draftId);
  if (!draft) {
    throw new SendServiceError("Draft not found", 404);
  }

  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new SendServiceError("You do not have permission to send this draft", 403);
  }

  const connection = await db.mailboxConnection.findFirst({
    where: { id: draft.mailboxConnectionId, orgId },
  });
  if (!connection || !connection.tokenRef) {
    throw new SendServiceError("Mailbox connection not available", 400);
  }

  const fingerprint = computeDraftFingerprint({
    mailboxConnectionId: draft.mailboxConnectionId,
    fromIdentity: draft.fromIdentity,
    toRecipients: draft.toRecipients,
    ccRecipients: draft.ccRecipients,
    bccRecipients: draft.bccRecipients,
    subject: draft.subject,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    attachmentRefs: draft.attachmentRefs,
    mode: draft.mode,
    threadId: draft.threadId,
    replyToMessageId: null,
  });

  const latestAttempt = await findLatestSendAttemptForFingerprint(orgId, draftId, fingerprint);
  const resolution = resolveDuplicateSendAttempt(latestAttempt);

  if (resolution.action === "return_idempotent_success") {
    return {
      status: "sent",
      providerMessageId: resolution.existingAttempt.providerMessageId ?? undefined,
      providerThreadId: resolution.existingAttempt.providerThreadId ?? undefined,
    };
  }

  if (resolution.action === "return_pending_reconciliation") {
    return {
      status: "pending_reconciliation",
      sendAttemptId: resolution.existingAttempt.id,
    };
  }

  const adapter = getMailboxProviderAdapter(connection.provider);

  const result = await db.$transaction(async (tx) => {
    const attempt = await createSendAttempt(tx, {
      orgId,
      draftId,
      mailboxConnectionId: draft.mailboxConnectionId,
      actorId: userId,
      mode: draft.mode,
      fingerprint,
      correlationKey: `sw-send-${draftId}-${Date.now()}`,
      rfcMessageId: `<sw-send-${draftId}@slipwise.io>`,
    });

    try {
      const sendResult = await adapter.sendMessage({
        orgId,
        tokenRef: connection.tokenRef!,
        draft: {
          fromIdentity: draft.fromIdentity,
          toRecipients: draft.toRecipients,
          ccRecipients: draft.ccRecipients,
          bccRecipients: draft.bccRecipients,
          subject: draft.subject,
          htmlBody: draft.htmlBody,
          textBody: draft.textBody,
          attachmentRefs: draft.attachmentRefs,
          mode: draft.mode,
          threadId: draft.threadId,
          replyToMessageId: null,
        },
        correlationKey: attempt.correlationKey,
        rfcMessageId: attempt.rfcMessageId,
      });

      if ("category" in sendResult) {
        // Provider error
        await markSendAttemptFailed(tx, attempt.id, sendResult.category, sendResult.safeMessage);
        await logMailboxAuditTx(tx, {
          orgId,
          actorId: userId,
          action: "MESSAGE_SENT",
          summary: `Send failed: ${sendResult.safeMessage}`,
          mailboxConnectionId: connection.id,
          metadata: { draftId, attemptId: attempt.id, category: sendResult.category },
        });
        return {
          status: "failed" as const,
          retryable: sendResult.retryable,
          attemptId: attempt.id,
        };
      }

      // Success
      await markSendAttemptSent(tx, attempt.id, sendResult.providerMessageId, sendResult.providerThreadId, sendResult.rfcMessageId);

      // Ingest the sent message locally
      const existingThread = draft.threadId
        ? await getMailboxThreadDetail({ orgId, threadId: draft.threadId })
        : null;

      if (existingThread) {
        await upsertMailboxMessage({
          orgId,
          threadId: existingThread.thread.id,
          envelope: {
            providerMessageId: sendResult.providerMessageId,
            rfcMessageId: sendResult.rfcMessageId,
            direction: "outbound",
            from: { email: draft.fromIdentity, displayName: null },
            to: draft.toRecipients.map((email) => ({ email, displayName: null })),
            cc: draft.ccRecipients.map((email) => ({ email, displayName: null })),
            subject: draft.subject,
            snippet: draft.htmlBody.replace(/<[^>]+>/g, "").slice(0, 200),
            sentAt: new Date().toISOString(),
            receivedAt: null,
            attachmentCount: draft.attachmentRefs.length,
            providerMetadata: {},
            htmlBody: draft.htmlBody,
            textBody: draft.textBody,
          },
        });
        await updateMailboxThreadSummary(tx, existingThread.thread.id, orgId);
      } else {
        const thread = await upsertMailboxThread({
          orgId,
          mailboxConnectionId: connection.id,
          envelope: {
            providerThreadId: sendResult.providerThreadId,
            subject: draft.subject,
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            participants: [
              { email: draft.fromIdentity, displayName: null },
              ...draft.toRecipients.map((email) => ({ email, displayName: null })),
            ],
            providerMetadata: {},
          },
        });
        await upsertMailboxMessage({
          orgId,
          threadId: thread.id,
          envelope: {
            providerMessageId: sendResult.providerMessageId,
            rfcMessageId: sendResult.rfcMessageId,
            direction: "outbound",
            from: { email: draft.fromIdentity, displayName: null },
            to: draft.toRecipients.map((email) => ({ email, displayName: null })),
            cc: draft.ccRecipients.map((email) => ({ email, displayName: null })),
            subject: draft.subject,
            snippet: draft.htmlBody.replace(/<[^>]+>/g, "").slice(0, 200),
            sentAt: new Date().toISOString(),
            receivedAt: null,
            attachmentCount: draft.attachmentRefs.length,
            providerMetadata: {},
            htmlBody: draft.htmlBody,
            textBody: draft.textBody,
          },
        });
      }

      await tx.mailboxDraft.update({
        where: { id: draftId },
        data: { status: "SENT" },
      });

      await logMailboxAuditTx(tx, {
        orgId,
        actorId: userId,
        action: "MESSAGE_SENT",
        summary: "Message sent successfully",
        mailboxConnectionId: connection.id,
        metadata: { draftId, attemptId: attempt.id, providerMessageId: sendResult.providerMessageId },
      });

      return {
        status: "sent" as const,
        providerMessageId: sendResult.providerMessageId,
        providerThreadId: sendResult.providerThreadId,
        attemptId: attempt.id,
      };
    } catch (error) {
      await markSendAttemptPendingReconciliation(tx, attempt.id);
      await logMailboxAuditTx(tx, {
        orgId,
        actorId: userId,
        action: "MESSAGE_SENT",
        summary: "Send entered pending reconciliation due to ambiguous outcome",
        mailboxConnectionId: connection.id,
        metadata: { draftId, attemptId: attempt.id },
      });
      return {
        status: "pending_reconciliation" as const,
        attemptId: attempt.id,
      };
    }
  });

  if (result.status === "failed") {
    return { status: "failed", retryable: result.retryable, sendAttemptId: result.attemptId };
  }

  return {
    status: result.status,
    providerMessageId: result.providerMessageId,
    providerThreadId: result.providerThreadId,
    sendAttemptId: result.attemptId,
  };
}

export async function reconcileSendAttempt({
  orgId,
  userId,
  role,
  attemptId,
}: {
  orgId: string;
  userId: string;
  role: string;
  attemptId: string;
}): Promise<ReconcileResult> {
  const attempt = await db.mailboxSendAttempt.findFirst({
    where: { id: attemptId, orgId },
  });

  if (!attempt) {
    throw new SendServiceError("Send attempt not found", 404);
  }

  const draft = await db.mailboxDraft.findFirst({
    where: { id: attempt.draftId, orgId },
  });

  if (draft && draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new SendServiceError("You do not have permission to reconcile this attempt", 403);
  }

  if (attempt.status !== "PENDING_RECONCILIATION") {
    throw new SendServiceError("Attempt is not in pending reconciliation state", 400);
  }

  const connection = await db.mailboxConnection.findFirst({
    where: { id: attempt.mailboxConnectionId, orgId },
  });
  if (!connection || !connection.tokenRef) {
    throw new SendServiceError("Mailbox connection not available", 400);
  }

  const adapter = getMailboxProviderAdapter(connection.provider);

  const reconcileResult = await adapter.reconcileSend({
    orgId,
    tokenRef: connection.tokenRef,
    correlationKey: attempt.correlationKey,
    rfcMessageId: attempt.rfcMessageId,
  });

  if ("category" in reconcileResult) {
    // Provider error during reconciliation
    await db.mailboxSendAttempt.update({
      where: { id: attemptId },
      data: { status: "PENDING_RECONCILIATION" },
    });
    return {
      status: "still_pending",
      message: `Provider reconciliation failed: ${reconcileResult.safeMessage}`,
    };
  }

  if (reconcileResult.found) {
    await db.mailboxSendAttempt.update({
      where: { id: attemptId },
      data: {
        status: "RECONCILED_SENT",
        providerMessageId: reconcileResult.providerMessageId,
        providerThreadId: reconcileResult.providerThreadId,
        rfcMessageId: reconcileResult.rfcMessageId,
      },
    });
    return {
      status: "reconciled_sent",
      providerMessageId: reconcileResult.providerMessageId ?? undefined,
      providerThreadId: reconcileResult.providerThreadId ?? undefined,
    };
  }

  await db.mailboxSendAttempt.update({
    where: { id: attemptId },
    data: { status: "RECONCILED_FAILED" },
  });
  return {
    status: "reconciled_failed",
    message: "Provider could not confirm the message was sent.",
  };
}
