/**
 * Messaging module — static mock data for Sprint 1.1.
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
