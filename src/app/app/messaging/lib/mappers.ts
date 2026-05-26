"use client";

import type {
  MessagingChannel,
  DirectMessage,
  MessagingGroup,
  ActiveConversation,
  ConversationMessage,
  MessageReaction,
} from "../types";

export interface ApiConversationSummary {
  id: string;
  orgId: string;
  type: "CHANNEL" | "DM" | "GROUP";
  name: string | null;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE" | null;
  archivedAt: string | null;
  lockedAt: string | null;
  participantCount: number;
  lastMessageAt: string | null;
  unreadCount: number | null;
  createdAt: string;
  canSend: boolean;
  /** DM peer id — present when backend enriches DM summaries */
  dmPeerId?: string | null;
  /** DM peer display name — present when backend enriches DM summaries */
  dmPeerName?: string | null;
  /** Pinned by current user — defaults to false if absent */
  isPinned?: boolean;
}

export interface ApiParticipantProfile {
  userId: string;
  name: string;
  avatarInitials: string;
}

export interface ApiParticipant {
  id: string;
  orgId: string;
  conversationId: string;
  userId: string;
  role: string;
  isActive: boolean;
  isMuted: boolean;
  joinedAt: string;
  displayName?: string;
}

export interface ApiReactionSummaryItem {
  value: string;
  count: number;
  reactedByCurrentUser: boolean;
}

export interface ApiMessage {
  id: string;
  orgId: string;
  conversationId: string;
  threadId: string | null;
  authorId: string;
  /** Fallback to authorId or "Unknown" when backend does not resolve names */
  authorName?: string;
  authorInitials?: string;
  body: string;
  status: string;
  editedAt: string | null;
  deletedAt: string | null;
  reactionSummary: ApiReactionSummaryItem[];
  attachmentCount: number;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
  }>;
  mentionsCurrentUser?: boolean;
  createdAt: string;
}

export interface ApiReadState {
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  isMuted: boolean;
}

export interface ApiConversationDetail {
  id: string;
  orgId: string;
  type: "CHANNEL" | "DM" | "GROUP";
  name: string | null;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE" | null;
  archivedAt: string | null;
  lockedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  canSend: boolean;
  participants: ApiParticipant[];
  /** Optional profile enrichment — present when backend resolves display names */
  participantProfiles?: ApiParticipantProfile[];
  messages: ApiMessage[];
  threads: Array<{ id: string; conversationId: string; anchorMessageId: string; title: string | null; replyCount: number; resolvedAt: string | null; createdAt: string }>;
  readState: ApiReadState | null;
  /** The userId of the current authenticated viewer */
  currentUserId: string;
}

export interface ApiTaskSummary {
  id: string;
  orgId: string;
  conversationId: string;
  originatingMessageId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: "low" | "medium" | "high" | "critical";
  isOverdue: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarInitials: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  reminderSentAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  conversationName?: string | null;
  conversationType?: "CHANNEL" | "DM" | "GROUP";
}


export function toFrontendChannel(summary: ApiConversationSummary): MessagingChannel {
  return {
    id: summary.id,
    name: summary.name ?? "Untitled channel",
    description: summary.description ?? "",
    visibility: summary.visibility === "PRIVATE" ? "private" : "public",
    memberCount: summary.participantCount,
    unreadCount: summary.unreadCount ?? 0,
    isPinned: summary.isPinned ?? false,
    lastActivityAt: summary.lastMessageAt ?? summary.createdAt,
  };
}

export function toFrontendDM(summary: ApiConversationSummary): DirectMessage {
  const peerName = summary.dmPeerName ?? summary.name ?? "Unknown";
  return {
    id: summary.id,
    participant: {
      id: summary.dmPeerId ?? "unknown",
      name: peerName,
      avatarInitials: makeInitials(peerName),
      role: "member",
      presence: "offline",
    },
    unreadCount: summary.unreadCount ?? 0,
    lastActivityAt: summary.lastMessageAt ?? summary.createdAt,
  };
}

export function toFrontendGroup(summary: ApiConversationSummary): MessagingGroup {
  return {
    id: summary.id,
    name: summary.name ?? "Untitled group",
    memberCount: summary.participantCount,
    unreadCount: summary.unreadCount ?? 0,
    isPrivate: summary.visibility === "PRIVATE",
    lastActivityAt: summary.lastMessageAt ?? summary.createdAt,
  };
}

export function toActiveConversation(
  summary: ApiConversationSummary,
  kind: "channel" | "dm" | "group",
): ActiveConversation {
  const isAccessible = summary.archivedAt === null && summary.lockedAt === null;
  const base: ActiveConversation = {
    id: summary.id,
    kind,
    name: kind === "dm" ? (summary.dmPeerName ?? summary.name ?? "Unknown") : (summary.name ?? "Untitled"),
    subtitle: "",
    isAccessible,
    threadOpen: false,
    threadAnchorMessageId: null,
    archivedAt: summary.archivedAt,
    lockedAt: summary.lockedAt,
    canSend: summary.canSend,
  };

  if (kind === "channel") {
    base.channelVisibility = summary.visibility === "PRIVATE" ? "private" : "public";
    base.subtitle = `${summary.description ?? ""} · ${summary.participantCount} members`;
  } else if (kind === "dm") {
    base.subtitle = "Direct message";
  } else if (kind === "group") {
    base.groupMemberCount = summary.participantCount;
    base.groupIsPrivate = summary.visibility === "PRIVATE";
    base.subtitle = `${summary.participantCount} members`;
  }

  return base;
}

export function toFrontendMessages(detail: ApiConversationDetail): ConversationMessage[] {
  // Build a lookup for author names when backend provides participantProfiles
  const profileByUserId = new Map<string, ApiParticipantProfile>();
  if (detail.participantProfiles) {
    for (const p of detail.participantProfiles) {
      profileByUserId.set(p.userId, p);
    }
  }
  // Build a lookup for thread metadata by anchor message id
  const threadByAnchor = new Map<string, { replyCount: number }>();
  for (const t of detail.threads) {
    threadByAnchor.set(t.anchorMessageId, { replyCount: t.replyCount });
  }
  const seenIds = new Set<string>();
  return detail.messages.map((msg) => {
    if (seenIds.has(msg.id)) return null;
    seenIds.add(msg.id);
    const profile = profileByUserId.get(msg.authorId);
    const authorName = msg.authorName ?? profile?.name ?? msg.authorId.slice(0, 8);
    const authorInitials = msg.authorInitials ?? profile?.avatarInitials ?? makeInitials(authorName);
    const threadMeta = threadByAnchor.get(msg.id);
    return {
      id: msg.id,
      authorId: msg.authorId,
      authorName,
      authorInitials,
      authorRole: "member",
      body: msg.body,
      sentAt: msg.createdAt,
      hasThread: !!threadMeta,
      threadReplyCount: threadMeta?.replyCount ?? 0,
      reactions: msg.reactionSummary.map(
        (r): MessageReaction => ({
          emoji: r.value,
          count: r.count,
          reactedByCurrentUser: r.reactedByCurrentUser,
        }),
      ),
      attachmentRef: msg.attachmentCount > 0
        ? `${msg.attachmentCount} attachment${msg.attachmentCount > 1 ? "s" : ""}`
        : null,
      attachmentRecords: (msg.attachments ?? []).map((att) => ({
        id: att.id,
        name: att.fileName,
        mimeType: att.mimeType,
        mimeCategory: deriveMimeCategory(att.mimeType),
        sizeBytes: att.sizeBytes,
        scanStatus: att.scanStatus,
      })),
      mentionsCurrentUser: msg.mentionsCurrentUser ?? false,
    };
  }).filter(Boolean) as ConversationMessage[];
}

export function toFrontendThreadReplies(replies: ApiMessage[], detail: ApiConversationDetail): ConversationMessage[] {
  const profileByUserId = new Map<string, ApiParticipantProfile>();
  if (detail.participantProfiles) {
    for (const p of detail.participantProfiles) {
      profileByUserId.set(p.userId, p);
    }
  }
  const seenIds = new Set<string>();
  return replies.map((msg) => {
    if (seenIds.has(msg.id)) return null;
    seenIds.add(msg.id);
    const profile = profileByUserId.get(msg.authorId);
    const authorName = msg.authorName ?? profile?.name ?? msg.authorId.slice(0, 8);
    const authorInitials = msg.authorInitials ?? profile?.avatarInitials ?? makeInitials(authorName);
    return {
      id: msg.id,
      authorId: msg.authorId,
      authorName,
      authorInitials,
      authorRole: "member",
      body: msg.body,
      sentAt: msg.createdAt,
      hasThread: false,
      threadReplyCount: 0,
      reactions: msg.reactionSummary.map(
        (r): MessageReaction => ({
          emoji: r.value,
          count: r.count,
          reactedByCurrentUser: r.reactedByCurrentUser,
        }),
      ),
      attachmentRef: msg.attachmentCount > 0
        ? `${msg.attachmentCount} attachment${msg.attachmentCount > 1 ? "s" : ""}`
        : null,
      attachmentRecords: (msg.attachments ?? []).map((att) => ({
        id: att.id,
        name: att.fileName,
        mimeType: att.mimeType,
        mimeCategory: deriveMimeCategory(att.mimeType),
        sizeBytes: att.sizeBytes,
        scanStatus: att.scanStatus,
      })),
      mentionsCurrentUser: msg.mentionsCurrentUser ?? false,
    };
  }).filter(Boolean) as ConversationMessage[];
}

function deriveMimeCategory(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) return "document";
  return "other";
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
