import "server-only";

/**
 * Mailbox send service.
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
import { getMailboxThreadDetail } from "./thread-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";
import { logMailboxAuditTx } from "./audit";
import { toMailboxDraftReadShape } from "./read-shapes";
import type { MailboxDraftReadShape } from "./read-shapes";
import type { MailboxDraftMode } from "./domain-types";
import { DraftServiceError } from "./draft-service";

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

export interface SendDraftResult {
  draft: MailboxDraftReadShape;
  providerMessageId: string | null;
  providerThreadId: string | null;
}

// ─── Permission helpers ───────────────────────────────────────────────────────

async function assertCanSendFromConnection(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  connectionId: string,
): Promise<void> {
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const connection = accessible.find((c) => c.id === connectionId);
  if (!connection) {
    throw new SendServiceError("Mailbox connection not accessible", 403);
  }
  const isReadOnly = role === "member" && connection.visibilityPolicy === "org_shared";
  if (isReadOnly) {
    throw new SendServiceError("You do not have permission to send from this mailbox", 403);
  }
}

// ─── Core: send draft ───────────────────────────────────────────────────────

/**
 * Send the draft via the provider associated with its mailbox connection.
 *
 * Steps:
 * 1. Load the draft and verify ownership / permissions.
 * 2. Verify the draft is ACTIVE (not already sent or discarded).
 * 3. Load the mailbox connection to get provider + tokenRef.
 * 4. For thread-bound modes: load thread detail to get providerThreadId and
 *    the original message's RFC Message-ID for reply threading.
 * 5. Invoke the provider adapter's sendMessage.
 * 6. On success: transition draft to SENT and write audit event.
 * 7. On failure: return a safe error; draft remains ACTIVE.
 */
export async function sendDraft(input: SendDraftInput): Promise<SendDraftResult> {
  const { orgId, userId, role, draftId } = input;

  const draft = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
  });

  if (!draft) {
    throw new SendServiceError("Draft not found", 404);
  }

  // Ownership guard: only the creator or org admin may send.
  if (draft.createdBy !== userId && role !== "owner" && role !== "admin") {
    throw new SendServiceError("You do not have permission to send this draft", 403);
  }

  if (draft.status !== "ACTIVE") {
    throw new SendServiceError(`Cannot send draft with status ${draft.status}`, 409);
  }

  await assertCanSendFromConnection(orgId, userId, role, draft.mailboxConnectionId);

  const connection = await db.mailboxConnection.findFirst({
    where: { id: draft.mailboxConnectionId, orgId },
  });

  if (!connection) {
    throw new SendServiceError("Mailbox connection not found", 404);
  }

  if (connection.status !== "ACTIVE") {
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

      // Find the message being replied to / forwarded
      const replyToMessageId = draft.replyToMessageId;
      let inReplyToRfcMessageId: string | null = null;
      let references: string[] | null = null;

      if (replyToMessageId && threadDetail.messages) {
        const targetMessage = threadDetail.messages.find((m) => m.providerMessageId === replyToMessageId);
        if (targetMessage) {
          inReplyToRfcMessageId = targetMessage.rfcMessageId ?? null;
          // Build references chain from all prior messages in the thread
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

  const adapter = getMailboxProviderAdapter(connection.provider);

  const sendResult = await adapter.sendMessage({
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
  });

  if (isMailboxProviderError(sendResult)) {
    throw new SendServiceError(
      sendResult.safeMessage,
      mapProviderErrorToHttpStatus(sendResult.category),
    );
  }

  // Success: transition draft to SENT and write audit event
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
      },
    });

    return sent;
  });

  return {
    draft: toMailboxDraftReadShape(updatedDraft as unknown as import("./domain-types").MailboxDraftRecord),
    providerMessageId: sendResult.providerMessageId,
    providerThreadId: sendResult.providerThreadId,
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
