import type { MailboxConnection, MailboxGroup, MailboxTreeItem } from "./types";

export const MOCK_CONNECTIONS: MailboxConnection[] = [
  {
    id: "conn_billing",
    orgId: "org_1",
    provider: "gmail",
    emailAddress: "billing@acmecorp.com",
    displayName: "Billing",
    status: "connected",
    lastSyncAt: "2026-05-08T14:30:00Z",
    lastSyncError: null,
    unreadCount: 14,
    inboxCount: 47,
  },
  {
    id: "conn_support",
    orgId: "org_1",
    provider: "gmail",
    emailAddress: "support@acmecorp.com",
    displayName: "Support",
    status: "connected",
    lastSyncAt: "2026-05-08T14:28:00Z",
    lastSyncError: null,
    unreadCount: 6,
    inboxCount: 23,
  },
  {
    id: "conn_accounts",
    orgId: "org_1",
    provider: "gmail",
    emailAddress: "accounts@acmecorp.com",
    displayName: "Accounts",
    status: "reconnect_required",
    lastSyncAt: "2026-05-07T09:15:00Z",
    lastSyncError: "OAuth token expired. Reconnect required.",
    unreadCount: 0,
    inboxCount: 0,
  },
];

export const GLOBAL_SMART_VIEWS: MailboxTreeItem[] = [
  {
    id: "all-inboxes",
    label: "All Inboxes",
    href: "/app/mailbox",
    icon: "Inbox",
    unreadCount: 20,
    isSmartView: true,
  },
  {
    id: "unread",
    label: "Unread",
    href: "/app/mailbox/unread",
    icon: "Circle",
    unreadCount: 20,
    isSmartView: true,
  },
  {
    id: "assigned-to-me",
    label: "Assigned to me",
    href: "/app/mailbox/assigned",
    icon: "UserCheck",
    unreadCount: 3,
    isSmartView: true,
  },
  {
    id: "unassigned",
    label: "Unassigned",
    href: "/app/mailbox/unassigned",
    icon: "UserX",
    unreadCount: 8,
    isSmartView: true,
  },
  {
    id: "flagged",
    label: "Flagged",
    href: "/app/mailbox/flagged",
    icon: "Flag",
    unreadCount: 2,
    isSmartView: true,
  },
  {
    id: "waiting",
    label: "Waiting",
    href: "/app/mailbox/waiting",
    icon: "Clock",
    isSmartView: true,
  },
];

function mailboxFolders(connectionId: string, prefix: string): MailboxTreeItem[] {
  return [
    {
      id: `${connectionId}-inbox`,
      label: "Inbox",
      href: `/app/mailbox/${prefix}/inbox`,
      icon: "Inbox",
      mailboxConnectionId: connectionId,
    },
    {
      id: `${connectionId}-sent`,
      label: "Sent",
      href: `/app/mailbox/${prefix}/sent`,
      icon: "Send",
      mailboxConnectionId: connectionId,
    },
    {
      id: `${connectionId}-drafts`,
      label: "Drafts",
      href: `/app/mailbox/${prefix}/drafts`,
      icon: "FileEdit",
      mailboxConnectionId: connectionId,
    },
    {
      id: `${connectionId}-archive`,
      label: "Archive",
      href: `/app/mailbox/${prefix}/archive`,
      icon: "Archive",
      mailboxConnectionId: connectionId,
    },
    {
      id: `${connectionId}-spam`,
      label: "Spam",
      href: `/app/mailbox/${prefix}/spam`,
      icon: "ShieldAlert",
      mailboxConnectionId: connectionId,
    },
  ];
}

export const MOCK_MAILBOX_GROUPS: MailboxGroup[] = MOCK_CONNECTIONS.map((conn) => ({
  connection: conn,
  items: mailboxFolders(conn.id, conn.displayName.toLowerCase()),
}));
