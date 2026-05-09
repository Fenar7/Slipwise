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
  lastActivityAt: string; // ISO string — real transport fills this later
}

// ─── Direct Messages ─────────────────────────────────────────────────────────

export interface DirectMessage {
  id: string;
  participant: MessagingParticipant;
  unreadCount: number;
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
  lastActivityAt: string;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = "open" | "in-progress" | "done" | "overdue";

export interface MessagingTask {
  id: string;
  title: string;
  assignee: MessagingParticipant | null;
  dueDate: string | null;
  status: TaskStatus;
  conversationRef: string | null; // links back to originating conversation
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export type MeetingStatus = "upcoming" | "live" | "ended";

export interface MessagingMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  participantCount: number;
  calendarProvider: "google" | null; // provider-safe; null = not yet connected
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
  reactions: Array<{ emoji: string; count: number }>;
  /** Attachment hint — no real upload in Phase 1 */
  attachmentRef: string | null;
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
}

/**
 * State for the Sprint 1.2 reading workspace layer.
 * Extends MessagingWorkspaceState without replacing it.
 */
export interface ConversationWorkspaceState {
  activeConversation: ActiveConversation | null;
}
