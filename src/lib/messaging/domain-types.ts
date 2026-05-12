import "server-only";

/**
 * Messaging domain types.
 *
 * These are the server-side domain types for the internal messaging platform.
 * They are distinct from the UI-facing read shapes and from raw Prisma records.
 *
 * Rules:
 * - These types mirror the Prisma schema but are not raw Prisma records.
 * - They may be used in service layer logic, validation, and mappers.
 * - No raw credential fields are stored in messaging records.
 */

import type {
  ConversationType,
  ConversationVisibility,
  ConversationMessageStatus,
  ConversationParticipantRole,
  MessageReactionType,
  PresenceStatus,
  TypingStatus,
  AttachmentScanStatus,
  MessagingTaskStatus,
  MeetingStatus,
  CalendarProvider,
  CalendarConnectionStatus,
  MessagingAuditAction,
  RetentionPolicyType,
  RetentionAction,
} from "@/generated/prisma/client";

// Re-export enums for use in service layer without importing from generated client directly.
export type {
  ConversationType,
  ConversationVisibility,
  ConversationMessageStatus,
  ConversationParticipantRole,
  MessageReactionType,
  PresenceStatus,
  TypingStatus,
  AttachmentScanStatus,
  MessagingTaskStatus,
  MeetingStatus,
  CalendarProvider,
  CalendarConnectionStatus,
  MessagingAuditAction,
  RetentionPolicyType,
  RetentionAction,
};

// ─── Conversation ───────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: string;
  orgId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  visibility: ConversationVisibility | null;
  dmPeerId: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  lockReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function conversationIsArchived(record: ConversationRecord): boolean {
  return record.archivedAt !== null;
}

export function conversationIsLocked(record: ConversationRecord): boolean {
  return record.lockedAt !== null;
}

export function conversationIsDM(record: ConversationRecord): boolean {
  return record.type === "DM";
}

export function conversationIsChannel(record: ConversationRecord): boolean {
  return record.type === "CHANNEL";
}

export function conversationIsGroup(record: ConversationRecord): boolean {
  return record.type === "GROUP";
}

export function conversationIsAccessible(record: ConversationRecord): boolean {
  return !conversationIsArchived(record) && !conversationIsLocked(record);
}

// ─── Participant ──────────────────────────────────────────────────────────────

export interface ConversationParticipantRecord {
  id: string;
  orgId: string;
  conversationId: string;
  userId: string;
  role: ConversationParticipantRole;
  leftAt: Date | null;
  mutedUntil: Date | null;
  displayName: string | null;
  isPinned: boolean;
  joinedAt: Date;
  updatedAt: Date;
}

export function participantIsActive(
  record: ConversationParticipantRecord,
): boolean {
  return record.leftAt === null;
}

export function participantIsMuted(
  record: ConversationParticipantRecord,
): boolean {
  if (!record.mutedUntil) return false;
  return record.mutedUntil > new Date();
}

// ─── Message ──────────────────────────────────────────────────────────────────

export interface ConversationMessageRecord {
  id: string;
  orgId: string;
  conversationId: string;
  threadId: string | null;
  authorId: string;
  body: string;
  contentMeta: Record<string, unknown> | null;
  status: ConversationMessageStatus;
  editedAt: Date | null;
  deletedAt: Date | null;
  participantCountAtSend: number;
  createdAt: Date;
  updatedAt: Date;
}

export function messageIsActive(
  record: ConversationMessageRecord,
): boolean {
  return record.status === "ACTIVE";
}

export function messageIsDeleted(
  record: ConversationMessageRecord,
): boolean {
  return record.status === "DELETED" || record.deletedAt !== null;
}

export function messageIsEdited(
  record: ConversationMessageRecord,
): boolean {
  return record.status === "EDITED" || record.editedAt !== null;
}

// ─── Thread ───────────────────────────────────────────────────────────────────

export interface ConversationThreadRecord {
  id: string;
  orgId: string;
  conversationId: string;
  anchorMessageId: string;
  title: string | null;
  replyCount: number;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function threadIsResolved(
  record: ConversationThreadRecord,
): boolean {
  return record.resolvedAt !== null;
}

// ─── Reaction ─────────────────────────────────────────────────────────────────

export interface MessageReactionRecord {
  id: string;
  orgId: string;
  messageId: string;
  userId: string;
  type: MessageReactionType;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Mention ──────────────────────────────────────────────────────────────────

export interface MessageMentionRecord {
  id: string;
  orgId: string;
  messageId: string;
  mentionedUserId: string;
  offsetStart: number;
  offsetEnd: number;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

// ─── Read State ───────────────────────────────────────────────────────────────

export interface ConversationReadStateRecord {
  id: string;
  orgId: string;
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
  unreadCount: number;
  isMuted: boolean;
  updatedAt: Date;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export interface PresenceSessionRecord {
  id: string;
  orgId: string;
  userId: string;
  status: PresenceStatus;
  lastActivityAt: Date;
  expiresAt: Date | null;
  activeConversationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function presenceIsExpired(
  record: PresenceSessionRecord,
): boolean {
  if (!record.expiresAt) return false;
  return record.expiresAt <= new Date();
}

// ─── Typing ───────────────────────────────────────────────────────────────────

export interface TypingSessionRecord {
  id: string;
  orgId: string;
  conversationId: string;
  userId: string;
  status: TypingStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function typingIsExpired(
  record: TypingSessionRecord,
): boolean {
  return record.expiresAt <= new Date();
}

// ─── Attachment ───────────────────────────────────────────────────────────────

export interface ConversationAttachmentRecord {
  id: string;
  orgId: string;
  messageId: string;
  storageRef: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailRef: string | null;
  scanStatus: AttachmentScanStatus;
  scannedAt: Date | null;
  createdAt: Date;
}

export function attachmentIsScanned(
  record: ConversationAttachmentRecord,
): boolean {
  return record.scanStatus === "CLEAN" || record.scanStatus === "BLOCKED";
}

export function attachmentIsPendingScan(
  record: ConversationAttachmentRecord,
): boolean {
  return record.scanStatus === "PENDING";
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface MessagingTaskRecord {
  id: string;
  orgId: string;
  conversationId: string;
  originatingMessageId: string | null;
  title: string;
  description: string | null;
  status: MessagingTaskStatus;
  priority: number;
  assigneeId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function taskIsOpen(record: MessagingTaskRecord): boolean {
  return record.status === "OPEN" || record.status === "IN_PROGRESS";
}

export function taskIsOverdue(record: MessagingTaskRecord): boolean {
  if (!record.dueDate) return false;
  if (!taskIsOpen(record)) return false;
  return record.dueDate < new Date();
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export interface ConversationMeetingRecord {
  id: string;
  orgId: string;
  conversationId: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  status: MeetingStatus;
  providerEventId: string | null;
  scheduledBy: string;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function meetingIsUpcoming(
  record: ConversationMeetingRecord,
): boolean {
  return record.status === "UPCOMING";
}

export function meetingIsEnded(
  record: ConversationMeetingRecord,
): boolean {
  return record.status === "ENDED" || record.status === "CANCELLED";
}

// ─── Calendar Connection ──────────────────────────────────────────────────────

export interface CalendarConnectionRecord {
  id: string;
  orgId: string;
  provider: CalendarProvider;
  providerAccountId: string;
  emailAddress: string;
  displayName: string | null;
  tokenRef: string | null;
  tokenExpiry: Date | null;
  status: CalendarConnectionStatus;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  disconnectedAt: Date | null;
  connectedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function calendarConnectionIsActive(
  record: CalendarConnectionRecord,
): boolean {
  return record.status === "ACTIVE" && record.disconnectedAt === null;
}

export function calendarConnectionRequiresReconnect(
  record: CalendarConnectionRecord,
): boolean {
  return record.status === "RECONNECT_REQUIRED" || record.status === "DISCONNECTED";
}

// ─── Audit Event ─────────────────────────────────────────────────────────────

export interface MessagingAuditEventRecord {
  id: string;
  orgId: string;
  conversationId: string | null;
  messageId: string | null;
  threadId: string | null;
  taskId: string | null;
  meetingId: string | null;
  actorId: string;
  action: MessagingAuditAction;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Retention Policy ─────────────────────────────────────────────────────────

export interface RetentionPolicyRecord {
  id: string;
  orgId: string;
  type: RetentionPolicyType;
  conversationId: string | null;
  retentionDays: number | null;
  action: RetentionAction;
  isActive: boolean;
  lastAppliedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function retentionPolicyIsIndefinite(
  record: RetentionPolicyRecord,
): boolean {
  return record.retentionDays === null;
}
