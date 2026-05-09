"use client";

/**
 * MessagingReadingWorkspace — Sprint 1.2
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
  Paperclip,
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
} from "lucide-react";
import type { ActiveConversation, ConversationMessage, PresenceStatus } from "./types";
import {
  MOCK_MESSAGES_CHANNEL_FINANCE,
  MOCK_MESSAGES_DM_ARJUN,
  MOCK_MESSAGES_GROUP_Q2,
  MOCK_THREAD_REPLIES_CH_F_1,
} from "./mock-data";

// ─── Shared primitives ────────────────────────────────────────────────────────

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
      className="flex flex-col items-center justify-center h-full gap-4 px-10 text-center"
      data-testid="reading-workspace-no-selection"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
        <Icon className="h-7 w-7" style={{ color: "#C4C4C4" }} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold" style={{ color: "#49454F" }}>
          {heading}
        </p>
        <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#79747E" }}>
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
      className="flex flex-col items-center justify-center h-full gap-4 px-10 text-center"
      data-testid="reading-workspace-restricted"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
        <Lock className="h-7 w-7 text-amber-500" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold" style={{ color: "#49454F" }}>
          Access restricted
        </p>
        <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#79747E" }}>
          {conversation.restrictedReason ??
            "You don't have permission to view this conversation. Contact an admin if you believe this is an error."}
        </p>
      </div>
      <button
        type="button"
        className="rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        style={{ borderColor: "#E0E0E0", color: "#49454F" }}
      >
        Request access
      </button>
    </div>
  );
}

// ─── Workspace header ─────────────────────────────────────────────────────────

interface WorkspaceHeaderProps {
  conversation: ActiveConversation;
  threadOpen: boolean;
  onToggleThread: () => void;
}

function WorkspaceHeader({ conversation, threadOpen, onToggleThread }: WorkspaceHeaderProps) {
  const { kind, name, channelVisibility, dmParticipant, groupMemberCount } = conversation;

  const Icon =
    kind === "dm"
      ? MessageSquare
      : kind === "group"
      ? channelVisibility === "private" || conversation.groupMemberCount
        ? Lock
        : Users
      : channelVisibility === "private"
      ? Lock
      : Hash;

  const iconColor = kind === "dm" ? "#79747E" : "#79747E";

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
            {groupMemberCount} members
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
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Conversation info"
          title="Info"
        >
          <Info className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
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

// ─── Composer shell (static — no send in Phase 1) ─────────────────────────────

function ComposerShell({ placeholder }: { placeholder: string }) {
  return (
    <div
      className="shrink-0 border-t bg-white px-4 py-3"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="reading-workspace-composer"
    >
      <div
        className="flex flex-col rounded-xl border bg-white"
        style={{ borderColor: "#E0E0E0" }}
      >
        {/* Text area placeholder */}
        <div className="px-3 py-2.5 min-h-[2.5rem]">
          <p className="text-sm" style={{ color: "#C4C4C4" }}>
            {placeholder}
          </p>
        </div>
        {/* Toolbar */}
        <div
          className="flex items-center gap-1 border-t px-2 py-1.5"
          style={{ borderColor: "#F0F0F0" }}
        >
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="Attach file"
          >
            <Paperclip className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="Mention someone"
          >
            <AtSign className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="Add emoji"
          >
            <Smile className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="rounded-lg bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white opacity-40 cursor-not-allowed"
            disabled
            aria-label="Send message (not available in static preview)"
            title="Sending available in a later sprint"
          >
            Send
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-center" style={{ color: "#C4C4C4" }}>
        Message sending is not available in this preview sprint
      </p>
    </div>
  );
}

// ─── Attachment chip ──────────────────────────────────────────────────────────

function AttachmentChip({ name }: { name: string }) {
  const isSpreadsheet = name.endsWith(".xlsx") || name.endsWith(".csv");
  const Icon = isSpreadsheet ? FileSpreadsheet : FileText;
  return (
    <div
      className="mt-2 inline-flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs"
      style={{ borderColor: "#E8E8E8" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
      <span className="font-medium truncate max-w-[180px]" style={{ color: "#1C1B1F" }}>
        {name}
      </span>
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
}

function MessageRow({ message, isThreadAnchor, onOpenThread }: MessageRowProps) {
  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-2 transition-colors",
        isThreadAnchor ? "bg-red-50/60" : "hover:bg-gray-50/70"
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
          <span className="text-[10px]" style={{ color: "#79747E" }}>
            {formatTime(message.sentAt)}
          </span>
          {message.mentionsCurrentUser && <MentionBadge />}
        </div>

        {/* Message text */}
        <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "#1C1B1F" }}>
          {message.body}
        </p>

        {/* Attachment */}
        {message.attachmentRef && <AttachmentChip name={message.attachmentRef} />}

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

      {/* Hover actions — static shell */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 self-start mt-0.5">
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          aria-label="React to message"
        >
          <Smile className="h-3 w-3" style={{ color: "#79747E" }} />
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          aria-label="Reply in thread"
          onClick={() => onOpenThread(message.id)}
        >
          <MessageSquare className="h-3 w-3" style={{ color: "#79747E" }} />
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          aria-label="More message actions"
        >
          <MoreHorizontal className="h-3 w-3" style={{ color: "#79747E" }} />
        </button>
      </div>
    </div>
  );
}

// ─── Message feed ─────────────────────────────────────────────────────────────

interface MessageFeedProps {
  messages: ConversationMessage[];
  threadAnchorMessageId: string | null;
  onOpenThread: (msgId: string) => void;
}

function MessageFeed({ messages, threadAnchorMessageId, onOpenThread }: MessageFeedProps) {
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
        />
      ))}
      {/* Bottom padding so last message isn't flush against composer */}
      <div className="h-4" />
    </div>
  );
}

// ─── Thread panel (static shell) ─────────────────────────────────────────────

interface ThreadPanelProps {
  anchorMessage: ConversationMessage;
  replies: ConversationMessage[];
  onClose: () => void;
}

function ThreadPanel({ anchorMessage, replies, onClose }: ThreadPanelProps) {
  return (
    <div
      className="flex flex-col h-full w-80 shrink-0 border-l bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="thread-panel"
    >
      {/* Thread header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "#E0E0E0" }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: "#79747E" }} />
          <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>
            Thread
          </span>
          <span className="text-xs" style={{ color: "#79747E" }}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Close thread panel"
          onClick={onClose}
          data-testid="thread-panel-close"
        >
          <X className="h-4 w-4" style={{ color: "#79747E" }} />
        </button>
      </div>

      {/* Anchor message */}
      <div
        className="shrink-0 border-b px-4 py-3"
        style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
        data-testid="thread-anchor-message"
      >
        <div className="flex gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold" style={{ color: "#49454F" }}>
            {anchorMessage.authorInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold" style={{ color: "#1C1B1F" }}>
                {anchorMessage.authorName}
              </span>
              <span className="text-[10px]" style={{ color: "#79747E" }}>
                {formatTime(anchorMessage.sentAt)}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#49454F" }}>
              {anchorMessage.body}
            </p>
            {anchorMessage.attachmentRef && (
              <AttachmentChip name={anchorMessage.attachmentRef} />
            )}
          </div>
        </div>
      </div>

      {/* Thread replies */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-4 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </p>
        </div>
        {replies.map((reply) => (
          <div
            key={reply.id}
            className="flex gap-2.5 px-4 py-2 hover:bg-gray-50 transition-colors"
            data-testid={`thread-reply-${reply.id}`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold" style={{ color: "#49454F" }}>
              {reply.authorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold" style={{ color: "#1C1B1F" }}>
                  {reply.authorName}
                </span>
                <span className="text-[10px]" style={{ color: "#79747E" }}>
                  {formatTime(reply.sentAt)}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#1C1B1F" }}>
                {reply.body}
              </p>
              <ReactionChips reactions={reply.reactions} />
            </div>
          </div>
        ))}
        <div className="h-2" />
      </div>

      {/* Thread composer shell */}
      <div
        className="shrink-0 border-t px-3 py-2.5"
        style={{ borderColor: "#E0E0E0" }}
        data-testid="thread-composer"
      >
        <div
          className="flex items-center gap-2 rounded-lg border bg-[#f8f9fc] px-3 py-2"
          style={{ borderColor: "#E0E0E0" }}
        >
          <p className="flex-1 text-xs" style={{ color: "#C4C4C4" }}>
            Reply in thread…
          </p>
          <Paperclip className="h-3.5 w-3.5 shrink-0" style={{ color: "#C4C4C4" }} />
        </div>
      </div>
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
}: WorkspaceBodyProps) {
  const anchorMsg = threadAnchorMessageId
    ? MOCK_MESSAGES_CHANNEL_FINANCE.find((m) => m.id === threadAnchorMessageId) ?? null
    : null;

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="channel-workspace">
      {/* Main reading pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
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
          messages={MOCK_MESSAGES_CHANNEL_FINANCE}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
        />
        <ComposerShell placeholder={`Message #${conversation.name}`} />
      </div>

      {/* Thread panel */}
      {threadOpen && (anchorMsg ? (
        <ThreadPanel
          anchorMessage={anchorMsg}
          replies={MOCK_THREAD_REPLIES_CH_F_1}
          onClose={onCloseThread}
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
}: WorkspaceBodyProps) {
  return (
    <div className="flex flex-1 overflow-hidden" data-testid="dm-workspace">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
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
          messages={MOCK_MESSAGES_DM_ARJUN}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
        />
        <ComposerShell placeholder={`Message ${conversation.name}`} />
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
}: WorkspaceBodyProps) {
  const anchorMsg = threadAnchorMessageId
    ? MOCK_MESSAGES_GROUP_Q2.find((m) => m.id === threadAnchorMessageId) ?? null
    : null;

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="group-workspace">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <WorkspaceHeader
          conversation={conversation}
          threadOpen={threadOpen}
          onToggleThread={onToggleThread}
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
          messages={MOCK_MESSAGES_GROUP_Q2}
          threadAnchorMessageId={threadAnchorMessageId}
          onOpenThread={onOpenThread}
        />
        <ComposerShell placeholder={`Message ${conversation.name}`} />
      </div>
      {threadOpen && anchorMsg && (
        <ThreadPanel
          anchorMessage={anchorMsg}
          replies={MOCK_THREAD_REPLIES_CH_F_1.slice(0, 3)}
          onClose={onCloseThread}
        />
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
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MessagingReadingWorkspaceProps {
  conversation: ActiveConversation | null;
  sectionKind?: "channel" | "dm" | "group";
}

export function MessagingReadingWorkspace({
  conversation,
  sectionKind,
}: MessagingReadingWorkspaceProps) {
  const [threadAnchorMessageId, setThreadAnchorMessageId] = React.useState<string | null>(null);
  const [threadOpen, setThreadOpen] = React.useState(false);

  // Reset thread state when conversation changes
  React.useEffect(() => {
    setThreadOpen(false);
    setThreadAnchorMessageId(null);
  }, [conversation?.id]);

  function handleOpenThread(msgId: string) {
    setThreadAnchorMessageId(msgId);
    setThreadOpen(true);
  }

  function handleCloseThread() {
    setThreadOpen(false);
    setThreadAnchorMessageId(null);
  }

  function handleToggleThread() {
    if (threadOpen) {
      handleCloseThread();
    } else {
      // Open thread panel without a specific anchor (general thread view)
      setThreadOpen(true);
    }
  }

  if (!conversation) {
    return (
      <div
        className="flex flex-1 overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
        <NoConversationSelected kind={sectionKind} />
      </div>
    );
  }

  if (!conversation.isAccessible) {
    return (
      <div
        className="flex flex-1 overflow-hidden bg-white"
        data-testid="reading-workspace"
      >
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
  };

  return (
    <div
      className="flex flex-1 overflow-hidden bg-white"
      data-testid="reading-workspace"
    >
      {conversation.kind === "channel" && <ChannelWorkspace {...bodyProps} />}
      {conversation.kind === "dm" && <DMWorkspace {...bodyProps} />}
      {conversation.kind === "group" && <GroupWorkspace {...bodyProps} />}
    </div>
  );
}
