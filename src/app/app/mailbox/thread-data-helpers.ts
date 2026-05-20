import type {
  MailboxThreadReadShape,
  MailboxThreadDetailReadShape,
  MailboxThreadDetailMessageReadShape,
} from "@/lib/mailbox/read-shapes";
import type { ThreadRowData } from "./mailbox-thread-list";
import type { MailboxThreadDetail, MailboxMessageItem, MailboxAttachmentSummary } from "./types";

const MAILBOX_COLORS = [
  "#16294D",
  "#D97706",
  "#2563EB",
  "#16A34A",
  "#7C3AED",
  "#0891B2",
  "#C05092",
  "#DC2626",
  "#64748B",
  "#EA580C",
];

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function deriveMailboxColor(id: string): string {
  return MAILBOX_COLORS[stringHash(id) % MAILBOX_COLORS.length];
}

export function deriveFromColor(email: string): string {
  return MAILBOX_COLORS[stringHash(email) % MAILBOX_COLORS.length];
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function formatRelativeTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60)
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export interface ThreadMappingContext {
  connectionMap: Map<string, { displayName: string; color: string }>;
  currentUserId: string;
}

export function mapThreadToRowData(
  thread: MailboxThreadReadShape,
  ctx: ThreadMappingContext,
): ThreadRowData {
  const connectionInfo = ctx.connectionMap.get(thread.mailboxConnectionId);
  const mailboxLabel = connectionInfo?.displayName ?? "Mailbox";
  const mailboxColor = connectionInfo?.color ?? "#16294D";

  // Derive sender from first participant
  const firstParticipant = thread.participants[0];
  const from = firstParticipant?.displayName ?? firstParticipant?.email ?? "Unknown";
  const fromEmail = firstParticipant?.email ?? "";

  // Derive assignee label
  let assignee: string | undefined;
  if (thread.assigneeId) {
    assignee = thread.assigneeId === ctx.currentUserId ? "You" : (thread.assigneeName ?? "Assigned");
  }

  return {
    id: thread.id,
    mailboxConnectionId: thread.mailboxConnectionId,
    subject: thread.subject,
    snippet: thread.previewSnippet,
    from,
    fromInitial: getInitial(from),
    fromColor: deriveFromColor(fromEmail || thread.id),
    timestamp: formatRelativeTimestamp(thread.lastMessageAt),
    isUnread: thread.unreadCount > 0,
    isFlagged: thread.isFlagged,
    hasAttachment: thread.attachmentCount > 0,
    mailboxLabel,
    mailboxColor,
    assignee,
    status: thread.status.toLowerCase() as "open" | "pending" | "closed" | "archived",
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildParticipantsSummary(
  participants: { displayName?: string; email: string }[],
): string {
  if (participants.length === 0) return "No participants";
  if (participants.length === 1) {
    return participants[0].displayName ?? participants[0].email;
  }
  const first = participants[0].displayName ?? participants[0].email;
  const remaining = participants.length - 1;
  return `${first}, +${remaining}`;
}

function mapMessageToItem(
  msg: MailboxThreadDetailMessageReadShape,
  index: number,
  totalMessages: number,
): MailboxMessageItem {
  const fromParticipant = msg.from;
  const fromName = fromParticipant?.displayName ?? fromParticipant?.email ?? "Unknown";
  const fromEmail = fromParticipant?.email ?? "";

  const toList = (msg.to ?? [])
    .map((p) => (p as { displayName?: string; email: string }).displayName ?? (p as { email: string }).email)
    .filter(Boolean);
  const ccList = (msg.cc ?? [])
    .map((p) => (p as { displayName?: string; email: string }).displayName ?? (p as { email: string }).email)
    .filter(Boolean);

  const attachments: MailboxAttachmentSummary[] = (msg.attachments ?? []).map((att) => ({
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    sizeLabel: formatFileSize(att.size),
  }));

  // Older messages (not the last one) are collapsed by default
  const isCollapsed = totalMessages > 1 && index < totalMessages - 1;

  return {
    id: msg.id,
    threadId: msg.threadId,
    direction: msg.direction === "inbound" ? "inbound" : "outbound",
    from: fromName,
    fromInitial: getInitial(fromName),
    fromColor: deriveFromColor(fromEmail || msg.id),
    fromEmail,
    to: toList,
    cc: ccList.length > 0 ? ccList : undefined,
    subject: msg.subject,
    bodyHtml: msg.htmlBody,
    sentAt: msg.sentAt,
    isCollapsed,
    attachments,
  };
}

export interface DetailMappingContext {
  connectionMap: Map<string, { displayName: string; color: string }>;
  currentUserId: string;
}

export function mapThreadDetailToUI(
  detail: MailboxThreadDetailReadShape,
  ctx: DetailMappingContext,
): MailboxThreadDetail {
  const connectionInfo = ctx.connectionMap.get(detail.mailboxConnectionId);
  const mailboxLabel = connectionInfo?.displayName ?? "Mailbox";
  const mailboxColor = connectionInfo?.color ?? "#16294D";

  const assignee = detail.assigneeId
    ? detail.assigneeId === ctx.currentUserId
      ? "You"
      : (detail.assigneeName ?? "Assigned")
    : null;

  const messages = detail.messages.map((msg, idx) =>
    mapMessageToItem(msg, idx, detail.messages.length),
  );

  const totalAttachments = detail.messages.reduce(
    (sum, msg) => sum + (msg.attachments?.length ?? 0),
    0,
  );

  return {
    threadId: detail.id,
    mailboxConnectionId: detail.mailboxConnectionId,
    subject: detail.subject,
    status: detail.status.toLowerCase() as "open" | "pending" | "closed" | "archived",
    isFlagged: detail.isFlagged,
    assignee,
    mailboxLabel,
    mailboxColor,
    participantsSummary: buildParticipantsSummary(detail.participants),
    messages,
    totalAttachments,
  };
}
