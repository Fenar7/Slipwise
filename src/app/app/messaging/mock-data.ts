/**
 * Messaging module — static mock data for Sprint 1.1 + Sprint 1.2.
 *
 * Realistic enough to communicate product intent. Later phases replace these
 * with real API/realtime data without changing the shape.
 */

import type {
  MessagingChannel,
  DirectMessage,
  MessagingGroup,
  MessagingTask,
  MessagingMeeting,
  MessagingFile,
  AdminEntry,
  MessagingParticipant,
  ConversationMessage,
  ActiveConversation,
} from "./types";

// ─── Participants ─────────────────────────────────────────────────────────────

export const MOCK_PARTICIPANTS: MessagingParticipant[] = [
  { id: "u1", name: "Priya Sharma", avatarInitials: "PS", role: "owner", presence: "online" },
  { id: "u2", name: "Arjun Mehta", avatarInitials: "AM", role: "admin", presence: "online" },
  { id: "u3", name: "Kavya Nair", avatarInitials: "KN", role: "member", presence: "away" },
  { id: "u4", name: "Rohan Desai", avatarInitials: "RD", role: "member", presence: "offline" },
  { id: "u5", name: "Sneha Iyer", avatarInitials: "SI", role: "member", presence: "online" },
];

// ─── Channels ────────────────────────────────────────────────────────────────

export const MOCK_CHANNELS: MessagingChannel[] = [
  {
    id: "ch-general",
    name: "general",
    description: "Company-wide announcements and updates",
    visibility: "public",
    memberCount: 48,
    unreadCount: 3,
    isPinned: true,
    lastActivityAt: "2026-05-09T10:45:00Z",
  },
  {
    id: "ch-finance",
    name: "finance-ops",
    description: "Finance team coordination and approvals",
    visibility: "private",
    memberCount: 12,
    unreadCount: 7,
    isPinned: true,
    lastActivityAt: "2026-05-09T10:30:00Z",
  },
  {
    id: "ch-invoices",
    name: "invoice-alerts",
    description: "Automated invoice status notifications",
    visibility: "public",
    memberCount: 24,
    unreadCount: 0,
    isPinned: false,
    lastActivityAt: "2026-05-09T09:15:00Z",
  },
  {
    id: "ch-payroll",
    name: "payroll-cycle",
    description: "Monthly payroll coordination",
    visibility: "private",
    memberCount: 8,
    unreadCount: 2,
    isPinned: false,
    lastActivityAt: "2026-05-08T17:00:00Z",
  },
  {
    id: "ch-compliance",
    name: "compliance-updates",
    description: "GST, TDS, and regulatory updates",
    visibility: "public",
    memberCount: 31,
    unreadCount: 0,
    isPinned: false,
    lastActivityAt: "2026-05-08T14:20:00Z",
  },
];

// ─── Direct Messages ─────────────────────────────────────────────────────────

export const MOCK_DMS: DirectMessage[] = [
  {
    id: "dm-1",
    participant: MOCK_PARTICIPANTS[1], // Arjun Mehta
    unreadCount: 2,
    lastActivityAt: "2026-05-09T10:50:00Z",
  },
  {
    id: "dm-2",
    participant: MOCK_PARTICIPANTS[2], // Kavya Nair
    unreadCount: 0,
    lastActivityAt: "2026-05-09T09:00:00Z",
  },
  {
    id: "dm-3",
    participant: MOCK_PARTICIPANTS[4], // Sneha Iyer
    unreadCount: 1,
    lastActivityAt: "2026-05-08T18:30:00Z",
  },
];

// ─── Groups ──────────────────────────────────────────────────────────────────

export const MOCK_GROUPS: MessagingGroup[] = [
  {
    id: "grp-q2-close",
    name: "Q2 Close Team",
    memberCount: 6,
    unreadCount: 4,
    isPrivate: true,
    lastActivityAt: "2026-05-09T10:20:00Z",
  },
  {
    id: "grp-vendor-onboard",
    name: "Vendor Onboarding",
    memberCount: 4,
    unreadCount: 0,
    isPrivate: false,
    lastActivityAt: "2026-05-08T16:45:00Z",
  },
  {
    id: "grp-audit-prep",
    name: "Audit Preparation",
    memberCount: 5,
    unreadCount: 1,
    isPrivate: true,
    lastActivityAt: "2026-05-08T11:00:00Z",
  },
];

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const MOCK_TASKS: MessagingTask[] = [
  {
    id: "task-1",
    title: "Review Q2 invoice reconciliation report",
    assignee: MOCK_PARTICIPANTS[0],
    dueDate: "2026-05-12",
    status: "open",
    conversationRef: "ch-finance",
  },
  {
    id: "task-2",
    title: "Approve payroll run for May",
    assignee: MOCK_PARTICIPANTS[1],
    dueDate: "2026-05-10",
    status: "in-progress",
    conversationRef: "ch-payroll",
  },
  {
    id: "task-3",
    title: "Send GST filing confirmation to compliance team",
    assignee: MOCK_PARTICIPANTS[2],
    dueDate: "2026-05-08",
    status: "overdue",
    conversationRef: "ch-compliance",
  },
  {
    id: "task-4",
    title: "Onboard new vendor — Apex Supplies",
    assignee: MOCK_PARTICIPANTS[4],
    dueDate: "2026-05-15",
    status: "open",
    conversationRef: "grp-vendor-onboard",
  },
];

// ─── Meetings ────────────────────────────────────────────────────────────────

export const MOCK_MEETINGS: MessagingMeeting[] = [
  {
    id: "meet-1",
    title: "Q2 Close Sync",
    scheduledAt: "2026-05-09T14:00:00Z",
    durationMinutes: 60,
    status: "upcoming",
    participantCount: 6,
    calendarProvider: "google",
  },
  {
    id: "meet-2",
    title: "Finance Team Weekly",
    scheduledAt: "2026-05-12T10:00:00Z",
    durationMinutes: 45,
    status: "upcoming",
    participantCount: 12,
    calendarProvider: "google",
  },
  {
    id: "meet-3",
    title: "Vendor Review — Apex Supplies",
    scheduledAt: "2026-05-08T11:00:00Z",
    durationMinutes: 30,
    status: "ended",
    participantCount: 4,
    calendarProvider: null,
  },
];

// ─── Files ───────────────────────────────────────────────────────────────────

export const MOCK_FILES: MessagingFile[] = [
  {
    id: "file-1",
    name: "Q2-Reconciliation-Draft.xlsx",
    category: "spreadsheet",
    sizeLabel: "248 KB",
    uploadedBy: "Priya Sharma",
    uploadedAt: "2026-05-09T09:30:00Z",
    conversationRef: "ch-finance",
  },
  {
    id: "file-2",
    name: "May-Payroll-Summary.pdf",
    category: "document",
    sizeLabel: "1.2 MB",
    uploadedBy: "Arjun Mehta",
    uploadedAt: "2026-05-08T17:15:00Z",
    conversationRef: "ch-payroll",
  },
  {
    id: "file-3",
    name: "Vendor-Contract-Apex.pdf",
    category: "document",
    sizeLabel: "890 KB",
    uploadedBy: "Sneha Iyer",
    uploadedAt: "2026-05-08T14:00:00Z",
    conversationRef: "grp-vendor-onboard",
  },
];

// ─── Admin entries ────────────────────────────────────────────────────────────

export const MOCK_ADMIN_ENTRIES: AdminEntry[] = [
  {
    area: "channel-policy",
    label: "Channel Policy",
    description: "Manage channel creation rules, naming conventions, and membership defaults",
    requiresRole: "admin",
  },
  {
    area: "retention",
    label: "Retention & Export",
    description: "Configure message retention periods and data export for compliance",
    requiresRole: "admin",
  },
  {
    area: "moderation",
    label: "Moderation",
    description: "Review flagged content and manage moderation actions",
    requiresRole: "admin",
  },
  {
    area: "audit-log",
    label: "Audit Log",
    description: "Full audit trail of messaging actions, access events, and policy changes",
    requiresRole: "admin",
  },
  {
    area: "member-governance",
    label: "Member Governance",
    description: "Manage org-wide messaging access, role assignments, and restrictions",
    requiresRole: "owner",
  },
];

// ─── Unread summary ───────────────────────────────────────────────────────────

export const MOCK_UNREAD_SUMMARY = {
  channels: MOCK_CHANNELS.reduce((sum, c) => sum + c.unreadCount, 0),
  dms: MOCK_DMS.reduce((sum, d) => sum + d.unreadCount, 0),
  groups: MOCK_GROUPS.reduce((sum, g) => sum + g.unreadCount, 0),
  tasks: MOCK_TASKS.filter((t) => t.status === "open" || t.status === "overdue").length,
  meetings: MOCK_MEETINGS.filter((m) => m.status === "upcoming").length,
};

// ─── Sprint 1.2 — Static message threads ─────────────────────────────────────

/**
 * Static messages for the #finance-ops channel reading workspace.
 * Realistic enough to communicate product intent; no realtime in Phase 1.
 */
export const MOCK_MESSAGES_CHANNEL_FINANCE: ConversationMessage[] = [
  {
    id: "msg-ch-f-1",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Q2 reconciliation draft is ready for review. I've attached the spreadsheet — please check the vendor line items before EOD.",
    sentAt: "2026-05-09T08:15:00Z",
    hasThread: true,
    threadReplyCount: 4,
    reactions: [{ emoji: "👍", count: 3, reactedByCurrentUser: false }, { emoji: "✅", count: 2, reactedByCurrentUser: false }],
    attachmentRef: "Q2-Reconciliation-Draft.xlsx",
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-2",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Reviewed the vendor section. Found a discrepancy on the Apex Supplies invoice — line 14 doesn't match the PO. @Priya Sharma can you confirm?",
    sentAt: "2026-05-09T09:02:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: true,
  },
  {
    id: "msg-ch-f-3",
    authorId: "u3",
    authorName: "Kavya Nair",
    authorInitials: "KN",
    authorRole: "member",
    body: "Payroll run for May is staged. Waiting on final headcount confirmation from HR before I submit.",
    sentAt: "2026-05-09T09:45:00Z",
    hasThread: true,
    threadReplyCount: 2,
    reactions: [{ emoji: "🕐", count: 1, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-4",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Confirmed — Apex line 14 is a partial delivery. The PO was split. I'll update the reconciliation and re-share.",
    sentAt: "2026-05-09T10:10:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👍", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-5",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "TDS filing deadline is May 15. @Kavya Nair please ensure the TDS certificates are ready by May 12.",
    sentAt: "2026-05-09T10:30:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

/**
 * Static messages for the DM with Arjun Mehta.
 */
export const MOCK_MESSAGES_DM_ARJUN: ConversationMessage[] = [
  {
    id: "msg-dm-a-1",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Hey — did you get a chance to look at the Q2 draft? I flagged the Apex line item in the channel but wanted to follow up directly.",
    sentAt: "2026-05-09T10:20:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-dm-a-2",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Yes, just replied in the channel. It's a split PO — I'll update the sheet and re-share within the hour.",
    sentAt: "2026-05-09T10:35:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👍", count: 1, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-dm-a-3",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Perfect. Also — the board wants a summary of the May payroll variance. Can we sync briefly before the 2pm call?",
    sentAt: "2026-05-09T10:50:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: true,
  },
];

/**
 * Static messages for the Q2 Close Team group.
 */
export const MOCK_MESSAGES_GROUP_Q2: ConversationMessage[] = [
  {
    id: "msg-grp-q2-1",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Q2 close checklist is pinned above. We need all line items signed off by May 12. Please update your status in the sheet.",
    sentAt: "2026-05-09T08:00:00Z",
    hasThread: true,
    threadReplyCount: 3,
    reactions: [{ emoji: "✅", count: 4, reactedByCurrentUser: false }],
    attachmentRef: "Q2-Reconciliation-Draft.xlsx",
    mentionsCurrentUser: false,
  },
  {
    id: "msg-grp-q2-2",
    authorId: "u3",
    authorName: "Kavya Nair",
    authorInitials: "KN",
    authorRole: "member",
    body: "Payroll section is done. Vendor payments still pending — waiting on Rohan's sign-off.",
    sentAt: "2026-05-09T09:15:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-grp-q2-3",
    authorId: "u4",
    authorName: "Rohan Desai",
    authorInitials: "RD",
    authorRole: "member",
    body: "Vendor payments reviewed. Two items flagged — I've added comments in the sheet. @Priya Sharma needs to approve before I can release.",
    sentAt: "2026-05-09T10:05:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👀", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: true,
  },
  {
    id: "msg-grp-q2-4",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "GST reconciliation is complete. Filing confirmation sent to compliance. All good on my end.",
    sentAt: "2026-05-09T10:20:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "✅", count: 3, reactedByCurrentUser: false }, { emoji: "🎉", count: 1, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_CHANNEL_GENERAL: ConversationMessage[] = [
  {
    id: "msg-ch-g-1",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Quick reminder: company town hall is scheduled for 4 PM. Please drop final agenda items in the planning doc before lunch.",
    sentAt: "2026-05-09T07:45:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "📌", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-g-2",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "Shared the updated onboarding deck with the customer success team. Please flag anything that needs legal review.",
    sentAt: "2026-05-09T10:05:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👀", count: 3, reactedByCurrentUser: false }],
    attachmentRef: "Onboarding-Deck-v3.pdf",
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_CHANNEL_INVOICES: ConversationMessage[] = [
  {
    id: "msg-ch-i-1",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Invoice alerts are healthy. Two reminders are queued for today’s collections run.",
    sentAt: "2026-05-09T09:10:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_CHANNEL_PAYROLL: ConversationMessage[] = [
  {
    id: "msg-ch-p-1",
    authorId: "u3",
    authorName: "Kavya Nair",
    authorInitials: "KN",
    authorRole: "member",
    body: "May payroll staging is ready. Waiting on final approval before the bank file is released.",
    sentAt: "2026-05-08T17:05:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "🕐", count: 1, reactedByCurrentUser: false }],
    attachmentRef: "May-Payroll-Summary.pdf",
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_CHANNEL_COMPLIANCE: ConversationMessage[] = [
  {
    id: "msg-ch-c-1",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "GST filing checklist is complete. Final TDS certificate review remains open for tomorrow morning.",
    sentAt: "2026-05-08T14:30:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "✅", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_DM_KAVYA: ConversationMessage[] = [
  {
    id: "msg-dm-k-1",
    authorId: "u3",
    authorName: "Kavya Nair",
    authorInitials: "KN",
    authorRole: "member",
    body: "I’ve updated the payroll variance notes. Can you take a look before I send them to Arjun?",
    sentAt: "2026-05-09T08:55:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_DM_SNEHA: ConversationMessage[] = [
  {
    id: "msg-dm-s-1",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "Legal cleared the Apex contract. I dropped the final PDF into the vendor onboarding group.",
    sentAt: "2026-05-08T18:35:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👍", count: 1, reactedByCurrentUser: false }],
    attachmentRef: "Vendor-Contract-Apex.pdf",
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_GROUP_VENDOR: ConversationMessage[] = [
  {
    id: "msg-grp-v-1",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "Vendor onboarding packet is complete. Waiting on tax docs from Apex before finance review.",
    sentAt: "2026-05-08T16:50:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "📎", count: 1, reactedByCurrentUser: false }],
    attachmentRef: "Vendor-Contract-Apex.pdf",
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_GROUP_AUDIT: ConversationMessage[] = [
  {
    id: "msg-grp-a-1",
    authorId: "u4",
    authorName: "Rohan Desai",
    authorInitials: "RD",
    authorRole: "member",
    body: "Audit preparation tracker is updated with the latest request list from the external team.",
    sentAt: "2026-05-08T11:10:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "🗂️", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

/**
 * Thread replies for the first message in #finance-ops (msg-ch-f-1).
 * Represents the static thread-open state for Sprint 1.2.
 */
export const MOCK_THREAD_REPLIES_CH_F_1: ConversationMessage[] = [
  {
    id: "msg-ch-f-1-r1",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Checked vendor section — Apex and Meridian look fine. Flagging line 14 separately.",
    sentAt: "2026-05-09T08:30:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-1-r2",
    authorId: "u3",
    authorName: "Kavya Nair",
    authorInitials: "KN",
    authorRole: "member",
    body: "Payroll section reviewed. No issues.",
    sentAt: "2026-05-09T08:45:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "✅", count: 1, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-1-r3",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "GST section looks correct. Approved.",
    sentAt: "2026-05-09T09:00:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-ch-f-1-r4",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Thanks all. Will finalize and share the updated version by noon.",
    sentAt: "2026-05-09T09:10:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "👍", count: 2, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_THREAD_REPLIES_GROUP_Q2_1: ConversationMessage[] = [
  {
    id: "msg-grp-q2-1-r1",
    authorId: "u2",
    authorName: "Arjun Mehta",
    authorInitials: "AM",
    authorRole: "admin",
    body: "Collections tracker is done. I’ll upload the revised variance summary before the sync.",
    sentAt: "2026-05-09T08:20:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-grp-q2-1-r2",
    authorId: "u5",
    authorName: "Sneha Iyer",
    authorInitials: "SI",
    authorRole: "member",
    body: "Compliance side is green. Filing evidence is already attached in the checklist.",
    sentAt: "2026-05-09T08:35:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [{ emoji: "✅", count: 1, reactedByCurrentUser: false }],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
  {
    id: "msg-grp-q2-1-r3",
    authorId: "u1",
    authorName: "Priya Sharma",
    authorInitials: "PS",
    authorRole: "owner",
    body: "Great. Keep the tracker current so we can close the remaining dependencies by tomorrow morning.",
    sentAt: "2026-05-09T08:50:00Z",
    hasThread: false,
    threadReplyCount: 0,
    reactions: [],
    attachmentRef: null,
    mentionsCurrentUser: false,
  },
];

export const MOCK_MESSAGES_BY_CONVERSATION_ID: Record<string, ConversationMessage[]> = {
  "ch-general": MOCK_MESSAGES_CHANNEL_GENERAL,
  "ch-finance": MOCK_MESSAGES_CHANNEL_FINANCE,
  "ch-invoices": MOCK_MESSAGES_CHANNEL_INVOICES,
  "ch-payroll": MOCK_MESSAGES_CHANNEL_PAYROLL,
  "ch-compliance": MOCK_MESSAGES_CHANNEL_COMPLIANCE,
  "dm-1": MOCK_MESSAGES_DM_ARJUN,
  "dm-2": MOCK_MESSAGES_DM_KAVYA,
  "dm-3": MOCK_MESSAGES_DM_SNEHA,
  "grp-q2-close": MOCK_MESSAGES_GROUP_Q2,
  "grp-vendor-onboard": MOCK_MESSAGES_GROUP_VENDOR,
  "grp-audit-prep": MOCK_MESSAGES_GROUP_AUDIT,
};

export const MOCK_THREAD_REPLIES_BY_MESSAGE_ID: Record<string, ConversationMessage[]> = {
  "msg-ch-f-1": MOCK_THREAD_REPLIES_CH_F_1,
  "msg-grp-q2-1": MOCK_THREAD_REPLIES_GROUP_Q2_1,
};

export function getMessagesForConversation(conversationId: string): ConversationMessage[] {
  return MOCK_MESSAGES_BY_CONVERSATION_ID[conversationId] ?? [];
}

export function getThreadRepliesForMessage(messageId: string): ConversationMessage[] {
  return MOCK_THREAD_REPLIES_BY_MESSAGE_ID[messageId] ?? [];
}

/**
 * Seed active conversation objects for each conversation kind.
 * Used by the reading workspace to initialize with a believable default state.
 */
export const MOCK_ACTIVE_CHANNEL: ActiveConversation = {
  id: "ch-finance",
  kind: "channel",
  name: "finance-ops",
  subtitle: "Finance team coordination and approvals · 12 members",
  channelVisibility: "private",
  isAccessible: true,
  threadOpen: false,
  threadAnchorMessageId: null,
};

export const MOCK_ACTIVE_DM: ActiveConversation = {
  id: "dm-1",
  kind: "dm",
  name: "Arjun Mehta",
  subtitle: "Admin · Online",
  dmParticipant: MOCK_PARTICIPANTS[1],
  isAccessible: true,
  threadOpen: false,
  threadAnchorMessageId: null,
};

export const MOCK_ACTIVE_GROUP: ActiveConversation = {
  id: "grp-q2-close",
  kind: "group",
  name: "Q2 Close Team",
  subtitle: "Private group · 6 members",
  groupMemberCount: 6,
  groupIsPrivate: true,
  isAccessible: true,
  threadOpen: false,
  threadAnchorMessageId: null,
};

// ─── Sprint 1.4 mock data ─────────────────────────────────────────────────────

import type { ChannelMember, PinnedMessage, AuditLogEntry } from "./types";

export const MOCK_CHANNEL_MEMBERS: ChannelMember[] = [
  { id: "mem-1", name: "Arjun Mehta", avatarInitials: "AM", role: "owner",
    presence: "online", joinedAt: "2025-11-01T09:00:00Z" },
  { id: "mem-2", name: "Priya Sharma", avatarInitials: "PS", role: "admin",
    presence: "online", joinedAt: "2025-11-02T10:00:00Z" },
  { id: "mem-3", name: "Rohan Gupta", avatarInitials: "RG", role: "member",
    presence: "away", joinedAt: "2025-11-03T11:00:00Z" },
  { id: "mem-4", name: "Sneha Patel", avatarInitials: "SP", role: "member",
    presence: "offline", joinedAt: "2025-11-04T12:00:00Z" },
  { id: "mem-5", name: "Karan Joshi", avatarInitials: "KJ", role: "member",
    presence: "online", joinedAt: "2025-11-05T13:00:00Z" },
];

export const MOCK_PINNED_MESSAGES: PinnedMessage[] = [
  { id: "pin-1", authorName: "Arjun Mehta",
    body: "Q2 salary slip run scheduled for 15th. All managers please confirm headcount.",
    pinnedAt: "2025-12-01T08:30:00Z" },
  { id: "pin-2", authorName: "Priya Sharma",
    body: "Reminder: GST filing deadline is the 20th. Upload supporting docs to #compliance.",
    pinnedAt: "2025-12-05T09:15:00Z" },
];

export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: "al-1", actorName: "Arjun Mehta", action: "CHANNEL_CREATED",
    summary: "Created #payroll channel", occurredAt: "2025-11-01T09:05:00Z" },
  { id: "al-2", actorName: "Priya Sharma", action: "MEMBER_ADDED",
    summary: "Added Rohan Gupta to #compliance", occurredAt: "2025-11-03T11:10:00Z" },
  { id: "al-3", actorName: "Arjun Mehta", action: "RETENTION_UPDATED",
    summary: "Retention period changed to 1 year", occurredAt: "2025-11-10T14:00:00Z" },
  { id: "al-4", actorName: "Priya Sharma", action: "MEMBER_REMOVED",
    summary: "Removed Karan Joshi from #invoices", occurredAt: "2025-11-15T16:30:00Z" },
  { id: "al-5", actorName: "Arjun Mehta", action: "CHANNEL_ARCHIVED",
    summary: "Archived #onboarding-q3 channel", occurredAt: "2025-11-20T10:45:00Z" },
];
