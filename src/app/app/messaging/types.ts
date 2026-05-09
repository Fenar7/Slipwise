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
