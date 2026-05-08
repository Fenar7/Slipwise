/**
 * Mailbox domain types — Sprint 1.1 shell shapes.
 * Designed to be stable for later backend integration (Phase 2+).
 */

export type MailboxConnectionStatus =
  | "connected"
  | "reconnect_required"
  | "degraded"
  | "disconnected";

export type MailboxProvider = "gmail" | "zoho";

export interface MailboxConnection {
  id: string;
  orgId: string;
  provider: MailboxProvider;
  slug: string;
  emailAddress: string;
  displayName: string;
  status: MailboxConnectionStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  unreadCount: number;
  inboxCount: number;
}

export type ThreadStatus = "open" | "pending" | "closed" | "archived";

export interface MailboxTreeItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  unreadCount?: number;
  isSmartView?: boolean;
  mailboxConnectionId?: string;
}

export interface MailboxGroup {
  connection: MailboxConnection;
  items: MailboxTreeItem[];
}

export type MailboxViewId =
  | "all-inboxes"
  | "unread"
  | "assigned-to-me"
  | "unassigned"
  | "flagged"
  | "waiting"
  | "closed"
  | string; // mailbox-specific folder views

export interface MailboxWorkspaceState {
  activeViewId: MailboxViewId;
  activeConnectionId: string | null; // null = all-inboxes
  searchQuery: string;
  isSearchActive: boolean;
}

export interface MailboxHealthState {
  connectionId: string;
  status: MailboxConnectionStatus;
  message: string | null;
}
