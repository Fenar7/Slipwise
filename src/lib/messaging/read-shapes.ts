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
  ConversationAttachmentRecord,
  MessagingTaskRecord,
  MessagingTaskStatus,
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
  taskIsOverdue,
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
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
  }>;
  mentionsCurrentUser: boolean;
  createdAt: string;
}

export interface MessageSummaryInput {
  record: ConversationMessageRecord;
  reactions: MessageReactionRecord[];
  currentUserId: string;
  attachmentCount?: number;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
  }>;
  mentionsCurrentUser?: boolean;
}

export function toMessageSummary(input: MessageSummaryInput): MessageSummary {
  const { record, reactions, currentUserId, attachmentCount = 0, mentionsCurrentUser = false, attachments: msgAttachments } = input;

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
    attachments: msgAttachments,
    mentionsCurrentUser,
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
  currentUserId: string;
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
  mentionCurrentUserByMessageId?: Map<string, boolean>;
  threads: ConversationThreadRecord[];
  readState: ConversationReadStateRecord | null;
  currentUserId: string;
  attachmentCountByMessageId?: Map<string, number>;
  attachmentsByMessageId?: Map<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; scanStatus: string }>>;
}

export function toConversationDetail(input: ConversationDetailInput): ConversationDetail {
  const {
    record,
    participants,
    messages,
    messageReactions,
    mentionCurrentUserByMessageId,
    threads,
    readState,
    currentUserId,
    attachmentCountByMessageId,
    attachmentsByMessageId,
  } = input;

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
        attachmentCount: attachmentCountByMessageId?.get(msg.id) ?? 0,
        mentionsCurrentUser: mentionCurrentUserByMessageId?.get(msg.id) ?? false,
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
    currentUserId,
  };
}

// ─── Message Detail ─────────────────────────────────────────────────────────────

/**
 * Attachment summary for message detail views.
 */
export interface AttachmentSummary {
  id: string;
  storageRef: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailRef: string | null;
  scanStatus: string;
  createdAt: string;
}

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
  attachments: AttachmentSummary[];
}

export interface MessageDetailInput {
  record: ConversationMessageRecord;
  reactions: MessageReactionRecord[];
  mentions: MessageMentionRecord[];
  attachments?: ConversationAttachmentRecord[];
}

function toAttachmentSummary(record: ConversationAttachmentRecord): AttachmentSummary {
  return {
    id: record.id,
    storageRef: record.storageRef,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    thumbnailRef: record.thumbnailRef,
    scanStatus: record.scanStatus,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toMessageDetail(input: MessageDetailInput): MessageDetail {
  const { record, reactions, mentions, attachments = [] } = input;
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
    attachments: attachments.map(toAttachmentSummary),
  };
}


// ─── Task Summary ─────────────────────────────────────────────────────────────

/** Server-side priority mapping: Prisma Int -> UI string contract. */
export type TaskPriorityString = "low" | "medium" | "high" | "critical";

function priorityNumberToString(priority: number): TaskPriorityString {
  switch (priority) {
    case 0: return "low";
    case 1: return "medium";
    case 2: return "high";
    case 3: return "critical";
    default: return "low";
  }
}

export interface TaskSummary {
  id: string;
  orgId: string;
  conversationId: string;
  originatingMessageId: string | null;
  title: string;
  description: string | null;
  status: MessagingTaskStatus;
  priority: TaskPriorityString;
  isOverdue: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarInitials: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  reminderSentAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  conversationName?: string | null;
  conversationType?: ConversationType;
}


export interface TaskSummaryInput {
  record: MessagingTaskRecord;
  assigneeName: string | null;
  assigneeAvatarInitials: string | null;
  createdByName: string | null;
}

export function toTaskSummary(input: TaskSummaryInput): TaskSummary {
  const { record, assigneeName, assigneeAvatarInitials, createdByName } = input;
  return {
    id: record.id,
    orgId: record.orgId,
    conversationId: record.conversationId,
    originatingMessageId: record.originatingMessageId,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: priorityNumberToString(record.priority),
    isOverdue: taskIsOverdue(record),
    assigneeId: record.assigneeId,
    assigneeName,
    assigneeAvatarInitials,
    dueDate: record.dueDate?.toISOString() ?? null,
    reminderAt: record.reminderAt?.toISOString() ?? null,
    reminderSentAt: record.reminderSentAt?.toISOString() ?? null,
    createdBy: record.createdBy,
    createdByName,
    createdAt: record.createdAt.toISOString(),
  };
}
