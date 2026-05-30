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
import { toConversationRecord, toMessageRecord, toThreadRecord, toReadStateRecord, toParticipantRecord } from "./mappers";
import {
  toConversationSummary,
  toConversationDetail,
  toMessageDetail,
  toTaskSummary,
  type ConversationSummary,
  type ConversationDetail,
  type MessageDetail,
  type TaskSummary,
} from "./read-shapes";
import {
  getConversationById,
  listConversationsForUser,
} from "./conversation-service";
import {
  getMessageById,
} from "./message-service";
import {
  listReactionsForMessage,
} from "./reaction-service";
import {
  getReadState,
} from "./mention-readstate-service";
import {
  listTasksForConversation,
  listAllTasksForUser,
} from "./task-service";
import type { TaskListFilterInput } from "./service-contracts";

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
    db.conversationParticipant.findMany({
      where: { orgId, conversationId, leftAt: null },
      orderBy: { joinedAt: "asc" },
    }).then((rows) => rows.map(toParticipantRecord)),
    db.conversationMessage.findMany({
      where: { orgId, conversationId, threadId: null },
      orderBy: { createdAt: "asc" },
      take: options?.messageLimit ?? 50,
      skip: options?.messageCursor ? 1 : 0,
      cursor: options?.messageCursor ? { id: options.messageCursor } : undefined,
    }).then((rows) => rows.map(toMessageRecord)),
    db.conversationThread.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: "desc" },
    }).then((rows) => rows.map(toThreadRecord)),
    getReadState(orgId, conversationId, userId),
  ]);

  // Fetch reactions and attachment counts for all messages in one batch
  const messageIds = messages.map((m) => m.id);
  const [reactionsRows, attachmentRows, mentionRows] = await Promise.all([
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
          select: {
            id: true,
            messageId: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            scanStatus: true,
          },
        })
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.messageMention.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
            mentionedUserId: userId,
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

  const attachmentsByMessageId = new Map<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; scanStatus: string }>>();
  for (const row of attachmentRows) {
    const list = attachmentsByMessageId.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      scanStatus: row.scanStatus,
    });
    attachmentsByMessageId.set(row.messageId, list);
  }
  const attachmentCountByMessageId = new Map<string, number>();
  for (const [msgId, atts] of attachmentsByMessageId.entries()) {
    attachmentCountByMessageId.set(msgId, atts.length);
  }

  const mentionCurrentUserByMessageId = new Map<string, boolean>();
  for (const row of mentionRows) {
    mentionCurrentUserByMessageId.set(row.messageId, true);
  }

  return toConversationDetail({
    record: conversation,
    participants,
    messages,
    messageReactions: reactionsByMessageId,
    mentionCurrentUserByMessageId,
    threads,
    readState,
    currentUserId: userId,
    attachmentCountByMessageId,
    attachmentsByMessageId,
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


// ─── Task summaries read model ──────────────────────────────────────────────────

export async function getConversationTaskSummaries(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<TaskSummary[]> {
  const records = await listTasksForConversation(orgId, conversationId, userId);

  if (records.length === 0) {
    return [];
  }

  const assigneeIds = Array.from(
    new Set(records.map((r) => r.assigneeId).filter((id): id is string => id !== null)),
  );
  const creatorIds = Array.from(
    new Set(records.map((r) => r.createdBy)),
  );
  const allUserIds = Array.from(new Set([...assigneeIds, ...creatorIds]));

  const profiles =
    allUserIds.length > 0
      ? await db.profile.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true },
        })
      : [];

  const profileById = new Map<string, { name: string }>();
  for (const p of profiles) {
    profileById.set(p.id, p);
  }

  function getInitials(name: string | null): string | null {
    if (!name) return null;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return records.map((record) => {
    const assignee = record.assigneeId ? profileById.get(record.assigneeId) ?? null : null;
    const creator = profileById.get(record.createdBy) ?? null;
    return toTaskSummary({
      record,
      assigneeName: assignee?.name ?? null,
      assigneeAvatarInitials: getInitials(assignee?.name ?? null),
      createdByName: creator?.name ?? null,
    });
  });
}

export interface GetOrgTaskSummariesOptions {
  scope?: TaskListFilterInput["scope"];
  conversationId?: string;
  cursor?: string | null;
  limit?: number;
}

export async function getOrgTaskSummaries(
  orgId: string,
  userId: string,
  options?: GetOrgTaskSummariesOptions,
): Promise<{ tasks: TaskSummary[]; nextCursor: string | null; hasMore: boolean }> {
  const result = await listAllTasksForUser({
    orgId,
    userId,
    scope: options?.scope,
    conversationId: options?.conversationId,
    cursor: options?.cursor,
    limit: options?.limit,
  });

  if (result.tasks.length === 0) {
    return { tasks: [], nextCursor: null, hasMore: false };
  }

  const assigneeIds = Array.from(
    new Set(result.tasks.map((r) => r.assigneeId).filter((id): id is string => id !== null)),
  );
  const creatorIds = Array.from(
    new Set(result.tasks.map((r) => r.createdBy)),
  );
  const allUserIds = Array.from(new Set([...assigneeIds, ...creatorIds]));
  const conversationIds = Array.from(new Set(result.tasks.map((r) => r.conversationId)));

  const [profiles, conversations] = await Promise.all([
    allUserIds.length > 0
      ? db.profile.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    db.conversation.findMany({
      where: {
        id: { in: conversationIds },
        orgId,
      },
      select: {
        id: true,
        type: true,
        name: true,
      },
    }),
  ]);

  const profileById = new Map<string, { name: string }>();
  for (const p of profiles) {
    profileById.set(p.id, p);
  }

  const conversationById = new Map<string, { type: "CHANNEL" | "DM" | "GROUP"; name: string | null }>();
  for (const c of conversations) {
    conversationById.set(c.id, {
      type: c.type,
      name: c.name,
    });
  }

  function getInitials(name: string | null): string | null {
    if (!name) return null;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const tasks = result.tasks.map((record) => {
    const assignee = record.assigneeId ? profileById.get(record.assigneeId) ?? null : null;
    const creator = profileById.get(record.createdBy) ?? null;
    const conv = conversationById.get(record.conversationId) ?? null;
    
    const baseSummary = toTaskSummary({
      record,
      assigneeName: assignee?.name ?? null,
      assigneeAvatarInitials: getInitials(assignee?.name ?? null),
      createdByName: creator?.name ?? null,
    });

    return {
      ...baseSummary,
      conversationName: conv?.name ?? null,
      conversationType: conv?.type ?? undefined,
    };
  });

  return {
    tasks,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

