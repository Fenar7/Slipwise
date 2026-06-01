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
  taskIsOpen,
  taskIsOverdue,
  taskIsDueSoon,
  meetingIsUpcoming,
  meetingIsEnded,
  calendarConnectionIsActive,
  calendarConnectionRequiresReconnect,
  retentionPolicyIsIndefinite,
} from "./domain-types";

// Authorization layer (Sprint 3.1 + 3.2)
export type {
  ConversationAction,
  AuthorizationResult,
  GovernanceActor,
} from "./authorization";
export {
  roleCanGovern,
  evaluateConversationAccess,
  evaluateGovernanceAccess,
  requireConversationAccess,
  requireGovernanceAccess,
  canReadConversation,
  governanceMatrix,
} from "./authorization";

// Service contracts
export type {
  OrgScopedQuery,
  PaginatedQuery,
  CreateConversationInput,
  CreateConversationResult,
  ArchiveConversationInput,
  UnarchiveConversationInput,
  LockConversationInput,
  UnlockConversationInput,
  RenameConversationInput,
  ChangeConversationVisibilityInput,
  AddParticipantInput,
  RemoveParticipantInput,
  UpdateParticipantRoleInput,
  MessageAttachmentDescriptor,
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
  TaskListFilterInput,
  TaskListResult,
  TaskListScope,
  ScheduleMeetingInput,
  CancelMeetingInput,
  UpdateMeetingInput,
  ConnectCalendarInput,
  DisconnectCalendarInput,
  CreateRetentionPolicyInput,
  UpdateRetentionPolicyInput,
} from "./service-contracts";
export {
  isValidConversationType,
  isValidConversationVisibility,
  isValidParticipantRole,
  isValidCalendarProvider,
  isValidCalendarConnectionStatus,
  isValidAttachmentScanStatus,
  isValidRetentionAction,
  isValidTaskListScope,
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
  normalizeAuditMetadata,
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

// Sprint 3.1–3.2: Service helpers (membership, governance assertions)
export {
  getConversationInOrg,
  assertActiveParticipant,
  assertConversationAccessible,
  assertNotDMConversation,
  assertConversationAction,
  assertGovernanceParticipant,
  assertGovernanceAction,
} from "./service-helpers";

// ─── Sprint 2.2: Service implementations ─────────────────────────────────────────

// Conversation service
export {
  getConversationById,
  listConversationsForUser,
  createConversation,
  archiveConversation,
  unarchiveConversation,
  renameConversation,
  changeConversationVisibility,
  lockConversation,
  unlockConversation,
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
  sendMessage,
  editMessage,
  softDeleteMessage,
  getMessageById,
  listConversationMessages,
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

// Draft service
export {
  getDraft,
  saveDraft,
  deleteDraft,
} from "./draft-service";

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

// ─── Sprint 2.3: Read shapes and read models ──────────────────────────────────────

// Read shapes (domain record → UI-facing shape)
export type {
  ConversationSummary,
  MessageSummary,
  ParticipantSummary,
  ConversationDetail,
  ThreadSummary,
  ReadStateSummary,
  MessageDetail,
  TaskSummary,
  TaskPriorityString,
} from "./read-shapes";
export {
  toConversationSummary,
  toMessageSummary,
  toParticipantSummary,
  toConversationDetail,
  toMessageDetail,
  toTaskSummary,
} from "./read-shapes";

// Read models (aggregated queries returning UI shapes)
export {
  listConversationSummariesForUser,
  getConversationDetail,
  getMessageDetail,
  getConversationTaskSummaries,
  getOrgTaskSummaries,
  type ListConversationSummariesOptions,
  type GetConversationDetailOptions,
  type GetOrgTaskSummariesOptions,
} from "./read-models";

// ─── Phase 4 Sprint 4.1: Realtime transport ───────────────────────────────────────

export {
  REALTIME_PROTOCOL_VERSION,
  isValidClientCommand,
  getCommandType,
  getCommandRequestId,
  REALTIME_TOKEN_ALGORITHM,
  REALTIME_TOKEN_VERSION,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
  MAX_REALTIME_TOKEN_TTL_SECONDS,
  mintRealtimeSessionToken,
  verifyRealtimeSessionToken,
  tokenFingerprint,
  InMemorySessionRegistry,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  authorizeConversationSubscription,
  reauthorizeConversationSubscription,
  ConsoleRealtimeDiagnostics,
  NoopRealtimeDiagnostics,
  MessagingGateway,
} from "./realtime";

export {
  createMessagingRealtimeServer,
} from "./realtime/server";

export {
  InMemoryRealtimePublisher,
  registerRealtimePublisher,
  getRealtimePublisher,
  getRealtimePublisherOrNoop,
} from "./realtime";

export type {
  BaseCommand,
  BaseServerMessage,
  ClientCommand,
  ServerMessage,
  SubscribeConversationCommand,
  UnsubscribeConversationCommand,
  HeartbeatCommand,
  ResumeSessionCommand,
  SetPresenceCommand,
  StartTypingCommand,
  StopTypingCommand,
  SessionAckMessage,
  SubscriptionAckMessage,
  SubscriptionDeniedMessage,
  HeartbeatAckMessage,
  ResumeSessionResultMessage,
  ErrorMessage,
  DisconnectMessage,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeErrorCode,
  RealtimeSessionClaims,
  MintTokenInput,
  MintTokenResult,
  VerifyTokenResult,
  TokenVerificationError,
  RealtimeSession,
  SessionRegistryStats,
  SessionRegistry,
  SubscriptionAuthResult,
  SubscriptionAuthDiagnostic,
  SubscriptionAuthDetail,
  RealtimeDiagnosticEvent,
  RealtimeDiagnostics,
  GatewayOptions,
  GatewayConnectionState,
  RealtimePublisher,
} from "./realtime";

export type {
  MessagingRealtimeServerOptions,
  MessagingRealtimeServer,
} from "./realtime/server";

// ─── Sprint 7.2: Task reminder dispatch ──────────────────────────────────────

export {
  dispatchDueTaskReminders,
  sendTaskAssignmentNotification,
  isReminderEligible,
  type ReminderDispatchResult,
} from "./task-reminders";

// Errors
export { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";

