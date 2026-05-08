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

// ─── Sprint 1.2 additions ────────────────────────────────────────────────────

export type MessageDirection = "inbound" | "outbound";

export interface MailboxAttachmentSummary {
  id: string;
  filename: string;
  mimeType: string;
  /** Human-readable size, e.g. "142 KB" */
  sizeLabel: string;
}

export interface MailboxMessageItem {
  id: string;
  threadId: string;
  direction: MessageDirection;
  from: string;
  fromInitial: string;
  fromColor: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  sentAt: string;
  /** Collapsed by default for older messages in a thread */
  isCollapsed: boolean;
  attachments: MailboxAttachmentSummary[];
}

export interface MailboxThreadDetail {
  threadId: string;
  subject: string;
  status: ThreadStatus;
  assignee: string | null;
  mailboxLabel: string;
  mailboxColor: string;
  participantsSummary: string;
  messages: MailboxMessageItem[];
  /** Total attachment count across all messages */
  totalAttachments: number;
}

// ─── Sprint 1.3 additions ────────────────────────────────────────────────────

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";
export type ComposeLayout = "floating" | "expanded" | "inline";
export type ComposeSendState = "idle" | "sending" | "sent" | "failed";

export interface ComposeDraftAttachment {
  id: string;
  filename: string;
  sizeLabel: string;
  mimeType: string;
}

export interface MailboxComposerState {
  isOpen: boolean;
  layout: ComposeLayout;
  mode: ComposeMode;
  /** Which mailbox connection this sends from */
  fromConnectionId: string;
  fromLabel: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  bcc: string[];
  showCc: boolean;
  showBcc: boolean;
  subject: string;
  bodyHtml: string;
  attachments: ComposeDraftAttachment[];
  sendState: ComposeSendState;
  /** threadId being replied to / forwarded, null for new message */
  threadId: string | null;
  /** messageId being replied to, null for new/forward */
  replyToMessageId: string | null;
}
