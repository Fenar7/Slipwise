import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ConversationMessageRecord } from "./domain-types";
import {
  messageOrgSafeWhere,
  messageListOrgSafeWhere,
} from "./org-safe-helpers";
import { toMessageRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import type {
  SendMessageInput,
  EditMessageInput,
  DeleteMessageInput,
  MessageAttachmentDescriptor,
} from "./service-contracts";
import {
  assertConversationAction,
} from "./service-helpers";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";
import { appendConversationEvent } from "./realtime/event-log-service";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function assertMessageInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  messageId: string,
): Promise<Prisma.ConversationMessageGetPayload<Record<string, never>>> {
  const existing = await tx.conversationMessage.findFirst({
    where: messageOrgSafeWhere(orgId, messageId),
  });
  if (!existing) {
    throw new Error("Message action: message not found or access denied");
  }
  return existing;
}

async function countActiveParticipants(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
): Promise<number> {
  return tx.conversationParticipant.count({
    where: {
      orgId,
      conversationId,
      leftAt: null,
    },
  });
}

// ─── Queries ────────────────────────────────────────────────────────────────────

/**
 * Fetch a message by id, org-scoped.
 */
export async function getMessageById(
  orgId: string,
  messageId: string,
): Promise<ConversationMessageRecord | null> {
  const row = await db.conversationMessage.findFirst({
    where: messageOrgSafeWhere(orgId, messageId),
  });
  return row ? toMessageRecord(row) : null;
}

/**
 * List messages for a conversation.
 * Ordered by createdAt ascending for chronological feed.
 * Requires active participant status.
 */
export async function listConversationMessages(
  orgId: string,
  conversationId: string,
  userId: string,
  options?: { limit?: number; cursor?: string },
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
    throw new Error("listConversationMessages: active participant access required");
  }

  const rows = await db.conversationMessage.findMany({
    where: {
      ...messageListOrgSafeWhere(orgId, conversationId),
      threadId: null,
    },
    orderBy: { createdAt: "asc" },
    take: options?.limit ?? 50,
    skip: options?.cursor ? 1 : 0,
    cursor: options?.cursor ? { id: options.cursor } : undefined,
  });
  return rows.map(toMessageRecord);
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Send a top-level message or a thread reply.
 * Also creates mention rows and updates the author's read state.
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<ConversationMessageRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.authorId,
      "SEND_MESSAGE",
      "sendMessage",
    );

    if (input.threadId) {
      const thread = await tx.conversationThread.findFirst({
        where: {
          id: input.threadId,
          orgId: input.orgId,
          conversationId: input.conversationId,
        },
      });

      if (!thread) {
        throw new Error("sendMessage: thread not found or does not belong to conversation");
      }
    }

    if (input.mentions && input.mentions.length > 0) {
      const mentionedUserIds = [...new Set(input.mentions.map((mention) => mention.userId))];
      const activeParticipants = await tx.conversationParticipant.findMany({
        where: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          userId: { in: mentionedUserIds },
          leftAt: null,
        },
        select: { userId: true },
      });
      const activeUserIds = new Set(activeParticipants.map((participant) => participant.userId));
      const invalidMention = mentionedUserIds.find((userId) => !activeUserIds.has(userId));
      if (invalidMention) {
        throw new Error(`sendMessage: mentioned user is not an active participant: ${invalidMention}`);
      }

      // Validate offset ranges fall within message body length and are ordered correctly
      const bodyLen = input.body.length;
      for (const m of input.mentions) {
        if (m.offsetStart < 0 || m.offsetEnd > bodyLen || m.offsetStart >= m.offsetEnd) {
          throw new Error(
            `sendMessage: mention offset range [${m.offsetStart}, ${m.offsetEnd}] is out of bounds for body length ${bodyLen}`,
          );
        }
        const span = input.body.slice(m.offsetStart, m.offsetEnd);
        if (!span.startsWith("@")) {
          throw new Error("sendMessage: mention span must start with '@'");
        }
      }
    }

    const participantCount = await countActiveParticipants(
      tx,
      input.orgId,
      input.conversationId,
    );

    const message = await tx.conversationMessage.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        threadId: input.threadId ?? null,
        authorId: input.authorId,
        body: input.body,
        contentMeta: (input.contentMeta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        participantCountAtSend: participantCount,
      },
    });

    // Create mentions if provided
    if (input.mentions && input.mentions.length > 0) {
      await tx.messageMention.createMany({
        data: input.mentions.map((m) => ({
          orgId: input.orgId,
          messageId: message.id,
          mentionedUserId: m.userId,
          offsetStart: m.offsetStart,
          offsetEnd: m.offsetEnd,
        })),
        skipDuplicates: true,
      });
    }

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
        summary: `Linked ${input.attachments.length} attachment(s) to message`,
        conversationId: input.conversationId,
        messageId: message.id,
      });
    }

    // Upsert read state for author to mark their own message as read
    await tx.conversationReadState.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.authorId,
        },
      },
      create: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.authorId,
        lastReadMessageId: message.id,
        lastReadAt: new Date(),
        unreadCount: 0,
      },
      update: {
        lastReadMessageId: message.id,
        lastReadAt: new Date(),
        unreadCount: 0,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.authorId,
      action: "MESSAGE_SENT",
      summary: `Sent message in conversation`,
      conversationId: input.conversationId,
      messageId: message.id,
    });

    // Sprint 4.3: durable event log append for replay
    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.message.created",
      actorId: input.authorId,
      payload: { messageId: message.id, threadId: message.threadId },
    });

    return toMessageRecord(message);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.message.created",
    input.authorId,
    { messageId: result.id, threadId: result.threadId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Edit a message. Marks status as EDITED and records editedAt.
 */
export async function editMessage(
  input: EditMessageInput,
): Promise<ConversationMessageRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    const existing = await assertMessageInOrg(tx, input.orgId, input.messageId);
    await assertConversationAction(
      tx,
      input.orgId,
      existing.conversationId,
      input.actorId,
      "EDIT_MESSAGE",
      "editMessage",
    );

    if (existing.authorId !== input.actorId) {
      throw new Error("editMessage: can only edit your own messages");
    }

    if (existing.status === "DELETED") {
      throw new Error("editMessage: cannot edit a deleted message");
    }

    const updated = await tx.conversationMessage.update({
      where: { id: input.messageId, orgId: input.orgId },
      data: {
        body: input.body,
        status: "EDITED",
        editedAt: new Date(),
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "MESSAGE_EDITED",
      summary: `Edited message`,
      conversationId: existing.conversationId,
      messageId: updated.id,
    });

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: existing.conversationId,
      eventType: "conversation.message.edited",
      actorId: input.actorId,
      payload: { messageId: updated.id },
    });

    return toMessageRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    result.conversationId,
    "conversation.message.edited",
    input.actorId,
    { messageId: result.id },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Soft-delete a message.
 */
export async function softDeleteMessage(
  input: DeleteMessageInput,
): Promise<ConversationMessageRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    const existing = await assertMessageInOrg(tx, input.orgId, input.messageId);
    await assertConversationAction(
      tx,
      input.orgId,
      existing.conversationId,
      input.actorId,
      "DELETE_MESSAGE",
      "softDeleteMessage",
    );

    if (existing.authorId !== input.actorId) {
      throw new Error("softDeleteMessage: can only delete your own messages");
    }

    const updated = await tx.conversationMessage.update({
      where: { id: input.messageId, orgId: input.orgId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "MESSAGE_DELETED",
      summary: `Deleted message`,
      conversationId: existing.conversationId,
      messageId: updated.id,
    });

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: existing.conversationId,
      eventType: "conversation.message.deleted",
      actorId: input.actorId,
      payload: { messageId: updated.id },
    });

    return toMessageRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    result.conversationId,
    "conversation.message.deleted",
    input.actorId,
    { messageId: result.id },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}
