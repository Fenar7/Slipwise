import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ConversationThreadRecord, ConversationMessageRecord } from "./domain-types";
import {
  threadOrgSafeWhere,
  messageOrgSafeWhere,
} from "./org-safe-helpers";
import { toConversationRecord, toThreadRecord, toMessageRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import type {
  CreateThreadInput,
  ReplyToThreadInput,
  ResolveThreadInput,
} from "./service-contracts";
import {
  assertActiveParticipant,
  assertConversationAccessible,
  getConversationInOrg,
} from "./service-helpers";

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
  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
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
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
      "createThread",
    );
    assertConversationAccessible(toConversationRecord(conversation), "createThread");
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.createdBy,
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
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
      "replyToThread",
    );
    assertConversationAccessible(toConversationRecord(conversation), "replyToThread");
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.authorId,
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
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      thread.conversationId,
      "resolveThread",
    );
    assertConversationAccessible(toConversationRecord(conversation), "resolveThread");
    await assertActiveParticipant(
      tx,
      input.orgId,
      thread.conversationId,
      input.resolvedBy,
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
