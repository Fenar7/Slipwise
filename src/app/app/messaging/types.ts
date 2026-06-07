/**
 * Messaging module — domain types for Sprint 1.1 (workspace shell).
 *
 * These shapes are intentionally forward-compatible with the full PRD domain
 * model (Conversation, ConversationParticipant, MessagingTask, etc.) so later
 * phases can plug real data in without redesigning the state structure.
 */

// ─── Workspace sections ──────────────────────────────────────────────────────

export type MessagingSection =
  | "channels"
  | "dms"
  | "groups"
  | "tasks"
  | "meetings"
  | "files"
  | "admin";

// ─── Presence ────────────────────────────────────────────────────────────────

export type PresenceStatus = "online" | "away" | "offline";

// ─── Participants ─────────────────────────────────────────────────────────────

export interface MessagingParticipant {
  id: string;
  name: string;
  avatarInitials: string;
  role: "owner" | "admin" | "member";
  presence: PresenceStatus;
}

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelVisibility = "public" | "private";

export interface MessagingChannel {
  id: string;
  name: string;
  description: string;
  visibility: ChannelVisibility;
  memberCount: number;
  unreadCount: number;
  isPinned: boolean;
  isMuted?: boolean;
  lastActivityAt: string; // ISO string — real transport fills this later
}

// ─── Direct Messages ─────────────────────────────────────────────────────────

export interface DirectMessage {
  id: string;
  participant: MessagingParticipant;
  unreadCount: number;
  isMuted?: boolean;
  lastActivityAt: string;
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export type GroupCreationPolicy = "admin-only" | "member-allowed";

export interface MessagingGroup {
  id: string;
  name: string;
  memberCount: number;
  unreadCount: number;
  isPrivate: boolean;
  isMuted?: boolean;
  lastActivityAt: string;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = "open" | "in-progress" | "done" | "overdue" | "cancelled";

export interface MessagingTask {
  id: string;
  title: string;
  assignee: MessagingParticipant | null;
  dueDate: string | null;
  status: TaskStatus;
  conversationRef: string | null; // links back to originating conversation
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export type MeetingStatus = "upcoming" | "live" | "ended" | "cancelled";
export type MeetingRsvpStatus = "PENDING" | "ACCEPTED" | "TENTATIVE" | "DECLINED";

export interface MessagingMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  participantCount: number;
  calendarProvider: "google" | "outlook" | null;
  /** Provider-issued join URL. Null when not available or user has declined. */
  joinUrl: string | null;
  /** Current user's RSVP status. PENDING = not yet responded. */
  rsvpStatus: MeetingRsvpStatus;
  /** userId of meeting organizer. */
  scheduledBy: string;
}

// ─── Files ───────────────────────────────────────────────────────────────────

export type FileCategory = "document" | "image" | "spreadsheet" | "other";

export interface MessagingFile {
  id: string;
  name: string;
  category: FileCategory;
  sizeLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  conversationRef: string | null;
}

// ─── Admin / Governance ──────────────────────────────────────────────────────

export type AdminArea =
  | "channel-policy"
  | "retention"
  | "moderation"
  | "audit-log"
  | "member-governance";

export interface AdminEntry {
  area: AdminArea;
  label: string;
  description: string;
  requiresRole: "owner" | "admin";
}

// ─── Workspace shell state ───────────────────────────────────────────────────

export interface MessagingWorkspaceState {
  activeSection: MessagingSection;
  searchQuery: string;
  commandBarOpen: boolean;
}

// ─── Sprint 1.2 — Conversation reading workspace ─────────────────────────────

/**
 * The type of conversation currently open in the reading workspace.
 * Drives distinct workspace cues per conversation kind.
 */
export type ConversationKind = "channel" | "dm" | "group";

/**
 * A single static message in the reading pane.
 * Shape is forward-compatible with ConversationMessage in the full domain model.
 */
export interface ConversationMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorRole: "owner" | "admin" | "member";
  body: string;
  sentAt: string; // ISO string
  /** True when this message has an open thread with replies */
  hasThread: boolean;
  threadReplyCount: number;
  /** Reaction chips — static display only in Phase 1 */
  reactions: MessageReaction[];
  /** Attachment hint — legacy count string for backward compat */
  attachmentRef: string | null;
  /** Real attachment records from the backend (Sprint 5.5) */
  attachmentRecords: Array<{
    id: string;
    name: string;
    mimeType: string;
    mimeCategory: string;
    sizeBytes: number;
    scanStatus: string;
  }>;
  /** Whether the current viewer is mentioned */
  mentionsCurrentUser: boolean;
}

/**
 * The identity of the currently selected conversation.
 * Null means no conversation is selected (no-selection state).
 */
export interface ActiveConversation {
  id: string;
  kind: ConversationKind;
  /** Display name: channel name, participant name, or group name */
  name: string;
  /** Subtitle shown in the workspace header */
  subtitle: string;
  /** For channels: public/private visibility */
  channelVisibility?: "public" | "private";
  /** For DMs: the other participant */
  dmParticipant?: MessagingParticipant;
  /** For groups: member count */
  groupMemberCount?: number;
  /** For groups: privacy/access cue */
  groupIsPrivate?: boolean;
  /** Whether the current user has access (false = restricted state) */
  isAccessible: boolean;
  /** Hint for restricted state messaging */
  restrictedReason?: string;
  /** Whether a thread is currently open in the right panel */
  threadOpen: boolean;
  /** The message ID whose thread is open, if any */
  threadAnchorMessageId: string | null;
  /** Backend-derived: ISO timestamp when conversation was archived, or null */
  archivedAt?: string | null;
  /** Backend-derived: ISO timestamp when conversation was locked, or null */
  lockedAt?: string | null;
  /** Backend-derived: whether the current user can send messages */
  canSend?: boolean;
}

/**
 * State for the Sprint 1.2 reading workspace layer.
 * Extends MessagingWorkspaceState without replacing it.
 */
export interface ConversationWorkspaceState {
  activeConversation: ActiveConversation | null;
}

// ─── Sprint 1.3 ──────────────────────────────────────────────────────────────

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
}

export interface EditState {
  messageId: string;
  draftBody: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  sizeLabel: string;
  mimeCategory: "document" | "spreadsheet" | "image" | "other";
}

export interface MentionSuggestion {
  userId: string;
  name: string;
  avatarInitials: string;
  role: "owner" | "admin" | "member";
  presence: PresenceStatus;
}

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  iconName: "CheckSquare" | "Video" | "FileText" | "AtSign" | "Hash";
}

export type ComposerState = "empty" | "has-content" | "mention-popover" | "slash-popover";

// ─── Sprint 1.4 — Channels, Groups, and Admin UX ─────────────────────────────

export type ChannelPanelTab = "info" | "members" | "pinned" | "settings";
export type GroupPanelTab = "info" | "members" | "settings";
export type AdminPanelTab =
  | "channel-policy"
  | "retention"
  | "moderation"
  | "audit-log"
  | "member-governance";

export interface ChannelMember {
  id: string;
  name: string;
  avatarInitials: string;
  role: "owner" | "admin" | "member";
  presence: PresenceStatus;
  joinedAt: string; // ISO
}

export interface PinnedMessage {
  id: string;
  authorName: string;
  body: string;
  pinnedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  summary: string;
  occurredAt: string;
}

// ─── Sprint 1.5 — Tasks, Meetings, and Calendar UX ────────────────────────────

export type TaskPriority = "low" | "medium" | "high" | "critical";

/**
 * Extends the base MessagingTask with priority and description for the
 * full task detail view.
 */
export interface MessagingTaskDetail extends MessagingTask {
  priority: TaskPriority;
  description: string | null;
  createdAt: string; // ISO
  createdBy: string; // participant name
  originatingMessageId?: string | null;
  reminderAt?: string | null;
  reminderSentAt?: string | null;
  dbStatus?: TaskStatus | null;
  conversationName?: string | null;
  conversationType?: "CHANNEL" | "DM" | "GROUP";
}

export type CalendarConnectionStatus =
  | "not_connected"  // no calendar linked
  | "connected"      // Google Calendar linked and active
  | "needs_reauth";  // previously connected, token expired

export interface CalendarConnection {
  provider: "google" | null;
  status: CalendarConnectionStatus;
  connectedEmail: string | null; // the Google account email, if connected
  connectedAt: string | null;    // ISO
}

export type MeetingTab = "upcoming" | "past" | "calendar";
export type TaskFilterStatus = "all" | "open" | "in-progress" | "done" | "overdue" | "cancelled" | "assigned" | "created" | "due-soon";

// ─── Sprint 1.6 — Search, Files, Notifications, and Final Polish ─────────────

export type SearchResultKind =
  | "message"
  | "conversation"
  | "task"
  | "meeting"
  | "file"
  | "channel"
  | "person";

export interface SearchResultBase {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  timestamp?: string;
  score?: number;
}

export interface MessageSearchResult extends SearchResultBase {
  kind: "message";
  conversationId: string;
  conversationName: string;
  authorName: string;
  authorInitials: string;
  snippet: string;
}

export interface ConversationSearchResult extends SearchResultBase {
  kind: "conversation";
  conversationType: "CHANNEL" | "DM" | "GROUP";
  isPrivate: boolean;
  memberCount: number;
}

export interface TaskSearchResult extends SearchResultBase {
  kind: "task";
  conversationId: string;
  conversationName: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "CANCELLED";
  assigneeName?: string;
  dueDate?: string;
}

export interface MeetingSearchResult extends SearchResultBase {
  kind: "meeting";
  conversationId: string;
  conversationName: string;
  scheduledAt: string;
  durationMinutes: number;
  joinUrl?: string;
}

export interface FileSearchResult extends SearchResultBase {
  kind: "file";
  conversationId: string;
  conversationName: string;
  attachmentId: string;
  mimeType: string;
  mimeCategory: string;
  sizeBytes: number;
  sizeLabel: string;
  scanStatus: "PENDING" | "CLEAN" | "BLOCKED";
  snippet?: string;
}

// Support legacy mock data shapes as well
export interface LegacyChannelSearchResult extends SearchResultBase {
  kind: "channel";
  conversationRef?: string;
}

export interface LegacyPersonSearchResult extends SearchResultBase {
  kind: "person";
  avatarInitials?: string;
}

export type MessagingSearchResult =
  | MessageSearchResult
  | ConversationSearchResult
  | TaskSearchResult
  | MeetingSearchResult
  | FileSearchResult
  | LegacyChannelSearchResult
  | LegacyPersonSearchResult;

export type NotificationKind =
  | "mention"
  | "reply"
  | "task_reminder"
  | "task_assigned"
  | "meeting_reminder"
  | "channel_invite";

export interface MessagingNotification {
  id: string;
  kind: NotificationKind;
  actorName: string;
  actorInitials: string;
  body: string;
  conversationRef: string | null;
  occurredAt: string;
  read: boolean;
}

export type NotificationFilterKind = "all" | "mentions" | "unread";

export type FileFilterCategory = "all" | FileCategory;

export type FileSortOrder = "newest" | "oldest" | "name";
