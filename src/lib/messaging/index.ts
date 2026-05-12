/**
 * Messaging service module — public API surface.
 *
 * Import from this index rather than from individual files to maintain
 * a stable internal boundary. Internal implementation files may be
 * reorganized without breaking callers.
 *
 * What is exported:
 * - Domain types (for service layer use)
 * - Service contracts (input/output shapes for future service implementations)
 * - Mappers (Prisma row → domain record)
 * - Audit helpers (for governance event emission)
 * - Org-safe query helpers (for Prisma query pattern enforcement)
 * - Contract type guards (for runtime validation)
 *
 * What is exported from Sprint 2.2 onward:
 * - Service implementations (conversation, participant, message, thread,
 *   reaction, mention/read-state, presence/typing)
 *
 * What is NOT exported from here:
 * - Raw Prisma types (import from @/generated/prisma/client directly)
 */

// Domain types
export type {
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
  MessagingAuditEventRecord,
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
} from "./domain-types";
export {
  conversationIsArchived,
  conversationIsLocked,
  conversationIsDM,
  conversationIsChannel,
  conversationIsGroup,
  conversationIsAccessible,
  participantIsActive,
  participantIsMuted,
  messageIsActive,
  messageIsDeleted,
  messageIsEdited,
  threadIsResolved,
  presenceIsExpired,
  typingIsExpired,
  attachmentIsScanned,
  attachmentIsPendingScan,
  taskIsOpen,
  taskIsOverdue,
  meetingIsUpcoming,
  meetingIsEnded,
  calendarConnectionIsActive,
  calendarConnectionRequiresReconnect,
  retentionPolicyIsIndefinite,
} from "./domain-types";

// Service contracts
export type {
  OrgScopedQuery,
  PaginatedQuery,
  CreateConversationInput,
  CreateConversationResult,
  ArchiveConversationInput,
  RenameConversationInput,
  ChangeConversationVisibilityInput,
  AddParticipantInput,
  RemoveParticipantInput,
  UpdateParticipantRoleInput,
  SendMessageInput,
  EditMessageInput,
  DeleteMessageInput,
  CreateThreadInput,
  ReplyToThreadInput,
  ResolveThreadInput,
  AddReactionInput,
  RemoveReactionInput,
  AcknowledgeMentionInput,
  UpdateReadStateInput,
  MarkConversationReadInput,
  UpdatePresenceInput,
  StartTypingInput,
  StopTypingInput,
  CreateTaskInput,
  UpdateTaskStatusInput,
  AssignTaskInput,
  ScheduleMeetingInput,
  CancelMeetingInput,
  UpdateMeetingInput,
  ConnectCalendarInput,
  DisconnectCalendarInput,
  CreateRetentionPolicyInput,
  UpdateRetentionPolicyInput,
  ConversationSummary,
  MessageSummary,
  ParticipantSummary,
} from "./service-contracts";
export {
  isValidConversationType,
  isValidConversationVisibility,
  isValidParticipantRole,
  isValidCalendarProvider,
  isValidCalendarConnectionStatus,
  isValidAttachmentScanStatus,
  isValidRetentionAction,
} from "./service-contracts";

// Mappers
export {
  toConversationRecord,
  toParticipantRecord,
  toMessageRecord,
  toThreadRecord,
  toReactionRecord,
  toMentionRecord,
  toReadStateRecord,
  toPresenceRecord,
  toTypingRecord,
  toAttachmentRecord,
  toTaskRecord,
  toMeetingRecord,
  toCalendarConnectionRecord,
  toRetentionPolicyRecord,
  toAuditEventRecord,
} from "./mappers";

// Audit helpers
export {
  logMessagingAudit,
  logMessagingAuditTx,
  getMessagingAuditActionLabel,
  MESSAGING_AUDIT_ACTION_LABELS,
} from "./audit";

// Org-safe query helpers
export {
  conversationOrgSafeWhere,
  conversationListOrgSafeWhere,
  participantOrgSafeWhere,
  messageOrgSafeWhere,
  messageListOrgSafeWhere,
  threadOrgSafeWhere,
  reactionOrgSafeWhere,
  mentionOrgSafeWhere,
  readStateOrgSafeWhere,
  presenceOrgSafeWhere,
  typingOrgSafeWhere,
  taskOrgSafeWhere,
  meetingOrgSafeWhere,
  calendarConnectionOrgSafeWhere,
  auditEventOrgSafeWhere,
  retentionPolicyOrgSafeWhere,
} from "./org-safe-helpers";

// ─── Sprint 2.2: Service implementations ─────────────────────────────────────────

// Conversation service
export {
  getConversationById,
  listConversationsForUser,
  createConversation,
  archiveConversation,
  renameConversation,
  changeConversationVisibility,
} from "./conversation-service";

// Participant service
export {
  listParticipantsForConversation,
  getParticipantByUserId,
  addParticipant,
  removeParticipant,
  updateParticipantRole,
} from "./participant-service";

// Message service
export {
  getMessageById,
  listConversationMessages,
  sendMessage,
  editMessage,
  softDeleteMessage,
} from "./message-service";

// Thread service
export {
  getThreadById,
  listThreadsForConversation,
  listThreadReplies,
  createThread,
  replyToThread,
  resolveThread,
} from "./thread-service";

// Reaction service
export {
  listReactionsForMessage,
  addReaction,
  removeReaction,
} from "./reaction-service";

// Mention / Read-state service
export {
  acknowledgeMention,
  listUnacknowledgedMentions,
  updateReadState,
  markConversationRead,
  getReadState,
} from "./mention-readstate-service";

// Presence / Typing service
export {
  upsertPresence,
  getPresenceByUserId,
  startTyping,
  stopTyping,
  listTypingForConversation,
} from "./presence-service";
