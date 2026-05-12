import "server-only";

/**
 * Messaging read-model service functions.
 *
 * These functions aggregate data from multiple service queries to produce
 * UI-facing read shapes. They are the authoritative server-side read layer
 * for the messaging workspace.
 *
 * Rules:
 * - All functions are org-scoped and membership-aware.
 * - No raw Prisma records leak into outputs.
 * - Deterministic ordering: messages ascending by createdAt, threads descending by createdAt.
 * - Pagination is explicit and bounded.
 */

import { db } from "@/lib/db";
import type {
  ConversationRecord,
  ConversationMessageRecord,
  MessageReactionRecord,
} from "./domain-types";
import { conversationOrgSafeWhere, participantOrgSafeWhere } from "./org-safe-helpers";
import { toConversationRecord, toMessageRecord, toThreadRecord, toReadStateRecord } from "./mappers";
import {
  toConversationSummary,
  toConversationDetail,
  toMessageDetail,
  type ConversationSummary,
  type ConversationDetail,
  type MessageDetail,
} from "./read-shapes";
import {
  getConversationById,
  listConversationsForUser,
} from "./conversation-service";
import {
  listParticipantsForConversation,
} from "./participant-service";
import {
  listConversationMessages,
  getMessageById,
} from "./message-service";
import {
  listThreadsForConversation,
} from "./thread-service";
import {
  listReactionsForMessage,
} from "./reaction-service";
import {
  getReadState,
} from "./mention-readstate-service";

// ─── Conversation list read model ───────────────────────────────────────────────

export interface ListConversationSummariesOptions {
  limit?: number;
  cursor?: string | null;
}

/**
 * List conversation summaries for a user with derived metadata.
 * Returns only conversations where the user is an active participant.
 */
export async function listConversationSummariesForUser(
  orgId: string,
  userId: string,
  options?: ListConversationSummariesOptions,
): Promise<ConversationSummary[]> {
  const conversations = await listConversationsForUser(orgId, userId);

  // Apply cursor pagination manually since listConversationsForUser returns all
  let paginated = conversations;
  if (options?.cursor) {
    const cursorIndex = conversations.findIndex((c) => c.id === options.cursor);
    if (cursorIndex !== -1) {
      paginated = conversations.slice(cursorIndex + 1);
    }
  }

  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  paginated = paginated.slice(0, limit);

  // Gather aggregates in parallel
  const results = await Promise.all(
    paginated.map(async (conversation) => {
      const [participantCount, latestMessage, readState] = await Promise.all([
        db.conversationParticipant.count({
          where: {
            orgId,
            conversationId: conversation.id,
            leftAt: null,
          },
        }),
        db.conversationMessage.findFirst({
          where: {
            orgId,
            conversationId: conversation.id,
            status: { not: "DELETED" },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        db.conversationReadState.findFirst({
          where: {
            orgId,
            conversationId: conversation.id,
            userId,
          },
          select: { unreadCount: true },
        }),
      ]);

      return toConversationSummary({
        record: conversation,
        participantCount,
        lastMessageAt: latestMessage?.createdAt ?? null,
        unreadCount: readState?.unreadCount ?? null,
      });
    }),
  );

  return results;
}

// ─── Conversation detail read model ───────────────────────────────────────────

export interface GetConversationDetailOptions {
  messageLimit?: number;
  messageCursor?: string | null;
}

/**
 * Fetch an enriched conversation detail for the workspace view.
 * Validates that the requesting user is an active participant.
 */
export async function getConversationDetail(
  orgId: string,
  conversationId: string,
  userId: string,
  options?: GetConversationDetailOptions,
): Promise<ConversationDetail | null> {
  // Verify membership first
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    return null;
  }

  const conversation = await getConversationById(orgId, conversationId);
  if (!conversation) {
    return null;
  }

  const [participants, messages, threads, readState] = await Promise.all([
    listParticipantsForConversation(orgId, conversationId, userId),
    listConversationMessages(orgId, conversationId, userId, {
      limit: options?.messageLimit ?? 50,
      cursor: options?.messageCursor ?? undefined,
    }),
    listThreadsForConversation(orgId, conversationId, userId),
    getReadState(orgId, conversationId, userId),
  ]);

  // Fetch reactions and attachment counts for all messages in one batch
  const messageIds = messages.map((m) => m.id);
  const [reactionsRows, attachmentRows] = await Promise.all([
    messageIds.length > 0
      ? db.messageReaction.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
          },
        })
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.conversationAttachment.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
          },
          select: { messageId: true },
        })
      : Promise.resolve([]),
  ]);

  const reactionsByMessageId = new Map<string, MessageReactionRecord[]>();
  for (const row of reactionsRows) {
    const list = reactionsByMessageId.get(row.messageId) ?? [];
    list.push(row);
    reactionsByMessageId.set(row.messageId, list);
  }

  const attachmentCountByMessageId = new Map<string, number>();
  for (const row of attachmentRows) {
    const count = attachmentCountByMessageId.get(row.messageId) ?? 0;
    attachmentCountByMessageId.set(row.messageId, count + 1);
  }

  return toConversationDetail({
    record: conversation,
    participants,
    messages,
    messageReactions: reactionsByMessageId,
    threads,
    readState,
    currentUserId: userId,
    attachmentCountByMessageId,
  });
}

// ─── Message detail read model ──────────────────────────────────────────────────

/**
 * Fetch an enriched message detail with reactions and mentions.
 * Requires active participant status in the message's conversation.
 */
export async function getMessageDetail(
  orgId: string,
  messageId: string,
  userId: string,
): Promise<MessageDetail | null> {
  const message = await getMessageById(orgId, messageId);
  if (!message) {
    return null;
  }

  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId: message.conversationId,
      userId,
      leftAt: null,
    },
  });
  if (!participant) {
    return null;
  }

  const [reactions, mentions, attachments] = await Promise.all([
    listReactionsForMessage(orgId, messageId),
    db.messageMention.findMany({
      where: {
        orgId,
        messageId,
      },
    }),
    db.conversationAttachment.findMany({
      where: {
        orgId,
        messageId,
      },
    }),
  ]);

  return toMessageDetail({
    record: message,
    reactions,
    mentions,
    attachments,
  });
}
