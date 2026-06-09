import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ConversationMessageRecord } from "./domain-types";
import {
  messageOrgSafeWhere,
  messageListOrgSafeWhere,
} from "./org-safe-helpers";
import { toMessageRecord } from "./mappers";
import { logMessagingAudit, logMessagingAuditTx } from "./audit";
import type {
  SendMessageInput,
  EditMessageInput,
  DeleteMessageInput,
} from "./service-contracts";
import {
  assertConversationAction,
} from "./service-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";
import { appendConversationEvent } from "./realtime/event-log-service";
import { indexAttachmentsForMessage } from "./indexing-service";

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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId: isUuid ? userId : undefined,
      customerId: !isUuid ? userId : undefined,
      leftAt: null,
    },
  });
  if (!participant) {
    throw new Error("listConversationMessages: active participant access required");
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, orgId },
  });

  const hideInternalNotes = conversation?.type === "PORTAL" && participant.kind === "PORTAL_CLIENT";

  const rows = await db.conversationMessage.findMany({
    where: {
      ...messageListOrgSafeWhere(orgId, conversationId),
      threadId: null,
      audience: hideInternalNotes ? "EXTERNAL_VISIBLE" : undefined,
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.authorId);

  // Rate limiting for portal client writes
  if (!isUuid) {
    const conversation = await db.conversation.findFirst({
      where: { id: input.conversationId, orgId: input.orgId },
    });
    if (conversation?.type === "PORTAL") {
      const limitResult = await rateLimit(`portal-msg:${input.authorId}`, { maxRequests: 20, window: "60 s" });
      if (!limitResult.success) {
        await logMessagingAudit({
          orgId: input.orgId,
          actorId: input.authorId,
          action: "PORTAL_CONVERSATION_RATE_LIMITED",
          summary: "Portal message send blocked: Rate limit exceeded",
          conversationId: input.conversationId,
          metadata: { customerId: input.authorId, reason: "rate_limit_exceeded" }
        });
        throw new Error("Rate limit exceeded. Please try again later.");
      }
    }
  }

  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    const { conversation } = await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.authorId,
      "SEND_MESSAGE",
      "sendMessage",
    );
    // If it's a portal conversation and the client sends a message, audience MUST be EXTERNAL_VISIBLE
    let msgAudience: "EXTERNAL_VISIBLE" | "INTERNAL_ONLY" = input.audience ?? "EXTERNAL_VISIBLE";
    if (conversation.type === "PORTAL" && !isUuid) {
      msgAudience = "EXTERNAL_VISIBLE";
    }

    // Closed portal conversation checks: only allow INTERNAL_ONLY notes
    if (conversation.type === "PORTAL" && conversation.portalState === "CLOSED") {
      if (msgAudience !== "INTERNAL_ONLY") {
        throw new Error("Cannot send replies to a closed portal conversation");
      }
    }

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
        authorId: isUuid ? input.authorId : null,
        customerId: !isUuid ? input.authorId : null,
        audience: msgAudience,
        body: input.body,
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
        action: conversation.type === "PORTAL" ? "PORTAL_ATTACHMENT_UPLOADED" : "ATTACHMENT_UPLOADED",
        summary: `Linked ${input.attachments.length} attachment(s) to message`,
        conversationId: input.conversationId,
        messageId: message.id,
      });
    }

    // Upsert read state for author to mark their own message as read
    if (isUuid) {
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
    } else {
      await tx.conversationReadState.upsert({
        where: {
          conversationId_customerId: {
            conversationId: input.conversationId,
            customerId: input.authorId,
          },
        },
        create: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          customerId: input.authorId,
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
    }

    // Handle portal specific audit events and state transitions
    if (conversation.type === "PORTAL") {
      let nextState: "WAITING_ON_INTERNAL" | "WAITING_ON_CLIENT" | null = null;
      let auditAction: any = "PORTAL_MESSAGE_SENT";
      let summary = "Sent portal message";

      if (!isUuid) {
        // Sent by external client
        nextState = "WAITING_ON_INTERNAL";
        auditAction = "PORTAL_MESSAGE_SENT";
        summary = `Client sent portal message`;
      } else {
        // Sent by internal user
        if (msgAudience === "INTERNAL_ONLY") {
          auditAction = "PORTAL_INTERNAL_NOTE_CREATED";
          summary = `Created internal note`;
        } else {
          nextState = "WAITING_ON_CLIENT";
          auditAction = "PORTAL_MESSAGE_SENT";
          summary = `Internal user sent portal message`;
        }
      }

      if (nextState) {
        await tx.conversation.update({
          where: { id: input.conversationId, orgId: input.orgId },
          data: { portalState: nextState },
        });
      }

      await logMessagingAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.authorId,
        action: auditAction,
        summary,
        conversationId: input.conversationId,
        messageId: message.id,
      });
    } else {
      await logMessagingAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.authorId,
        action: "MESSAGE_SENT",
        summary: `Sent message in conversation`,
        conversationId: input.conversationId,
        messageId: message.id,
      });
    }

    // Sprint 4.3: durable event log append for replay
    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.message.created",
      actorId: isUuid ? input.authorId : null,
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

  if (input.attachments && input.attachments.length > 0) {
    indexAttachmentsForMessage(result.id, input.orgId, input.conversationId);
  }

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
