/**
 * Mailbox domain types — Sprint 1.1 shell shapes.
 * Designed to be stable for later backend integration (Phase 2+).
 */

import type { MailboxSyncPresentation } from "@/lib/mailbox/sync-presentation-shape";

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
  lastSyncErrorCategory: string | null;
  sync?: MailboxSyncPresentation;
  unreadCount: number;
  inboxCount: number;
}

export type ThreadStatus = "open" | "pending" | "closed" | "archived";
export type MailboxFolder = "INBOX" | "SENT" | "SPAM" | "ARCHIVE" | "DRAFT" | "TRASH";

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
  bodyText?: string | null;
  sentAt: string;
  /** Collapsed by default for older messages in a thread */
  isCollapsed: boolean;
  attachments: MailboxAttachmentSummary[];
}

export interface DraftRowData {
  id: string;
  mailboxConnectionId: string;
  source: "local" | "provider";
  subject: string;
  snippet: string;
  to: string[];
  mailboxLabel: string;
  mailboxColor: string;
  updatedAt: string;
}

export interface MailboxThreadDetail {
  threadId: string;
  mailboxConnectionId: string;
  subject: string;
  status: ThreadStatus;
  assignee: string | null;
  /** Real userId for API calls; null when unassigned */
  assigneeId: string | null;
  isFlagged: boolean;
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
export type ComposeDeliveryMode = "send_now" | "schedule_send";

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
  deliveryMode: ComposeDeliveryMode;
  scheduledSendAt: string | null;
  scheduleLabel: string | null;
  schedulePanelOpen: boolean;
  /** threadId being replied to / forwarded, null for new message */
  threadId: string | null;
  /** messageId being replied to, null for new/forward */
  replyToMessageId: string | null;
  /** Persisted draft ID for this compose session. Sprint 5.1. */
  draftId: string | null;
}

// ─── Sprint 1.4 additions ────────────────────────────────────────────────────

export type MailboxAccessRole = "admin" | "member" | "restricted";

export interface MailboxPermissionPolicy {
  connectionId: string;
  /** Who can read threads in this mailbox */
  readAccess: "org_admins_only" | "all_members" | "specific_roles";
  /** Who can reply/send from this mailbox */
  sendAccess: "org_admins_only" | "all_members" | "specific_roles";
  /** Who can manage this mailbox connection */
  manageAccess: "org_admins_only";
  /** Human-readable summary for display */
  accessSummary: string;
}

export type ConnectFlowStep =
  | "idle"
  | "pre_connect"
  | "authorizing"
  | "success"
  | "reconnect_required"
  | "failed";

export interface MailboxConnectFlowState {
  step: ConnectFlowStep;
  provider: MailboxProvider;
  /** Populated after success */
  connectedEmail?: string;
  /** Populated on failure */
  errorMessage?: string;
}

export interface MailboxAdminSummary {
  connection: MailboxConnection;
  policy: MailboxPermissionPolicy;
  /** ISO timestamp of last admin action */
  lastAdminActionAt: string | null;
  /** Display name of admin who connected this mailbox */
  connectedBy: string;
}

/** Real admin connection shape returned by /api/mailbox/connections */
export interface MailboxAdminConnection {
  id: string;
  orgId: string;
  provider: MailboxProvider;
  /** URL slug derived from connection id */
  slug: string;
  emailAddress: string;
  displayName: string;
  status: MailboxConnectionStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  sync?: MailboxSyncPresentation;
  connectedBy: string;
  visibilityPolicy: string;
  updatedAt?: string;
}

export type DisconnectConfirmState = "idle" | "confirming" | "disconnecting" | "disconnected";
export type ReconnectConfirmState = "idle" | "confirming" | "reconnecting";

// ─── Sprint 1.5 additions ────────────────────────────────────────────────────

export type LinkedEntityType = "customer" | "invoice" | "voucher" | "quote";
export type LinkConfidence = "confirmed" | "suggested" | "none";

export interface ThreadLinkSummary {
  id: string;
  threadId: string;
  entityType: LinkedEntityType;
  entityId: string;
  entityLabel: string;
  /** e.g. "INV-2026-0412", "QT-2026-0089" */
  entityRef: string;
  /** e.g. "₹48,500", "Due 30 Apr" */
  entityMeta: string;
  confidence: LinkConfidence;
  isPrimary: boolean;
}

export interface LinkedContextState {
  threadId: string;
  links: ThreadLinkSummary[];
  /** Suggested links not yet confirmed */
  suggestions: ThreadLinkSummary[];
  assignee: string | null;
  /** Real userId for API calls; null when unassigned */
  assigneeId: string | null;
  status: ThreadStatus;
  /** ISO timestamp of last status change */
  statusChangedAt: string | null;
  /** Free-text note placeholder */
  internalNote: string;
}

export type SmartViewId =
  | "all-inboxes"
  | "unread"
  | "assigned-to-me"
  | "unassigned"
  | "flagged"
  | "waiting"
  | "linked"
  | "unlinked";

export interface SmartViewDef {
  id: SmartViewId;
  label: string;
  href: string;
  description: string;
}

export const ACTIVE_FILTER_FIELDS = ["mailbox", "status", "assignee", "linked", "unread", "flagged"] as const;

export const SUPPORTED_SAVED_VIEW_SMART_VIEW_IDS = [
  "all-inboxes",
  "unread",
  "assigned-to-me",
  "unassigned",
  "flagged",
  "waiting",
] as const;

export type SupportedSavedViewSmartViewId = (typeof SUPPORTED_SAVED_VIEW_SMART_VIEW_IDS)[number];

export type FilterField = "mailbox" | "status" | "assignee" | "linked" | "unread" | "flagged";

export interface ActiveFilter {
  field: FilterField;
  value: string;
  label: string;
}

export interface ActiveFilterState {
  filters: ActiveFilter[];
  searchQuery: string;
}

// ─── Sprint 1.6 additions ────────────────────────────────────────────────────

/**
 * Coarse loading state for major mailbox surfaces.
 * Later phases plug real async state into these shapes.
 */
export type MailboxLoadingTarget =
  | "shell"
  | "thread-list"
  | "reading-pane"
  | "settings"
  | "linked-context";

export interface MailboxLoadingState {
  target: MailboxLoadingTarget;
  isLoading: boolean;
}

/**
 * Why a mailbox or surface is restricted.
 * Distinguishes permission scope from absence of data.
 */
export type MailboxRestrictedReason =
  | "no_permission"       // user lacks read access to this mailbox
  | "admin_only"          // surface is admin-only; user is not admin
  | "mailbox_not_visible" // mailbox exists but is not visible to this user's role
  | "org_suspended";      // org-level suspension

export interface MailboxRestrictedState {
  reason: MailboxRestrictedReason;
  /** Human-readable explanation for the user */
  message: string;
  /** Optional: who to contact or what action to take */
  guidance: string | null;
}

/**
 * Degraded mailbox health — distinct from reconnect_required.
 * Reconnect = auth expired. Degraded = sync is running but unreliable.
 */
export type MailboxDegradedReason =
  | "sync_lag"          // sync is running but significantly behind
  | "partial_failure"   // some messages failed to ingest
  | "watch_expired"     // push subscription expired; falling back to polling
  | "rate_limited";     // provider rate-limited; sync is throttled

export interface MailboxDegradedState {
  connectionId: string;
  reason: MailboxDegradedReason;
  /** Human-readable impact summary */
  impactSummary: string;
  /** ISO timestamp of when degraded state was first detected */
  detectedAt: string;
  /** Whether an admin action is required to resolve */
  requiresAdminAction: boolean;
}

/**
 * Responsive layout mode — drives mobile/tablet navigation state.
 * Desktop always shows full 3-pane layout.
 */
export type MailboxResponsivePanel = "rail" | "thread-list" | "reading-pane" | "context";

export interface MailboxResponsiveState {
  /** Which panel is currently visible on narrow viewports */
  activePanel: MailboxResponsivePanel;
  /** Whether the left rail drawer is open on tablet/mobile */
  isRailOpen: boolean;
}
