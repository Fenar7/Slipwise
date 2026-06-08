"use client";

/**
 * MessagingReadingWorkspace — Sprint 1.3
 *
 * The main conversation reading area. Renders distinct workspace cues for
 * channels, DMs, and groups. Includes no-selection state, restricted state,
 * and a static thread-open direction shell.
 *
 * No realtime, no message sending, no persistence in Phase 1.
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  Hash,
  Lock,
  Users,
  MessageSquare,
  AtSign,
  MoreHorizontal,
  ChevronRight,
  X,
  Info,
  Bell,
  Pin,
  FileText,
  FileSpreadsheet,
  Smile,
  AlertTriangle,
  Loader2,
  Globe,
} from "lucide-react";
import type { ActiveConversation, ConversationMessage, MentionSuggestion, PresenceStatus } from "./types";
import { MessagingComposer } from "./messaging-composer";
import { MessagingThreadPanel, type ThreadReplyAttachmentPayload } from "./messaging-thread-panel";
import { MessagingChannelDetail } from "./messaging-channel-detail";
import { MessagingGroupDetail } from "./messaging-group-detail";
import { useOrgMembers } from "./lib/use-org-members";
import { MentionText } from "./messaging-mention-text";
import { MessagingMessageActions } from "./messaging-message-actions";
import { MessagingEmojiPicker } from "./messaging-emoji-picker";
import { useThreadReplies } from "./lib/use-thread-replies";
import type { ApiConversationDetail } from "./lib/mappers";
import {
  MOCK_MESSAGES_CHANNEL_GENERAL,
  MOCK_MESSAGES_CHANNEL_FINANCE,
  MOCK_MESSAGES_DM_ARJUN,
  MOCK_MESSAGES_DM_SNEHA,
  MOCK_MESSAGES_GROUP_Q2,
  MOCK_MESSAGES_GROUP_VENDOR,
  MOCK_THREAD_REPLIES_CH_F_1,
} from "./mock-data";

// ─── Shared primitives ────────────────────────────────────────────────────────

function DegradedBanner() {
  return (
    <div
      className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 shrink-0"
      style={{ borderColor: "#FCD34D" }}
      data-testid="workspace-degraded-banner"
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span className="text-xs text-amber-700">
        Connection interrupted. Messages may be delayed.
      </span>
      <button
        className="ml-auto text-xs font-semibold text-amber-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        aria-label="Retry connection"
      >
        Retry
      </button>
    </div>
  );
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-400",
        status === "offline" && "bg-gray-300"
      )}
      aria-label={status}
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
}

// ─── No-conversation-selected state ──────────────────────────────────────────

export function NoConversationSelected({ kind }: { kind?: "channel" | "dm" | "group" }) {
  const hints: Record<string, { icon: React.ElementType; heading: string; body: string }> = {
    channel: {
      icon: Hash,
      heading: "Select a channel",
      body: "Choose a channel from the list to read messages, share files, and coordinate with your team.",
    },
    dm: {
      icon: MessageSquare,
      heading: "Select a conversation",
      body: "Choose a direct message to continue a conversation or start a new one.",
    },
    group: {
      icon: Users,
      heading: "Select a group",
      body: "Choose a group to see the conversation and collaborate with your team.",
    },
  };

  const { icon: Icon, heading, body } = hints[kind ?? "channel"] ?? hints.channel;

  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-10 text-center"
      data-testid="reading-workspace-no-selection"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f8f9fc] border" style={{ borderColor: "#F0F0F0" }}>
        <Icon className="h-5 w-5" style={{ color: "#C4C4C4" }} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          {heading}
        </p>
        <p className="text-xs leading-relaxed max-w-[14rem]" style={{ color: "#79747E" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ─── Restricted state ─────────────────────────────────────────────────────────

function RestrictedWorkspace({ conversation }: { conversation: ActiveConversation }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-10 text-center"
      data-testid="reading-workspace-restricted"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 border border-amber-100">
        <Lock className="h-5 w-5 text-amber-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Access restricted
        </p>
        <p className="text-xs leading-relaxed max-w-[14rem]" style={{ color: "#79747E" }}>
          {conversation.restrictedReason ??
            "You don't have permission to view this conversation. Contact an admin if you believe this is an error."}
        </p>
      </div>
      <button
        type="button"
        className="rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        style={{ borderColor: "#E0E0E0", color: "#49454F" }}
      >
        Request access
      </button>
    </div>
  );
}

function ArchivedWorkspace({ conversation }: { conversation: ActiveConversation }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-10 text-center"
      data-testid="reading-workspace-archived"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 border border-gray-200">
        <Lock className="h-5 w-5 text-gray-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Archived conversation
        </p>
        <p className="text-xs leading-relaxed max-w-[14rem]" style={{ color: "#79747E" }}>
          This conversation was archived on{" "}
          {conversation.archivedAt
            ? new Date(conversation.archivedAt).toLocaleDateString()
            : "an unknown date"}
          .
        </p>
      </div>
    </div>
  );
}

function LockedWorkspace({ conversation }: { conversation: ActiveConversation }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-10 text-center"
      data-testid="reading-workspace-locked"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 border border-gray-200">
        <Lock className="h-5 w-5 text-gray-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Locked conversation
        </p>
        <p className="text-xs leading-relaxed max-w-[14rem]" style={{ color: "#79747E" }}>
          This conversation was locked on{" "}
          {conversation.lockedAt
            ? new Date(conversation.lockedAt).toLocaleDateString()
            : "an unknown date"}
          . Only admins can post.
        </p>
      </div>
    </div>
  );
}

// ─── Workspace header ─────────────────────────────────────────────────────────

interface WorkspaceHeaderProps {
  conversation: ActiveConversation;
  threadOpen: boolean;
  onToggleThread: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

function WorkspaceHeader({ conversation, threadOpen, onToggleThread, detailOpen, onToggleDetail }: WorkspaceHeaderProps) {
  const { kind, name, channelVisibility, dmParticipant, groupMemberCount } = conversation;
  const isPrivateGroup = kind === "group" && conversation.groupIsPrivate;

  const Icon =
    kind === "dm"
      ? MessageSquare
      : kind === "group"
      ? isPrivateGroup
        ? Lock
        : Users
      : kind === "portal"
      ? Globe
      : channelVisibility === "private"
      ? Lock
      : Hash;

  const iconColor = kind === "portal" ? "#059669" : "#79747E";

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="reading-workspace-header"
    >
      {/* Identity */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        {kind === "dm" && dmParticipant ? (
          <div className="relative shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold" style={{ color: "#49454F" }}>
              {dmParticipant.avatarInitials}
            </div>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white",
                dmParticipant.presence === "online" && "bg-emerald-500",
                dmParticipant.presence === "away" && "bg-amber-400",
                dmParticipant.presence === "offline" && "bg-gray-300"
              )}
              aria-hidden="true"
            />
          </div>
        ) : (
          <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
        )}
        <div className="min-w-0">
          <span className="text-sm font-bold truncate block" style={{ color: "#1C1B1F" }}>
            {kind === "channel" ? `#${name}` : name}
          </span>
        </div>
        {kind === "channel" && channelVisibility === "private" && (
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#79747E]">
            Private
          </span>
        )}
        {kind === "group" && (
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#79747E]">
            {isPrivateGroup ? "Private group" : "Group"} · {groupMemberCount} members
          </span>
        )}
        {kind === "portal" && conversation.portalState && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              conversation.portalState === "OPEN" && "bg-emerald-100 text-emerald-800",
              conversation.portalState === "WAITING_ON_INTERNAL" && "bg-blue-100 text-blue-800",
              conversation.portalState === "WAITING_ON_CLIENT" && "bg-amber-100 text-amber-800",
              conversation.portalState === "CLOSED" && "bg-gray-100 text-gray-800"
            )}
            data-testid="header-portal-state"
          >
            {conversation.portalState}
          </span>
        )}
        {kind === "dm" && dmParticipant && (
          <PresenceDot status={dmParticipant.presence} />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Pinned messages"
          title="Pinned messages"
        >
          <Pin className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
        </button>
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
            threadOpen ? "bg-red-50 text-[#DC2626]" : "hover:bg-gray-100"
          )}
          aria-label={threadOpen ? "Close thread panel" : "Open thread panel"}
          title="Threads"
          onClick={onToggleThread}
          data-testid="thread-panel-toggle"
        >
          <MessageSquare
            className={cn("h-3.5 w-3.5", threadOpen ? "text-[#DC2626]" : "")}
            style={threadOpen ? undefined : { color: "#79747E" }}
          />
        </button>
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
            detailOpen ? "bg-red-50 text-[#DC2626]" : "hover:bg-gray-100"
          )}
          aria-label="Conversation info"
          aria-pressed={detailOpen}
          title="Info"
          onClick={onToggleDetail}
          data-testid="header-toggle-detail"
        >
          <Info
            className={cn("h-3.5 w-3.5", detailOpen ? "text-[#DC2626]" : "")}
            style={detailOpen ? undefined : { color: "#79747E" }}
          />
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="More options"
        >
          <MoreHorizontal className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
        </button>
      </div>
    </header>
  );
}

// ─── Attachment chip ──────────────────────────────────────────────────────────

interface AttachmentChipProps {
  name: string;
  attachmentId?: string;
  onDownload?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
  scanStatus?: string;
}

function AttachmentChip({ name, attachmentId, onDownload, scanStatus }: AttachmentChipProps) {
  const [downloadError, setDownloadError] = React.useState(false);
  const isSpreadsheet = name.endsWith(".xlsx") || name.endsWith(".csv");
  const isBlocked = scanStatus === "BLOCKED";
  const Icon = isSpreadsheet ? FileSpreadsheet : FileText;

  async function handleClick() {
    if (!attachmentId || !onDownload) return;
    setDownloadError(false);
    const result = await onDownload(attachmentId);
    if (!result) {
      setDownloadError(true);
      return;
    }
    window.open(result.signedUrl, "_blank");
  }

  return (
    <div className="mt-2 inline-flex items-center gap-2">
      {isBlocked ? (
        <span
          className="inline-flex items-center gap-1 rounded-lg border bg-red-50 px-2.5 py-1.5 text-xs"
          style={{ borderColor: "#FECACA" }}
          title="This attachment was blocked by security scan"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />
          <span className="text-red-700">Blocked attachment</span>
        </span>
      ) : scanStatus === "PENDING" ? (
        <span
          className="inline-flex items-center gap-1 rounded-lg border bg-amber-50 px-2.5 py-1.5 text-xs"
          style={{ borderColor: "#FDE68A" }}
        >
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600" />
          <span className="text-amber-700">Scanning…</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={downloadError ? "opacity-60" : "hover:bg-gray-100"}
          style={{ border: "none" }}
        >
          <div
            className="inline-flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs hover:bg-gray-100 transition-colors"
            style={{ borderColor: "#E8E8E8" }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
            <span className="font-medium truncate max-w-[180px]" style={{ color: "#1C1B1F" }}>
              {name}
            </span>
          </div>
        </button>
      )}
      {downloadError && (
        <span className="text-[10px] text-red-600">Access denied</span>
      )}
    </div>
  );
}

// ─── Reaction chips ───────────────────────────────────────────────────────────

function ReactionChips({ reactions }: { reactions: ConversationMessage["reactions"] }) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reactions.map((r) => (
        <span
          key={r.emoji}
          className="inline-flex items-center gap-1 rounded-full border bg-gray-50 px-1.5 py-0.5 text-xs"
          style={{ borderColor: "#E8E8E8" }}
        >
          <span>{r.emoji}</span>
          <span className="font-medium" style={{ color: "#49454F" }}>{r.count}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Thread reply cue ─────────────────────────────────────────────────────────

interface ThreadCueProps {
  replyCount: number;
  onOpen: () => void;
  isAnchor: boolean;
}

function ThreadCue({ replyCount, onOpen, isAnchor }: ThreadCueProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
        isAnchor
          ? "bg-red-50 text-[#DC2626] border border-red-100"
          : "text-[#DC2626] hover:bg-red-50"
      )}
      aria-label={`View thread — ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
      data-testid="thread-cue-button"
    >
      <MessageSquare className="h-3 w-3" />
      <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
      <ChevronRight className="h-3 w-3 ml-0.5" />
    </button>
  );
}

// ─── Mention badge ────────────────────────────────────────────────────────────

function MentionBadge() {
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold text-white"
      aria-label="You are mentioned"
    >
      @you
    </span>
  );
}

// ─── Date divider ─────────────────────────────────────────────────────────────

function DateDivider({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 h-px" style={{ background: "#F0F0F0" }} />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
        {formatDate(iso)}
      </span>
      <div className="flex-1 h-px" style={{ background: "#F0F0F0" }} />
    </div>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: ConversationMessage;
  isThreadAnchor: boolean;
  onOpenThread: (msgId: string) => void;
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
  onCreateTaskFromMessage?: (messageId: string, messageBody: string) => void;
  canSend?: boolean;
}

function MessageRow({ message, isThreadAnchor, onOpenThread, onDownloadAttachment, onCreateTaskFromMessage, canSend }: MessageRowProps) {
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-2 transition-colors",
        message.audience === "INTERNAL_ONLY"
          ? "bg-amber-50/60 border-l-4 border-amber-400 hover:bg-amber-100/50"
          : isThreadAnchor
          ? "bg-red-50/60"
          : "hover:bg-gray-50/70"
      )}
      data-testid={`message-row-${message.id}`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold"
          style={{ color: "#49454F" }}
        >
          {message.authorInitials}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Author + time */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: "#1C1B1F" }}>
            {message.authorName}
          </span>
          {message.authorRole !== "member" && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 capitalize">
              {message.authorRole}
            </span>
          )}
          {message.audience === "INTERNAL_ONLY" && (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800 uppercase tracking-wide">
              Internal Note
            </span>
          )}
          <span className="text-[10px]" style={{ color: "#79747E" }}>
            {formatTime(message.sentAt)}
          </span>
          {message.mentionsCurrentUser && <MentionBadge />}
        </div>

        {/* Message text */}
        <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "#1C1B1F" }}>
          <MentionText text={message.body} />
        </p>

        {/* Attachment */}
        {message.attachmentRecords && message.attachmentRecords.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.attachmentRecords.map((att) => (
              <AttachmentChip
                key={att.id}
                name={att.name}
                attachmentId={att.id}
                onDownload={onDownloadAttachment ?? undefined}
                scanStatus={att.scanStatus}
              />
            ))}
          </div>
        )}

        {/* Reactions */}
        <ReactionChips reactions={message.reactions} />

        {/* Thread cue */}
        {message.hasThread && (
          <ThreadCue
            replyCount={message.threadReplyCount}
            onOpen={() => onOpenThread(message.id)}
            isAnchor={isThreadAnchor}
          />
        )}
      </div>

      {/* Hover actions */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 self-start mt-0.5 relative">
        <div className="relative">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="React to message"
            onClick={() => setEmojiOpen((o) => !o)}
            data-testid="msg-action-react-btn"
          >
            <Smile className="h-3 w-3" style={{ color: "#79747E" }} />
          </button>
          {emojiOpen && (
            <div className="absolute right-0 top-7">
              <MessagingEmojiPicker onClose={() => setEmojiOpen(false)} />
            </div>
          )}
        </div>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          aria-label="Reply in thread"
          onClick={() => onOpenThread(message.id)}
        >
          <MessageSquare className="h-3 w-3" style={{ color: "#79747E" }} />
        </button>
        <div className="relative">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="More message actions"
            onClick={() => setActionsOpen((o) => !o)}
            data-testid="msg-action-more-btn"
          >
            <MoreHorizontal className="h-3 w-3" style={{ color: "#79747E" }} />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 top-7">
              <MessagingMessageActions
                onClose={() => setActionsOpen(false)}
                onCreateTask={
                  canSend !== false && onCreateTaskFromMessage
                    ? () => onCreateTaskFromMessage(message.id, message.body)
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Message feed ─────────────────────────────────────────────────────────────

interface MessageFeedProps {
  messages: ConversationMessage[];
  threadAnchorMessageId: string | null;
  onOpenThread: (msgId: string) => void;
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
  onCreateTaskFromMessage?: (messageId: string, messageBody: string) => void;
  canSend?: boolean;
}

function MessageFeed({ messages, threadAnchorMessageId, onOpenThread, onDownloadAttachment, onCreateTaskFromMessage, canSend }: MessageFeedProps) {
  const feedRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom on mount (simulates arriving at latest messages)
  React.useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={feedRef}
      className="flex-1 overflow-y-auto"
      data-testid="message-feed"
    >
      <DateDivider iso={messages[0]?.sentAt ?? new Date().toISOString()} />
      {messages.map((msg) => (
        <MessageRow
          key={msg.id}
          message={msg}
          isThreadAnchor={threadAnchorMessageId === msg.id}
          onOpenThread={onOpenThread}
          onDownloadAttachment={onDownloadAttachment}
          onCreateTaskFromMessage={onCreateTaskFromMessage}
          canSend={canSend}
        />
      ))}
      {/* Bottom padding so last message isn't flush against composer */}
      <div className="h-4" />
    </div>
  );
}

// ─── Channel workspace ────────────────────────────────────────────────────────

function ChannelWorkspace({
  conversation,
  threadOpen,
  threadAnchorMessageId,
  onOpenThread,
  onCloseThread,
  onToggleThread,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  messages: externalMessages,
  canSend,
  sending,
  sendError,
  onSend,
  onReply,
  sendingReply,
  replyError,
  threadReplies: externalThreadReplies,
  detail,
  onRefreshDetail,
  participants,
  onDownloadAttachment,
  onCreateTaskFromMessage,
}: WorkspaceBodyProps) {
  const channelMessages = externalMessages ?? [];
  const anchorMsg = threadAnchorMessageId
    ? channelMessages.find((m) => m.id === threadAnchorMessageId) ?? null
    : null;
  const threadReplies = externalThreadReplies ?? [];

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="channel-workspace">
      {/* Main reading pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
          detailOpen={detailOpen}
          onToggleDetail={onToggleDetail}
        />
        {/* Channel context bar */}
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
          data-testid="channel-context-bar"
        >
          <Hash className="h-3 w-3 shrink-0" style={{ color: "#79747E" }} />
          <p className="text-xs truncate" style={{ color: "#79747E" }}>
            {conversation.subtitle}
          </p>
        </div>
        <MessageFeed
          messages={channelMessages}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
          onDownloadAttachment={onDownloadAttachment}
          onCreateTaskFromMessage={onCreateTaskFromMessage}
          canSend={canSend}
        />
        <MessagingComposer placeholder={`Message #${conversation.name}`} isAccessible={canSend} onSend={onSend} sending={sending} sendError={sendError} conversationId={conversation.id} participants={participants} />
      </div>

      {/* Thread panel */}
      {threadOpen && (anchorMsg ? (
          <MessagingThreadPanel
            anchorMessage={anchorMsg}
            replies={threadReplies}
            onClose={onCloseThread}
            onReply={onReply && detail && threadAnchorMessageId
              ? (body, attachments) => {
                  const threadId = detail.threads.find((thread) => thread.anchorMessageId === threadAnchorMessageId)?.id ?? threadAnchorMessageId;
                  const attPayloads = attachments?.map(a => ({ storageRef: a.storageRef, uploadToken: a.uploadToken, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes }));
                  return onReply(threadId, body, attPayloads?.length ? ({ attachments: attPayloads, mentions: undefined }) : undefined);
                }
              : undefined}
            sendingReply={sendingReply}
            replyError={replyError}
          />
        ) : (
        <div
          className="flex flex-col h-full w-80 shrink-0 border-l bg-white overflow-hidden"
          style={{ borderColor: "#E0E0E0" }}
          data-testid="thread-panel"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: "#E0E0E0" }}>
            <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>Thread</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              aria-label="Close thread panel"
              onClick={onCloseThread}
              data-testid="thread-panel-close"
            >
              <X className="h-4 w-4" style={{ color: "#79747E" }} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-xs text-center" style={{ color: "#79747E" }}>
              Select a message thread to view replies here.
            </p>
          </div>
        </div>
      ))}

      {/* Detail panel */}
      {detailOpen && (
        <MessagingChannelDetail conversation={conversation} onClose={onCloseDetail} detail={detail} onRefresh={onRefreshDetail} />
      )}
    </div>
  );
}

// ─── DM workspace ─────────────────────────────────────────────────────────────

function DMWorkspace({
  conversation,
  threadOpen,
  threadAnchorMessageId,
  onOpenThread,
  onCloseThread,
  onToggleThread,
  detailOpen,
  onToggleDetail,
  messages: externalMessages,
  canSend,
  sending,
  sendError,
  onSend,
  onReply,
  sendingReply,
  replyError,
  participants,
  onDownloadAttachment,
  onCreateTaskFromMessage,
}: WorkspaceBodyProps) {
  const dmMessages = externalMessages ?? [];
  return (
    <div className="flex flex-1 overflow-hidden" data-testid="dm-workspace">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
          detailOpen={detailOpen}
          onToggleDetail={onToggleDetail}
        />
        {/* DM context bar — person-focused */}
        {conversation.dmParticipant && (
          <div
            className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
            style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
            data-testid="dm-context-bar"
          >
            <div className="relative shrink-0">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold" style={{ color: "#49454F" }}>
                {conversation.dmParticipant.avatarInitials}
              </div>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-white",
                  conversation.dmParticipant.presence === "online" && "bg-emerald-500",
                  conversation.dmParticipant.presence === "away" && "bg-amber-400",
                  conversation.dmParticipant.presence === "offline" && "bg-gray-300"
                )}
                aria-hidden="true"
              />
            </div>
            <p className="text-xs" style={{ color: "#79747E" }}>
              {conversation.subtitle}
            </p>
          </div>
        )}
        <MessageFeed
          messages={dmMessages}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
          onDownloadAttachment={onDownloadAttachment}
          onCreateTaskFromMessage={onCreateTaskFromMessage}
          canSend={canSend}
        />
        <MessagingComposer placeholder={`Message ${conversation.name}`} isAccessible={canSend} onSend={onSend} sending={sending} sendError={sendError} conversationId={conversation.id} participants={participants} />
      </div>
      {threadOpen && (
        <div
          className="flex flex-col items-center justify-center w-80 shrink-0 border-l"
          style={{ borderColor: "#E0E0E0" }}
          data-testid="thread-panel"
        >
          <div className="flex h-12 w-full shrink-0 items-center justify-between border-b px-4" style={{ borderColor: "#E0E0E0" }}>
            <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>Thread</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              aria-label="Close thread panel"
              onClick={onCloseThread}
              data-testid="thread-panel-close"
            >
              <X className="h-4 w-4" style={{ color: "#79747E" }} />
            </button>
          </div>
          <p className="text-xs px-4 text-center" style={{ color: "#79747E" }}>
            DM threads are not yet active in this preview sprint.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Group workspace ──────────────────────────────────────────────────────────

function GroupWorkspace({
  conversation,
  threadOpen,
  threadAnchorMessageId,
  onOpenThread,
  onCloseThread,
  onToggleThread,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  messages: externalMessages,
  canSend,
  sending,
  sendError,
  onSend,
  onReply,
  sendingReply,
  replyError,
  threadReplies: externalThreadReplies,
  detail,
  onRefreshDetail,
  participants,
  onDownloadAttachment,
  onCreateTaskFromMessage,
}: WorkspaceBodyProps) {
  const groupMessages = externalMessages ?? [];
  const anchorMsg = threadAnchorMessageId
    ? groupMessages.find((m) => m.id === threadAnchorMessageId) ?? null
    : null;
  const threadReplies = externalThreadReplies ?? [];

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="group-workspace">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
          detailOpen={detailOpen}
          onToggleDetail={onToggleDetail}
        />
        {/* Group context bar */}
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
          data-testid="group-context-bar"
        >
          <Users className="h-3 w-3 shrink-0" style={{ color: "#79747E" }} />
          <p className="text-xs truncate" style={{ color: "#79747E" }}>
            {conversation.subtitle}
          </p>
        </div>
        <MessageFeed
          messages={groupMessages}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
          onDownloadAttachment={onDownloadAttachment}
          onCreateTaskFromMessage={onCreateTaskFromMessage}
          canSend={canSend}
        />
        <MessagingComposer placeholder={`Message ${conversation.name}`} isAccessible={canSend} onSend={onSend} sending={sending} sendError={sendError} conversationId={conversation.id} participants={participants} />
      </div>
      {threadOpen && anchorMsg && (
        <MessagingThreadPanel
          anchorMessage={anchorMsg}
          replies={threadReplies}
          onClose={onCloseThread}
          onReply={onReply && detail && threadAnchorMessageId
            ? (body) => {
                const threadId = detail.threads.find((thread) => thread.anchorMessageId === threadAnchorMessageId)?.id ?? threadAnchorMessageId;
                return onReply(threadId, body);
              }
            : undefined}
          sendingReply={sendingReply}
          replyError={replyError}
        />
      )}
      {detailOpen && (
        <MessagingGroupDetail conversation={conversation} onClose={onCloseDetail} detail={detail} onRefresh={onRefreshDetail} />
      )}
    </div>
  );
}

// ─── Portal workspace ──────────────────────────────────────────────────────────

interface MessagingPortalDetailProps {
  conversation: ActiveConversation;
  onClose: () => void;
  detail: ApiConversationDetail | null;
  onRefresh: () => void;
}

function MessagingPortalDetail({ conversation, onClose, detail, onRefresh }: MessagingPortalDetailProps) {
  const { members, loading: loadingMembers } = useOrgMembers();
  const [updating, setUpdating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currentPortalState = detail?.portalState ?? conversation.portalState ?? "OPEN";
  const currentAssigneeId = detail?.assigneeId ?? conversation.assigneeId ?? null;

  async function handleStateChange(newState: string) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalState: newState }),
      });
      if (!res.ok) {
        throw new Error("Failed to update portal state");
      }
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleAssigneeChange(newAssigneeId: string | null) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: newAssigneeId || null }),
      });
      if (!res.ok) {
        throw new Error("Failed to update assignee");
      }
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      className="flex flex-col h-full w-80 shrink-0 border-l bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="portal-detail-panel"
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: "#E0E0E0" }}>
        <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>Portal Info</span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Close details panel"
          onClick={onClose}
          data-testid="portal-detail-close"
        >
          <X className="h-4 w-4" style={{ color: "#79747E" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700" data-testid="portal-detail-error">
            {error}
          </div>
        )}

        {/* Client identity & Context */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Client Info</h4>
          <div className="rounded-lg border p-3 bg-gray-50 space-y-1.5" style={{ borderColor: "#E8E8E8" }}>
            <div>
              <span className="text-[10px] text-gray-400 block font-semibold">CLIENT NAME</span>
              <span className="text-xs font-bold text-[#1C1B1F]">{detail?.name ?? conversation.name ?? "Portal Client"}</span>
            </div>
            {detail?.linkedRecordType && (
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold">LINKED CONTEXT</span>
                <span className="text-xs text-[#1C1B1F] font-mono">
                  {detail.linkedRecordType}: {detail.linkedRecordId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* State Control */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Lifecycle State</h4>
          <div className="relative">
            <select
              value={currentPortalState}
              disabled={updating}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-500"
              style={{ borderColor: "#E8E8E8" }}
              data-testid="portal-state-select"
            >
              <option value="OPEN">OPEN</option>
              <option value="WAITING_ON_INTERNAL">WAITING_ON_INTERNAL</option>
              <option value="WAITING_ON_CLIENT">WAITING_ON_CLIENT</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        {/* Assignment Control */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Owner Assignee</h4>
          <div className="relative">
            {loadingMembers ? (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC2626]" />
                Loading team members…
              </div>
            ) : (
              <select
                value={currentAssigneeId ?? ""}
                disabled={updating}
                onChange={(e) => handleAssigneeChange(e.target.value || null)}
                className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-500"
                style={{ borderColor: "#E8E8E8" }}
                data-testid="portal-assignee-select"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.orgRole})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalWorkspace({
  conversation,
  threadOpen,
  threadAnchorMessageId,
  onOpenThread,
  onCloseThread,
  onToggleThread,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  messages: externalMessages,
  canSend,
  sending,
  sendError,
  onSend,
  onReply,
  sendingReply,
  replyError,
  threadReplies: externalThreadReplies,
  detail,
  onRefreshDetail,
  participants,
  onDownloadAttachment,
  onCreateTaskFromMessage,
}: WorkspaceBodyProps) {
  const portalMessages = externalMessages ?? [];
  const anchorMsg = threadAnchorMessageId
    ? portalMessages.find((m) => m.id === threadAnchorMessageId) ?? null
    : null;
  const threadReplies = externalThreadReplies ?? [];

  const portalState = detail?.portalState ?? conversation.portalState ?? "OPEN";
  const isClosed = portalState === "CLOSED";

  const [reopening, setReopening] = React.useState(false);
  const [reopenError, setReopenError] = React.useState<string | null>(null);

  async function handleReopen() {
    setReopening(true);
    setReopenError(null);
    try {
      const res = await fetch(`/api/messaging/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalState: "OPEN" }),
      });
      if (!res.ok) {
        throw new Error("Failed to reopen conversation");
      }
      if (onRefreshDetail) {
        onRefreshDetail();
      }
    } catch (e: any) {
      setReopenError(e.message);
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="portal-workspace">
      {/* Main reading pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
          detailOpen={detailOpen}
          onToggleDetail={onToggleDetail}
        />
        {/* Portal context bar */}
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
          data-testid="portal-context-bar"
        >
          <Globe className="h-3 w-3 shrink-0 text-emerald-600" />
          <p className="text-xs truncate font-medium text-gray-600">
            Portal Conversation with {detail?.name ?? conversation.name ?? "Portal Customer"}
            {detail?.linkedRecordType && ` · Linked ${detail.linkedRecordType}: ${detail.linkedRecordId}`}
          </p>
        </div>

        <MessageFeed
          messages={portalMessages}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
          onDownloadAttachment={onDownloadAttachment}
          onCreateTaskFromMessage={onCreateTaskFromMessage}
          canSend={canSend && !isClosed}
        />

        {isClosed ? (
          <div
            className="border-t bg-gray-50 px-4 py-3 flex items-center justify-between gap-4"
            style={{ borderColor: "#E0E0E0" }}
            data-testid="portal-closed-banner"
          >
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-700">This portal conversation is closed</span>
              <span className="text-[10px] text-gray-500">Clients and operators cannot send new messages while closed.</span>
              {reopenError && <span className="text-[10px] text-red-600 mt-1">{reopenError}</span>}
            </div>
            <button
              type="button"
              disabled={reopening}
              onClick={handleReopen}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              data-testid="portal-reopen-button"
            >
              {reopening ? "Reopening…" : "Reopen"}
            </button>
          </div>
        ) : (
          <MessagingComposer
            placeholder={`Reply to ${detail?.name ?? conversation.name ?? "client"} or write internal note...`}
            isAccessible={canSend}
            onSend={onSend}
            sending={sending}
            sendError={sendError}
            conversationId={conversation.id}
            participants={participants}
            isPortal={true}
          />
        )}
      </div>

      {/* Thread panel */}
      {threadOpen && (anchorMsg ? (
          <MessagingThreadPanel
            anchorMessage={anchorMsg}
            replies={threadReplies}
            onClose={onCloseThread}
            onReply={onReply && detail && threadAnchorMessageId
              ? (body, attachments) => {
                  const threadId = detail.threads.find((thread) => thread.anchorMessageId === threadAnchorMessageId)?.id ?? threadAnchorMessageId;
                  const attPayloads = attachments?.map(a => ({ storageRef: a.storageRef, uploadToken: a.uploadToken, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes }));
                  return onReply(threadId, body, attPayloads?.length ? ({ attachments: attPayloads, mentions: undefined }) : undefined);
                }
              : undefined}
            sendingReply={sendingReply}
            replyError={replyError}
          />
        ) : (
        <div
          className="flex flex-col h-full w-80 shrink-0 border-l bg-white overflow-hidden"
          style={{ borderColor: "#E0E0E0" }}
          data-testid="thread-panel"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: "#E0E0E0" }}>
            <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>Thread</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              aria-label="Close thread panel"
              onClick={onCloseThread}
              data-testid="thread-panel-close"
            >
              <X className="h-4 w-4" style={{ color: "#79747E" }} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-xs text-center" style={{ color: "#79747E" }}>
              Select a message thread to view replies here.
            </p>
          </div>
        </div>
      ))}

      {/* Detail panel */}
      {detailOpen && (
        <MessagingPortalDetail conversation={conversation} onClose={onCloseDetail} detail={detail} onRefresh={onRefreshDetail} />
      )}
    </div>
  );
}

// ─── WorkspaceBodyProps ───────────────────────────────────────────────────────

interface WorkspaceBodyProps {
  conversation: ActiveConversation;
  threadOpen: boolean;
  threadAnchorMessageId: string | null;
  onOpenThread: (msgId: string) => void;
  onCloseThread: () => void;
  onToggleThread: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onCloseDetail: () => void;
  messages?: ConversationMessage[];
  canSend?: boolean;
  sending?: boolean;
  sendError?: string | null;
  onSend?: (
    body: string,
    options?: {
      mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>;
      attachments?: Array<{ storageRef: string; fileName: string; mimeType: string; sizeBytes: number }>;
      audience?: "EXTERNAL_VISIBLE" | "INTERNAL_ONLY";
    },
  ) => Promise<{ id: string } | null>;
  onReply?: (
    threadId: string,
    body: string,
    options?: { mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>; attachments?: Array<{ storageRef: string; uploadToken: string; fileName: string; mimeType: string; sizeBytes: number }> },
  ) => Promise<{ id: string } | null>;
  sendingReply?: boolean;
  replyError?: string | null;
  threadReplies?: ConversationMessage[];
  detail?: ApiConversationDetail | null;
  onRefreshDetail?: () => void;
  participants?: MentionSuggestion[];
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => void;
  onDelete?: (messageId: string) => void;
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
  onCreateTaskFromMessage?: (messageId: string, messageBody: string) => void;
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MessagingReadingWorkspaceProps {
  conversation: ActiveConversation | null;
  sectionKind?: "channel" | "dm" | "group" | "portal";
  initialThreadAnchorMessageId?: string | null;
  degraded?: boolean;
  messages?: ConversationMessage[];
  canSend?: boolean;
  sending?: boolean;
  sendError?: string | null;
  onSend?: (
    body: string,
    options?: {
      mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>;
      attachments?: Array<{ storageRef: string; fileName: string; mimeType: string; sizeBytes: number }>;
      audience?: "EXTERNAL_VISIBLE" | "INTERNAL_ONLY";
    },
  ) => Promise<{ id: string } | null>;
  onReply?: (
    threadId: string,
    body: string,
    options?: { mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>; attachments?: Array<{ storageRef: string; uploadToken: string; fileName: string; mimeType: string; sizeBytes: number }> },
  ) => Promise<{ id: string } | null>;
  sendingReply?: boolean;
  replyError?: string | null;
  detail?: ApiConversationDetail | null;
  onRefreshDetail?: () => void;
  participants?: MentionSuggestion[];
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
  onCreateTaskFromMessage?: (messageId: string, messageBody: string) => void;
  pendingPortalParams?: {
    customerId: string;
    linkedRecordType?: string | null;
    linkedRecordId?: string | null;
  } | null;
  onCreatePortalFromPrompt?: () => void;
  creatingPortalFromPrompt?: boolean;
}

export function MessagingReadingWorkspace({
  conversation,
  sectionKind,
  initialThreadAnchorMessageId,
  degraded,
  messages: externalMessages,
  canSend = true,
  sending = false,
  sendError,
  onSend,
  onReply,
  sendingReply = false,
  replyError,
  detail,
  onRefreshDetail,
  participants,
  onDownloadAttachment,
  onCreateTaskFromMessage,
  pendingPortalParams,
  onCreatePortalFromPrompt,
  creatingPortalFromPrompt,
}: MessagingReadingWorkspaceProps) {
  const [threadAnchorMessageId, setThreadAnchorMessageId] = React.useState<string | null>(null);
  const [threadOpen, setThreadOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const resolvedMessages = React.useMemo(() => {
    if (externalMessages) return externalMessages;
    const id = conversation?.id;
    if (!id) return [];
    if (conversation.kind === "channel") {
      return id === "ch-finance" ? MOCK_MESSAGES_CHANNEL_FINANCE : MOCK_MESSAGES_CHANNEL_GENERAL;
    } else if (conversation.kind === "dm") {
      return id === "dm-1" ? MOCK_MESSAGES_DM_ARJUN : MOCK_MESSAGES_DM_SNEHA;
    } else if (conversation.kind === "group") {
      return id === "grp-q2-close" ? MOCK_MESSAGES_GROUP_Q2 : MOCK_MESSAGES_GROUP_VENDOR;
    }
    return [];
  }, [externalMessages, conversation]);

  const activeThreadId = React.useMemo(() => {
    if (!detail || !threadAnchorMessageId) return null;
    return detail.threads.find((thread) => thread.anchorMessageId === threadAnchorMessageId)?.id ?? null;
  }, [detail, threadAnchorMessageId]);

  // Sprint 5.2: live thread replies via dedicated backend endpoint.
  const { replies: liveThreadReplies } = useThreadReplies(
    conversation?.id ?? null,
    activeThreadId,
    detail ?? null,
  );

  const resolvedThreadReplies = React.useMemo(() => {
    if (detail) return liveThreadReplies;
    if (threadAnchorMessageId === "msg-ch-f-1") {
      return MOCK_THREAD_REPLIES_CH_F_1;
    }
    return [];
  }, [liveThreadReplies, detail, threadAnchorMessageId]);

  // Reset thread and detail state when conversation changes
  React.useEffect(() => {
    setThreadOpen(false);
    setThreadAnchorMessageId(null);
    setDetailOpen(false);
  }, [conversation?.id]);

  // Sprint 6.2: open thread from task detail navigation
  React.useEffect(() => {
    if (initialThreadAnchorMessageId) {
      setThreadAnchorMessageId(initialThreadAnchorMessageId);
      setThreadOpen(true);
      setDetailOpen(false);
    }
  }, [initialThreadAnchorMessageId]);

  function handleOpenThread(msgId: string) {
    setThreadAnchorMessageId(msgId);
    setThreadOpen(true);
    setDetailOpen(false);
  }

  function handleCloseThread() {
    setThreadOpen(false);
    setThreadAnchorMessageId(null);
  }

  function handleToggleThread() {
    if (threadOpen) {
      handleCloseThread();
    } else {
      setThreadOpen(true);
      setDetailOpen(false);
    }
  }

  if (!conversation) {
    if (pendingPortalParams) {
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-5 px-10 text-center bg-white"
          data-testid="portal-create-prompt"
        >
          {degraded && <DegradedBanner />}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100">
            <Globe className="h-5 w-5 text-emerald-600 animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
              No portal conversation exists for this customer
            </p>
            <p className="text-xs leading-relaxed max-w-[16rem]" style={{ color: "#79747E" }}>
              Start a new secure conversation context for customer <strong>{pendingPortalParams.customerId}</strong>
              {pendingPortalParams.linkedRecordType && (
                <span> linked to <strong>{pendingPortalParams.linkedRecordType} ({pendingPortalParams.linkedRecordId})</strong></span>
              )}
              .
            </p>
          </div>
          <button
            type="button"
            disabled={creatingPortalFromPrompt}
            onClick={onCreatePortalFromPrompt}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 cursor-pointer"
            data-testid="portal-create-prompt-button"
          >
            {creatingPortalFromPrompt ? "Creating…" : "Start Portal Conversation"}
          </button>
        </div>
      );
    }

    return (
      <div
        className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
        {degraded && <DegradedBanner />}
        <NoConversationSelected kind={sectionKind} />
      </div>
    );
  }

  if (conversation.archivedAt) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
        {degraded && <DegradedBanner />}
        <ArchivedWorkspace conversation={conversation} />
      </div>
    );
  }

  if (conversation.lockedAt) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
        {degraded && <DegradedBanner />}
        <LockedWorkspace conversation={conversation} />
      </div>
    );
  }

  if (!conversation.isAccessible) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
        {degraded && <DegradedBanner />}
        <RestrictedWorkspace conversation={conversation} />
      </div>
    );
  }

  const bodyProps: WorkspaceBodyProps = {
    conversation,
    threadOpen,
    threadAnchorMessageId,
    onOpenThread: handleOpenThread,
    onCloseThread: handleCloseThread,
    onToggleThread: handleToggleThread,
    detailOpen,
    onToggleDetail: () => {
      setDetailOpen((o) => {
        if (!o) {
          setThreadOpen(false);
          setThreadAnchorMessageId(null);
        }
        return !o;
      });
    },
    onCloseDetail: () => setDetailOpen(false),
    messages: resolvedMessages,
    canSend,
    sending,
    sendError,
    onSend,
    onReply,
    sendingReply,
    replyError,
    threadReplies: resolvedThreadReplies,
    detail,
    onRefreshDetail,
    participants,
    onDownloadAttachment,
    onCreateTaskFromMessage,
  };

  return (
    <div
      className="flex flex-1 overflow-hidden bg-white"
      data-testid="reading-workspace"
    >
        {degraded && <DegradedBanner />}
      {conversation.kind === "channel" && <ChannelWorkspace {...bodyProps} />}
      {conversation.kind === "dm" && <DMWorkspace {...bodyProps} />}
      {conversation.kind === "group" && <GroupWorkspace {...bodyProps} />}
      {conversation.kind === "portal" && <PortalWorkspace {...bodyProps} />}
    </div>
  );
}
