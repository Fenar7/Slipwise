import "server-only";

/**
 * Messaging UI-facing read shapes and mappers.
 *
 * These shapes are what the UI consumes. They are explicitly separate from:
 * - Raw Prisma records (which may contain internal fields)
 * - Domain types (which are used in service layer logic)
 *
 * Security rules:
 * - No internal-only fields leak into read shapes.
 * - Dates are serialized to ISO strings at this boundary.
 * - Mappers are pure functions: they take domain records and aggregates and return read shapes.
 *   They never call the database.
 */

import type {
  ConversationRecord,
  ConversationParticipantRecord,
  ConversationMessageRecord,
  ConversationThreadRecord,
  MessageReactionRecord,
  MessageMentionRecord,
  ConversationReadStateRecord,
  ConversationType,
  ConversationVisibility,
  ConversationMessageStatus,
  ConversationParticipantRole,
} from "./domain-types";

import {
  conversationIsArchived,
  conversationIsLocked,
  conversationIsDM,
  conversationIsChannel,
  conversationIsGroup,
  participantIsActive,
  participantIsMuted,
  messageIsActive,
  messageIsDeleted,
  messageIsEdited,
  threadIsResolved,
} from "./domain-types";

// ─── Conversation Summary ───────────────────────────────────────────────────────

/**
 * A lightweight conversation summary for list views.
 * Does not include full participant lists or message history.
 */
export interface ConversationSummary {
  id: string;
  orgId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  visibility: ConversationVisibility | null;
  archivedAt: string | null;
  lockedAt: string | null;
  participantCount: number;
  lastMessageAt: string | null;
  unreadCount: number | null;
  createdAt: string;
  /** Whether the current user can send messages. */
  canSend: boolean;
}

export interface ConversationSummaryInput {
  record: ConversationRecord;
  participantCount: number;
  lastMessageAt: Date | null;
  unreadCount: number | null;
}

export function toConversationSummary(input: ConversationSummaryInput): ConversationSummary {
  const { record, participantCount, lastMessageAt, unreadCount } = input;
  return {
    id: record.id,
    orgId: record.orgId,
    type: record.type,
    name: record.name,
    description: record.description,
    visibility: record.visibility,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    lockedAt: record.lockedAt?.toISOString() ?? null,
    participantCount,
    lastMessageAt: lastMessageAt?.toISOString() ?? null,
    unreadCount,
    createdAt: record.createdAt.toISOString(),
    canSend: !conversationIsArchived(record) && !conversationIsLocked(record),
  };
}

// ─── Message Summary ────────────────────────────────────────────────────────────

/**
 * A lightweight message summary for feed views.
 */
export interface MessageSummary {
  id: string;
  orgId: string;
  conversationId: string;
  threadId: string | null;
  authorId: string;
  body: string;
  status: ConversationMessageStatus;
  editedAt: string | null;
  deletedAt: string | null;
  reactionSummary: Array<{ value: string; count: number; reactedByCurrentUser: boolean }>;
  attachmentCount: number;
  createdAt: string;
}

export interface MessageSummaryInput {
  record: ConversationMessageRecord;
  reactions: MessageReactionRecord[];
  currentUserId: string;
  attachmentCount?: number;
}

export function toMessageSummary(input: MessageSummaryInput): MessageSummary {
  const { record, reactions, currentUserId, attachmentCount = 0 } = input;

  const reactionMap = new Map<string, { count: number; reactedByCurrentUser: boolean }>();
  for (const reaction of reactions) {
    const existing = reactionMap.get(reaction.value);
    if (existing) {
      existing.count++;
      if (reaction.userId === currentUserId) {
        existing.reactedByCurrentUser = true;
      }
    } else {
      reactionMap.set(reaction.value, {
        count: 1,
        reactedByCurrentUser: reaction.userId === currentUserId,
      });
    }
  }

  const reactionSummary = Array.from(reactionMap.entries()).map(([value, meta]) => ({
    value,
    count: meta.count,
    reactedByCurrentUser: meta.reactedByCurrentUser,
  }));

  return {
    id: record.id,
    orgId: record.orgId,
    conversationId: record.conversationId,
    threadId: record.threadId,
    authorId: record.authorId,
    body: record.body,
    status: record.status,
    editedAt: record.editedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    reactionSummary,
    attachmentCount,
    createdAt: record.createdAt.toISOString(),
  };
}

// ─── Participant Summary ────────────────────────────────────────────────────────

/**
 * A lightweight participant summary for member lists.
 */
export interface ParticipantSummary {
  id: string;
  orgId: string;
  conversationId: string;
  userId: string;
  role: ConversationParticipantRole;
  isActive: boolean;
  isMuted: boolean;
  joinedAt: string;
}

export function toParticipantSummary(
  record: ConversationParticipantRecord,
): ParticipantSummary {
  return {
    id: record.id,
    orgId: record.orgId,
    conversationId: record.conversationId,
    userId: record.userId,
    role: record.role,
    isActive: participantIsActive(record),
    isMuted: participantIsMuted(record),
    joinedAt: record.joinedAt.toISOString(),
  };
}

// ─── Conversation Detail ────────────────────────────────────────────────────────

/**
 * Enriched conversation detail for the workspace view.
 * Includes participants, recent messages, and threads.
 */
export interface ConversationDetail {
  id: string;
  orgId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  visibility: ConversationVisibility | null;
  archivedAt: string | null;
  lockedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  canSend: boolean;
  participants: ParticipantSummary[];
  messages: MessageSummary[];
  threads: ThreadSummary[];
  readState: ReadStateSummary | null;
}

export interface ThreadSummary {
  id: string;
  conversationId: string;
  anchorMessageId: string;
  title: string | null;
  replyCount: number;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReadStateSummary {
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  isMuted: boolean;
}

export interface ConversationDetailInput {
  record: ConversationRecord;
  participants: ConversationParticipantRecord[];
  messages: ConversationMessageRecord[];
  messageReactions: Map<string, MessageReactionRecord[]>;
  threads: ConversationThreadRecord[];
  readState: ConversationReadStateRecord | null;
  currentUserId: string;
}

export function toConversationDetail(input: ConversationDetailInput): ConversationDetail {
  const { record, participants, messages, messageReactions, threads, readState, currentUserId } = input;

  const activeParticipants = participants.filter((p) => participantIsActive(p));

  return {
    id: record.id,
    orgId: record.orgId,
    type: record.type,
    name: record.name,
    description: record.description,
    visibility: record.visibility,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    lockedAt: record.lockedAt?.toISOString() ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    participantCount: activeParticipants.length,
    canSend: !conversationIsArchived(record) && !conversationIsLocked(record),
    participants: activeParticipants.map(toParticipantSummary),
    messages: messages.map((msg) =>
      toMessageSummary({
        record: msg,
        reactions: messageReactions.get(msg.id) ?? [],
        currentUserId,
        attachmentCount: 0,
      }),
    ),
    threads: threads.map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      anchorMessageId: t.anchorMessageId,
      title: t.title,
      replyCount: t.replyCount,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    readState: readState
      ? {
          lastReadMessageId: readState.lastReadMessageId,
          lastReadAt: readState.lastReadAt?.toISOString() ?? null,
          unreadCount: readState.unreadCount,
          isMuted: readState.isMuted,
        }
      : null,
  };
}

// ─── Message Detail ─────────────────────────────────────────────────────────────

/**
 * Enriched message detail for message actions / inspector views.
 */
export interface MessageDetail {
  id: string;
  orgId: string;
  conversationId: string;
  threadId: string | null;
  authorId: string;
  body: string;
  status: ConversationMessageStatus;
  editedAt: string | null;
  deletedAt: string | null;
  participantCountAtSend: number;
  createdAt: string;
  reactions: MessageReactionRecord[];
  mentions: MessageMentionRecord[];
}

export interface MessageDetailInput {
  record: ConversationMessageRecord;
  reactions: MessageReactionRecord[];
  mentions: MessageMentionRecord[];
}

export function toMessageDetail(input: MessageDetailInput): MessageDetail {
  const { record, reactions, mentions } = input;
  return {
    id: record.id,
    orgId: record.orgId,
    conversationId: record.conversationId,
    threadId: record.threadId,
    authorId: record.authorId,
    body: record.body,
    status: record.status,
    editedAt: record.editedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    participantCountAtSend: record.participantCountAtSend,
    createdAt: record.createdAt.toISOString(),
    reactions,
    mentions,
  };
}
