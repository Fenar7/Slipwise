import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ConversationThreadRecord, ConversationMessageRecord } from "./domain-types";
import {
  threadOrgSafeWhere,
  messageOrgSafeWhere,
} from "./org-safe-helpers";
import { toThreadRecord, toMessageRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import type {
  CreateThreadInput,
  ReplyToThreadInput,
  ResolveThreadInput,
} from "./service-contracts";
import {
  assertConversationAction,
} from "./service-helpers";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function assertThreadInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  threadId: string,
): Promise<Prisma.ConversationThreadGetPayload<Record<string, never>>> {
  const existing = await tx.conversationThread.findFirst({
    where: threadOrgSafeWhere(orgId, threadId),
  });
  if (!existing) {
    throw new Error("Thread action: thread not found or access denied");
  }
  return existing;
}

// ─── Queries ────────────────────────────────────────────────────────────────────

/**
 * Fetch a thread by id, org-scoped.
 */
export async function getThreadById(
  orgId: string,
  threadId: string,
): Promise<ConversationThreadRecord | null> {
  const row = await db.conversationThread.findFirst({
    where: threadOrgSafeWhere(orgId, threadId),
  });
  return row ? toThreadRecord(row) : null;
}

/**
 * List threads for a conversation.
 * Requires active participant status.
 */
export async function listThreadsForConversation(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationThreadRecord[]> {
  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId,
      leftAt: null,
    },
  });
  if (!participant) {
    throw new Error("listThreadsForConversation: active participant access required");
  }

  const rows = await db.conversationThread.findMany({
    where: {
      orgId,
      conversationId,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toThreadRecord);
}

/**
 * List replies for a thread.
 * Requires active participant status in the conversation.
 */
export async function listThreadReplies(
  orgId: string,
  conversationId: string,
  threadId: string,
  userId: string,
): Promise<ConversationMessageRecord[]> {
  // Verify the thread exists and belongs to the claimed conversation.
  // This prevents cross-conversation leakage when a user knows a foreign thread id.
  const thread = await db.conversationThread.findFirst({
    where: {
      id: threadId,
      orgId,
      conversationId,
    },
  });
  if (!thread) {
    throw new Error("listThreadReplies: thread not found or does not belong to conversation");
  }

  // Membership check must use the thread's actual conversation (defense in depth).
  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId: thread.conversationId,
      userId,
      leftAt: null,
    },
  });
  if (!participant) {
    throw new Error("listThreadReplies: active participant access required");
  }

  const rows = await db.conversationMessage.findMany({
    where: {
      orgId,
      threadId,
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMessageRecord);
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a thread from an anchor message.
 * Validates that the anchor belongs to the same conversation and org.
 */
export async function createThread(
  input: CreateThreadInput,
): Promise<ConversationThreadRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.createdBy,
      "CREATE_THREAD",
      "createThread",
    );

    // Verify anchor message exists and belongs to this conversation+org
    const anchor = await tx.conversationMessage.findFirst({
      where: {
        ...messageOrgSafeWhere(input.orgId, input.anchorMessageId),
        conversationId: input.conversationId,
      },
    });
    if (!anchor) {
      throw new Error("createThread: anchor message not found or does not belong to conversation");
    }

    const thread = await tx.conversationThread.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        anchorMessageId: input.anchorMessageId,
        title: input.title ?? null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.createdBy,
      action: "THREAD_CREATED",
      summary: `Created thread from message`,
      conversationId: input.conversationId,
      threadId: thread.id,
    });

    return toThreadRecord(thread);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.thread.created",
    input.createdBy,
    { threadId: result.id, anchorMessageId: input.anchorMessageId },
  );

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    result.conversationId,
    "conversation.thread.resolved",
    input.resolvedBy,
    { threadId: result.id },
  );

  return result;
}

/**
 * Reply to a thread. Validates the thread belongs to the conversation+org,
 * then creates the message and increments replyCount atomically.
 */
export async function replyToThread(
  input: ReplyToThreadInput,
): Promise<ConversationMessageRecord> {
  const result = await db.$transaction(async (tx) => {
    const thread = await assertThreadInOrg(tx, input.orgId, input.threadId);
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.authorId,
      "REPLY_TO_THREAD",
      "replyToThread",
    );

    if (thread.conversationId !== input.conversationId) {
      throw new Error("replyToThread: thread does not belong to conversation");
    }

    const participantCount = await tx.conversationParticipant.count({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        leftAt: null,
      },
    });

    const message = await tx.conversationMessage.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        threadId: input.threadId,
        authorId: input.authorId,
        body: input.body,
        contentMeta: input.contentMeta ?? null,
        participantCountAtSend: participantCount,
      },
    });

    await tx.conversationThread.update({
      where: { id: input.threadId, orgId: input.orgId },
      data: { replyCount: { increment: 1 } },
    });

    // Create attachments if provided
    if (input.attachments && input.attachments.length > 0) {
      await tx.conversationAttachment.createMany({
        data: input.attachments.map((att) => ({
          orgId: input.orgId,
          messageId: message.id,
          storageRef: att.storageRef,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          thumbnailRef: att.thumbnailRef ?? null,
          scanStatus: "PENDING" as const,
        })),
      });

      await logMessagingAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.authorId,
        action: "ATTACHMENT_UPLOADED",
        summary: `Linked ${input.attachments.length} attachment(s) to thread reply`,
        conversationId: input.conversationId,
        messageId: message.id,
      });
    }

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.authorId,
      action: "THREAD_REPLIED",
      summary: `Replied to thread`,
      conversationId: input.conversationId,
      threadId: input.threadId,
      messageId: message.id,
    });

    return toMessageRecord(message);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.thread.replied",
    input.authorId,
    { messageId: result.id, threadId: input.threadId },
  );

  return result;
}

/**
 * Mark a thread as resolved.
 */
export async function resolveThread(
  input: ResolveThreadInput,
): Promise<ConversationThreadRecord> {
  const result = await db.$transaction(async (tx) => {
    const thread = await assertThreadInOrg(tx, input.orgId, input.threadId);
    await assertConversationAction(
      tx,
      input.orgId,
      thread.conversationId,
      input.resolvedBy,
      "RESOLVE_THREAD",
      "resolveThread",
    );

    const updated = await tx.conversationThread.update({
      where: { id: input.threadId, orgId: input.orgId },
      data: { resolvedAt: new Date() },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.resolvedBy,
      action: "THREAD_RESOLVED",
      summary: `Resolved thread`,
      conversationId: thread.conversationId,
      threadId: updated.id,
    });

    return toThreadRecord(updated);
  });

  return result;
}
