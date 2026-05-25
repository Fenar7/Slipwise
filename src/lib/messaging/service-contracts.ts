import "server-only";

/**
 * Messaging service contracts.
 *
 * These interfaces define the stable internal service boundaries for the
 * messaging platform. Future phases (realtime, governance, notifications)
 * depend on these contracts; do not change them without a migration plan.
 *
 * Rules:
 * - No raw Prisma types leak into these contracts.
 * - All mutation inputs carry orgId explicitly.
 * - All outputs are domain records (not raw Prisma rows).
 * - Org-safe query helpers enforce single-org scoping at the type level.
 */

import type {
  ConversationRecord,
  ConversationParticipantRecord,
  ConversationMessageRecord,
  ConversationThreadRecord,
  MessageReactionRecord,
  MessageMentionRecord,
  ConversationReadStateRecord,
  PresenceSessionRecord,
  TypingSessionRecord,
  ConversationAttachmentRecord,
  MessagingTaskRecord,
  ConversationMeetingRecord,
  CalendarConnectionRecord,
  RetentionPolicyRecord,
  ConversationType,
  ConversationVisibility,
  ConversationParticipantRole,
  ConversationMessageStatus,
  AttachmentScanStatus,
  MessagingTaskStatus,
  MeetingStatus,
  CalendarProvider,
  CalendarConnectionStatus,
  RetentionPolicyType,
  RetentionAction,
  PresenceStatus,
} from "./domain-types";

// ─── Org-safe query primitives ────────────────────────────────────────────────

/**
 * Base filter for all org-scoped messaging queries.
 * Every query must include orgId at minimum.
 */
export interface OrgScopedQuery {
  orgId: string;
}

/**
 * A paginated list query base.
 */
export interface PaginatedQuery extends OrgScopedQuery {
  cursor?: string | null;
  limit?: number;
}

// ─── Conversation service contracts ────────────────────────────────────────────

export interface CreateConversationInput {
  orgId: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  visibility: ConversationVisibility | null;
  /** For DMs: the other participant userId. */
  dmPeerId?: string | null;
  /** The user creating the conversation. */
  createdBy: string;
  /** Initial participant userIds (not including createdBy; creator is always added). */
  initialParticipantIds?: string[];
}

export interface CreateConversationResult {
  conversation: ConversationRecord;
  participants: ConversationParticipantRecord[];
}

export interface ArchiveConversationInput {
  orgId: string;
  conversationId: string;
  archivedBy: string;
  /** Org-level role for admin override evaluation. */
  actorOrgRole?: string;
  /** Platform admin status for override evaluation. */
  isPlatformAdmin?: boolean;
}

export interface UnarchiveConversationInput {
  orgId: string;
  conversationId: string;
  unarchivedBy: string;
  /** Org-level role for admin override evaluation. */
  actorOrgRole?: string;
  /** Platform admin status for override evaluation. */
  isPlatformAdmin?: boolean;
}

export interface LockConversationInput {
  orgId: string;
  conversationId: string;
  lockedBy: string;
  /** Optional reason category. Must not contain sensitive freeform text. */
  reason?: string | null;
  /** Org-level role for admin override evaluation. */
  actorOrgRole?: string;
  /** Platform admin status for override evaluation. */
  isPlatformAdmin?: boolean;
}

export interface UnlockConversationInput {
  orgId: string;
  conversationId: string;
  unlockedBy: string;
  /** Org-level role for admin override evaluation. */
  actorOrgRole?: string;
  /** Platform admin status for override evaluation. */
  isPlatformAdmin?: boolean;
}

export interface RenameConversationInput {
  orgId: string;
  conversationId: string;
  name: string;
  actorId: string;
}

export interface ChangeConversationVisibilityInput {
  orgId: string;
  conversationId: string;
  visibility: ConversationVisibility;
  actorId: string;
}

// ─── Participant service contracts ───────────────────────────────────────────

export interface AddParticipantInput {
  orgId: string;
  conversationId: string;
  userId: string;
  role: ConversationParticipantRole;
  addedBy: string;
}

export interface RemoveParticipantInput {
  orgId: string;
  conversationId: string;
  userId: string;
  removedBy: string;
  /** Org-level role for admin override evaluation. */
  actorOrgRole?: string;
  /** Platform admin status for override evaluation. */
  isPlatformAdmin?: boolean;
}

export interface UpdateParticipantRoleInput {
  orgId: string;
  conversationId: string;
  userId: string;
  role: ConversationParticipantRole;
  updatedBy: string;
}

// ─── Attachment descriptor ────────────────────────────────────────────────────

export interface MessageAttachmentDescriptor {
  uploadToken: string;
  storageRef: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailRef?: string | null;
}
// ─── Message service contracts ───────────────────────────────────────────────

export interface SendMessageInput {
  orgId: string;
  conversationId: string;
  /** Null for top-level messages; set for thread replies. */
  threadId?: string | null;
  authorId: string;
  body: string;
  contentMeta?: Record<string, unknown> | null;
  /** Structured attachment metadata to link to the message transactionally. */
  attachments?: MessageAttachmentDescriptor[];
  /** Mentioned userIds with offset ranges (optional; may be computed by service). */
  mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>;
}

export interface EditMessageInput {
  orgId: string;
  messageId: string;
  actorId: string;
  body: string;
}

export interface DeleteMessageInput {
  orgId: string;
  messageId: string;
  actorId: string;
}

// ─── Thread service contracts ────────────────────────────────────────────────

export interface CreateThreadInput {
  orgId: string;
  conversationId: string;
  anchorMessageId: string;
  title?: string | null;
  createdBy: string;
}

export interface ReplyToThreadInput {
  orgId: string;
  conversationId: string;
  threadId: string;
  authorId: string;
  body: string;
  contentMeta?: Record<string, unknown> | null;
  attachments?: MessageAttachmentDescriptor[];
  mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>;
}

export interface ResolveThreadInput {
  orgId: string;
  threadId: string;
  resolvedBy: string;
}

// ─── Reaction service contracts ──────────────────────────────────────────────

export interface AddReactionInput {
  orgId: string;
  messageId: string;
  userId: string;
  value: string;
}

export interface RemoveReactionInput {
  orgId: string;
  messageId: string;
  userId: string;
  value: string;
}

// ─── Mention service contracts ───────────────────────────────────────────────

export interface AcknowledgeMentionInput {
  orgId: string;
  mentionId: string;
  userId: string;
}

// ─── Draft service contracts ────────────────────────────────────────────────

export interface SaveDraftInput {
  orgId: string;
  conversationId: string;
  threadId?: string | null;
  userId: string;
  body: string;
  contentMeta?: Record<string, unknown> | null;
}

export interface GetDraftInput {
  orgId: string;
  conversationId: string;
  threadId?: string | null;
  userId: string;
}

export interface DeleteDraftInput {
  orgId: string;
  conversationId: string;
  threadId?: string | null;
  userId: string;
}

// ─── Read state service contracts ────────────────────────────────────────────

export interface UpdateReadStateInput {
  orgId: string;
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
  lastReadAt: Date;
}

export interface MarkConversationReadInput {
  orgId: string;
  conversationId: string;
  userId: string;
  /** The timestamp of the read action. */
  readAt: Date;
}

// ─── Presence service contracts ──────────────────────────────────────────────

export interface UpdatePresenceInput {
  orgId: string;
  userId: string;
  status: PresenceStatus;
  /** Optional: the conversation the user is currently viewing. */
  activeConversationId?: string | null;
  /** When this presence record should be considered stale. */
  expiresAt?: Date | null;
}

// ─── Typing service contracts ────────────────────────────────────────────────

export interface StartTypingInput {
  orgId: string;
  conversationId: string;
  userId: string;
  /** When this typing indicator should auto-expire. */
  expiresAt: Date;
}

export interface StopTypingInput {
  orgId: string;
  conversationId: string;
  userId: string;
}

// ─── Task service contracts ──────────────────────────────────────────────────

export interface CreateTaskInput {
  orgId: string;
  conversationId: string;
  originatingMessageId?: string | null;
  title: string;
  description?: string | null;
  priority?: number;
  assigneeId?: string | null;
  dueDate?: Date | null;
  createdBy: string;
}

export interface UpdateTaskStatusInput {
  orgId: string;
  conversationId: string;
  taskId: string;
  status: MessagingTaskStatus;
  actorId: string;
}

export interface AssignTaskInput {
  orgId: string;
  conversationId: string;
  taskId: string;
  assigneeId: string | null;
  actorId: string;
}

// ─── Meeting service contracts ───────────────────────────────────────────────

export interface ScheduleMeetingInput {
  orgId: string;
  conversationId: string;
  title: string;
  description?: string | null;
  scheduledAt: Date;
  durationMinutes?: number;
  scheduledBy: string;
}

export interface CancelMeetingInput {
  orgId: string;
  meetingId: string;
  cancelledBy: string;
  cancelReason?: string | null;
}

export interface UpdateMeetingInput {
  orgId: string;
  meetingId: string;
  title?: string;
  description?: string | null;
  scheduledAt?: Date;
  durationMinutes?: number;
  updatedBy: string;
}

// ─── Calendar connection service contracts ─────────────────────────────────────

export interface ConnectCalendarInput {
  orgId: string;
  provider: CalendarProvider;
  providerAccountId: string;
  emailAddress: string;
  displayName?: string | null;
  tokenRef: string;
  tokenExpiry?: Date | null;
  connectedBy: string;
}

export interface DisconnectCalendarInput {
  orgId: string;
  connectionId: string;
  disconnectedBy: string;
}

// ─── Retention policy service contracts ──────────────────────────────────────

export interface CreateRetentionPolicyInput {
  orgId: string;
  type: RetentionPolicyType;
  conversationId?: string | null;
  retentionDays: number | null;
  action: RetentionAction;
  createdBy: string;
}

export interface UpdateRetentionPolicyInput {
  orgId: string;
  policyId: string;
  retentionDays: number | null;
  action: RetentionAction;
  isActive: boolean;
  updatedBy: string;
}

// ─── Mapper types ─────────────────────────────────────────────────────────────

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
}

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

// ─── Contract type guards ─────────────────────────────────────────────────────

/**
 * Type guard: checks whether an input is a valid ConversationType.
 */
export function isValidConversationType(value: unknown): value is ConversationType {
  return value === "CHANNEL" || value === "DM" || value === "GROUP";
}

/**
 * Type guard: checks whether an input is a valid ConversationVisibility.
 */
export function isValidConversationVisibility(value: unknown): value is ConversationVisibility {
  return value === "PUBLIC" || value === "PRIVATE";
}

/**
 * Type guard: checks whether an input is a valid ConversationParticipantRole.
 */
export function isValidParticipantRole(value: unknown): value is ConversationParticipantRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

/**
 * Type guard: checks whether an input is a valid CalendarProvider.
 */
export function isValidCalendarProvider(value: unknown): value is CalendarProvider {
  return value === "GOOGLE" || value === "OUTLOOK";
}

/**
 * Type guard: checks whether an input is a valid CalendarConnectionStatus.
 */
export function isValidCalendarConnectionStatus(
  value: unknown,
): value is CalendarConnectionStatus {
  return value === "ACTIVE" || value === "RECONNECT_REQUIRED" || value === "DISCONNECTED";
}

/**
 * Type guard: checks whether an input is a valid AttachmentScanStatus.
 */
export function isValidAttachmentScanStatus(value: unknown): value is AttachmentScanStatus {
  return value === "PENDING" || value === "CLEAN" || value === "BLOCKED";
}

/**
 * Type guard: checks whether an input is a valid RetentionAction.
 */
export function isValidRetentionAction(value: unknown): value is RetentionAction {
  return value === "ARCHIVE" || value === "DELETE" || value === "FLAG";
}
