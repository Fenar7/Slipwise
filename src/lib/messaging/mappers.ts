import "server-only";

/**
 * Messaging domain mappers.
 *
 * Converts Prisma row shapes into domain records (and vice versa) without
 * leaking raw Prisma types outside the service layer.
 *
 * Rules:
 * - No credential fields are included in mapped outputs.
 * - All Date objects are preserved (ISO serialization is done at the read-shape layer).
 * - Null handling is explicit: never return undefined where the schema expects null.
 */

import type {
  Conversation,
  ConversationParticipant,
  ConversationMessage,
  ConversationThread,
  MessageReaction,
  MessageMention,
  ConversationReadState,
  ConversationDraft,
  PresenceSession,
  TypingSession,
  ConversationAttachment,
  MessagingTask,
  ConversationMeeting,
  CalendarConnection,
  RetentionPolicy,
  MessagingAuditEvent,
} from "@/generated/prisma/client";

import type {
  ConversationRecord,
  ConversationParticipantRecord,
  ConversationMessageRecord,
  ConversationThreadRecord,
  MessageReactionRecord,
  MessageMentionRecord,
  ConversationReadStateRecord,
  ConversationDraftRecord,
  PresenceSessionRecord,
  TypingSessionRecord,
  ConversationAttachmentRecord,
  MessagingTaskRecord,
  ConversationMeetingRecord,
  CalendarConnectionRecord,
  CalendarConnectionSummary,
  RetentionPolicyRecord,
  MessagingAuditEventRecord,
} from "./domain-types";

// ─── Conversation ─────────────────────────────────────────────────────────────

export function toConversationRecord(row: Conversation): ConversationRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    name: row.name ?? null,
    description: row.description ?? null,
    visibility: row.visibility ?? null,
    dmPeerId: row.dmPeerId ?? null,
    archivedAt: row.archivedAt ?? null,
    archivedBy: row.archivedBy ?? null,
    lockedAt: row.lockedAt ?? null,
    lockedBy: row.lockedBy ?? null,
    lockReason: row.lockReason ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Participant ──────────────────────────────────────────────────────────────

export function toParticipantRecord(row: ConversationParticipant): ConversationParticipantRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    userId: row.userId,
    role: row.role,
    leftAt: row.leftAt ?? null,
    mutedUntil: row.mutedUntil ?? null,
    displayName: row.displayName ?? null,
    isPinned: row.isPinned,
    joinedAt: row.joinedAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Message ──────────────────────────────────────────────────────────────────

export function toMessageRecord(row: ConversationMessage): ConversationMessageRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    threadId: row.threadId ?? null,
    authorId: row.authorId,
    body: row.body,
    contentMeta: (row.contentMeta as Record<string, unknown> | null) ?? null,
    status: row.status,
    editedAt: row.editedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    participantCountAtSend: row.participantCountAtSend,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Thread ───────────────────────────────────────────────────────────────────

export function toThreadRecord(row: ConversationThread): ConversationThreadRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    anchorMessageId: row.anchorMessageId,
    title: row.title ?? null,
    replyCount: row.replyCount,
    resolvedAt: row.resolvedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Reaction ─────────────────────────────────────────────────────────────────

export function toReactionRecord(row: MessageReaction): MessageReactionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    messageId: row.messageId,
    userId: row.userId,
    type: row.type,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Mention ──────────────────────────────────────────────────────────────────

export function toMentionRecord(row: MessageMention): MessageMentionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    messageId: row.messageId,
    mentionedUserId: row.mentionedUserId,
    offsetStart: row.offsetStart,
    offsetEnd: row.offsetEnd,
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledgedAt ?? null,
    createdAt: row.createdAt,
  };
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export function toDraftRecord(row: ConversationDraft): ConversationDraftRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    threadId: row.threadId ?? null,
    userId: row.userId,
    body: row.body,
    contentMeta: (row.contentMeta as Record<string, unknown> | null) ?? null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

// ─── Read State ───────────────────────────────────────────────────────────────

export function toReadStateRecord(row: ConversationReadState): ConversationReadStateRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    userId: row.userId,
    lastReadMessageId: row.lastReadMessageId ?? null,
    lastReadAt: row.lastReadAt ?? null,
    unreadCount: row.unreadCount,
    isMuted: row.isMuted,
    updatedAt: row.updatedAt,
  };
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export function toPresenceRecord(row: PresenceSession): PresenceSessionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    status: row.status,
    lastActivityAt: row.lastActivityAt,
    expiresAt: row.expiresAt ?? null,
    activeConversationId: row.activeConversationId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Typing ───────────────────────────────────────────────────────────────────

export function toTypingRecord(row: TypingSession): TypingSessionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    userId: row.userId,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Attachment ───────────────────────────────────────────────────────────────

export function toAttachmentRecord(row: ConversationAttachment): ConversationAttachmentRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    messageId: row.messageId,
    storageRef: row.storageRef,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    thumbnailRef: row.thumbnailRef ?? null,
    scanStatus: row.scanStatus,
    scannedAt: row.scannedAt ?? null,
    createdAt: row.createdAt,
  };
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export function toTaskRecord(row: MessagingTask): MessagingTaskRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    originatingMessageId: row.originatingMessageId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId ?? null,
    dueDate: row.dueDate ?? null,
    reminderAt: row.reminderAt ?? null,
    reminderSentAt: row.reminderSentAt ?? null,
    completedAt: row.completedAt ?? null,
    completedBy: row.completedBy ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    providerEventId: row.providerEventId ?? null,
  };
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export function toMeetingRecord(row: ConversationMeeting): ConversationMeetingRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId,
    title: row.title,
    description: row.description ?? null,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    providerEventId: row.providerEventId ?? null,
    joinUrl: row.joinUrl ?? null,
    scheduledBy: row.scheduledBy,
    cancelledAt: row.cancelledAt ?? null,
    cancelledBy: row.cancelledBy ?? null,
    cancelReason: row.cancelReason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export function toMeetingAttendeeRecord(row: import("@/generated/prisma/client").MeetingAttendee): import("./domain-types").MeetingAttendeeRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    meetingId: row.meetingId,
    userId: row.userId,
    rsvpStatus: row.rsvpStatus,
    respondedAt: row.respondedAt ?? null,
    providerAttendeeId: row.providerAttendeeId ?? null,
    providerStatus: row.providerStatus ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMeetingReminderRecord(row: import("@/generated/prisma/client").MeetingReminder): import("./domain-types").MeetingReminderRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    meetingId: row.meetingId,
    window: row.window,
    sentAt: row.sentAt ?? null,
    skipped: row.skipped,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}


// ─── Calendar Connection ──────────────────────────────────────────────────────

export function toCalendarConnectionRecord(row: CalendarConnection): CalendarConnectionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    emailAddress: row.emailAddress,
    displayName: row.displayName ?? null,
    tokenRef: row.tokenRef ?? null,
    tokenExpiry: row.tokenExpiry ?? null,
    status: row.status,
    lastSyncAt: row.lastSyncAt ?? null,
    lastSyncError: row.lastSyncError ?? null,
    disconnectedAt: row.disconnectedAt ?? null,
    connectedBy: row.connectedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Maps a CalendarConnectionRecord to a safe UI summary.
 *
 * Explicitly omits: tokenRef, tokenExpiry, providerAccountId, connectedBy, orgId, updatedAt.
 * All Dates are serialized to ISO strings so the shape is JSON-safe.
 */
export function toCalendarConnectionSummary(record: CalendarConnectionRecord): CalendarConnectionSummary {
  return {
    id: record.id,
    provider: record.provider,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    status: record.status,
    lastSyncAt: record.lastSyncAt ? record.lastSyncAt.toISOString() : null,
    lastSyncError: record.lastSyncError,
    disconnectedAt: record.disconnectedAt ? record.disconnectedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

// ─── Retention Policy ─────────────────────────────────────────────────────────

export function toRetentionPolicyRecord(row: RetentionPolicy): RetentionPolicyRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    conversationId: row.conversationId ?? null,
    retentionDays: row.retentionDays ?? null,
    action: row.action,
    isActive: row.isActive,
    lastAppliedAt: row.lastAppliedAt ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Audit Event ──────────────────────────────────────────────────────────────

export function toAuditEventRecord(row: MessagingAuditEvent): MessagingAuditEventRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    conversationId: row.conversationId ?? null,
    messageId: row.messageId ?? null,
    threadId: row.threadId ?? null,
    taskId: row.taskId ?? null,
    meetingId: row.meetingId ?? null,
    actorId: row.actorId,
    action: row.action,
    summary: row.summary,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
  };
}
