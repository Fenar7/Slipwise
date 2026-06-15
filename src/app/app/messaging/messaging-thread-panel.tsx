"use client";

/**
 * MessagingThreadPanel — Sprint 1.3
 *
 * First-class thread panel with:
 * - Thread header with reply count
 * - Anchor message with full context
 * - Thread replies with author attribution and timestamps
 * - Inline hover action bar (React, Reply, Edit, More)
 * - Edit mode state (inline composer replacing message body)
 * - Reaction chips (hovered, unhovered, current-user-reacted states)
 * - Thread reply composer shell
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  X,
  Smile,
  CornerUpRight,
  Pencil,
  MoreHorizontal,
  Paperclip,
  FileText,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import type { ConversationMessage, MessageReaction, EditState } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Attachment chip ──────────────────────────────────────────────────────────

function AttachmentChip({ name }: { name: string }) {
  const isSpreadsheet = name.endsWith(".xlsx") || name.endsWith(".csv");
  const Icon = isSpreadsheet ? FileSpreadsheet : FileText;
  return (
    <div
      className="mt-1.5 inline-flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs"
      style={{ borderColor: "#E8E8E8" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
      <span className="max-w-[160px] truncate font-medium" style={{ color: "#1C1B1F" }}>
        {name}
      </span>
    </div>
  );
}

// ─── Reaction chips ───────────────────────────────────────────────────────────

interface ReactionChipsProps {
  reactions: MessageReaction[];
  onToggle?: (emoji: string) => void;
}

function ReactionChips({ reactions, onToggle }: ReactionChipsProps) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" data-testid="reaction-chips">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle?.(r.emoji)}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]",
            r.reactedByCurrentUser
              ? "border-[#DC2626] bg-red-50 hover:bg-red-100"
              : "border-[#E8E8E8] bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
          )}
          aria-label={`${r.emoji} reaction, ${r.count} ${r.count === 1 ? "person" : "people"}${r.reactedByCurrentUser ? ", you reacted" : ""}`}
          aria-pressed={r.reactedByCurrentUser}
          data-testid={`reaction-chip-${r.emoji}`}
        >
          <span>{r.emoji}</span>
          <span
            className={cn(
              "font-semibold",
              r.reactedByCurrentUser ? "text-[#DC2626]" : ""
            )}
            style={r.reactedByCurrentUser ? undefined : { color: "#49454F" }}
          >
            {r.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Hover action bar ─────────────────────────────────────────────────────────

interface HoverActionsProps {
  messageId: string;
  onReact: () => void;
  onReply: () => void;
  onEdit: () => void;
  onMore: () => void;
}

function HoverActions({ messageId, onReact, onReply, onEdit, onMore }: HoverActionsProps) {
  return (
    <div
      className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-0.5 rounded-lg border bg-white shadow-sm"
      style={{ borderColor: "#E0E0E0" }}
      data-testid={`hover-actions-${messageId}`}
    >
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-l-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
        aria-label="React to message"
        onClick={onReact}
        data-testid={`hover-react-${messageId}`}
      >
        <Smile className="h-3 w-3" style={{ color: "#79747E" }} />
      </button>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
        aria-label="Reply in thread"
        onClick={onReply}
        data-testid={`hover-reply-${messageId}`}
      >
        <CornerUpRight className="h-3 w-3" style={{ color: "#79747E" }} />
      </button>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
        aria-label="Edit message"
        onClick={onEdit}
        data-testid={`hover-edit-${messageId}`}
      >
        <Pencil className="h-3 w-3" style={{ color: "#79747E" }} />
      </button>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-r-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
        aria-label="More message actions"
        onClick={onMore}
        data-testid={`hover-more-${messageId}`}
      >
        <MoreHorizontal className="h-3 w-3" style={{ color: "#79747E" }} />
      </button>
    </div>
  );
}

// ─── Inline edit composer ─────────────────────────────────────────────────────

interface InlineEditComposerProps {
  messageId: string;
  initialBody: string;
  onCancel: () => void;
  onSave: (newBody: string) => void;
}

function InlineEditComposer({
  messageId,
  initialBody,
  onCancel,
  onSave,
}: InlineEditComposerProps) {
  const [draft, setDraft] = React.useState(initialBody);

  return (
    <div
      className="mt-1 flex flex-col gap-2 rounded-xl border bg-white p-2"
      style={{ borderColor: "#E0E0E0" }}
      data-testid={`inline-edit-composer-${messageId}`}
    >
      <div
        role="textbox"
        aria-label="Edit message"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        className="min-h-[2rem] rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
        style={{ color: "#1C1B1F" }}
        data-testid={`inline-edit-input-${messageId}`}
        onInput={(e) => setDraft(e.currentTarget.textContent ?? "")}
      >
        {initialBody}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          onClick={onCancel}
          data-testid={`inline-edit-cancel-${messageId}`}
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1"
          onClick={() => onSave(draft)}
          data-testid={`inline-edit-save-${messageId}`}
        >
          <Check className="h-3 w-3" />
          Save changes
        </button>
      </div>
    </div>
  );
}

// ─── Thread reply row ─────────────────────────────────────────────────────────

interface ThreadReplyRowProps {
  reply: ConversationMessage;
  editState: EditState | null;
  onStartEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (messageId: string, newBody: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}

function ThreadReplyRow({
  reply,
  editState,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleReaction,
}: ThreadReplyRowProps) {
  const isEditing = editState?.messageId === reply.id;

  // reactions already include reactedByCurrentUser from the data
  const enrichedReactions: MessageReaction[] = reply.reactions.map((r) => ({ ...r }));

  return (
    <div
      className="group relative flex gap-2.5 px-4 py-2 transition-colors hover:bg-gray-50"
      data-testid={`thread-reply-${reply.id}`}
    >
      {/* Avatar */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold"
        style={{ color: "#49454F" }}
      >
        {reply.authorInitials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold" style={{ color: "#1C1B1F" }}>
            {reply.authorName}
          </span>
          {reply.authorRole !== "member" && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 capitalize">
              {reply.authorRole}
            </span>
          )}
          <span className="text-[10px]" style={{ color: "#79747E" }}>
            {formatTime(reply.sentAt)}
          </span>
        </div>

        {isEditing ? (
          <InlineEditComposer
            messageId={reply.id}
            initialBody={reply.body}
            onCancel={onCancelEdit}
            onSave={(newBody) => onSaveEdit(reply.id, newBody)}
          />
        ) : (
          <>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#1C1B1F" }}>
              {reply.body}
            </p>
            {reply.attachmentRef && <AttachmentChip name={reply.attachmentRef} />}
            <ReactionChips
              reactions={enrichedReactions}
              onToggle={(emoji) => onToggleReaction(reply.id, emoji)}
            />
          </>
        )}
      </div>

      {/* Hover actions */}
      {!isEditing && (
        <HoverActions
          messageId={reply.id}
          onReact={() => {}}
          onReply={() => {}}
          onEdit={() => onStartEdit(reply.id)}
          onMore={() => {}}
        />
      )}
    </div>
  );
}

// ─── Thread anchor message ────────────────────────────────────────────────────

function ThreadAnchorMessage({ message }: { message: ConversationMessage }) {
  return (
    <div
      className="shrink-0 border-b px-4 py-3"
      style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}
      data-testid="thread-anchor-message"
    >
      <div className="flex gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold"
          style={{ color: "#49454F" }}
        >
          {message.authorInitials}
        </div>
        <div className="flex-1 min-w-0">
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
          </div>
          <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "#1C1B1F" }}>
            {message.body}
          </p>
          {message.attachmentRef && <AttachmentChip name={message.attachmentRef} />}
          {message.reactions.length > 0 && (
            <ReactionChips
              reactions={message.reactions.map((r) => ({
                ...r,
                reactedByCurrentUser: false,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Thread reply composer ────────────────────────────────────────────────────

function ThreadReplyComposer() {
  return (
    <div
      className="shrink-0 border-t px-3 py-2.5"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="thread-composer"
    >
      <div
        className="flex items-center gap-2 rounded-xl border bg-[#f8f9fc] px-3 py-2 transition-shadow focus-within:shadow-sm focus-within:border-gray-300"
        style={{ borderColor: "#E0E0E0" }}
      >
        <div
          role="textbox"
          aria-label="Reply in thread"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className="flex-1 text-xs outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[#C4C4C4]"
          style={{ color: "#1C1B1F" }}
          data-placeholder="Reply in thread…"
          data-testid="thread-reply-input"
        />
        <Paperclip className="h-3.5 w-3.5 shrink-0" style={{ color: "#C4C4C4" }} />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface MessagingThreadPanelProps {
  anchorMessage: ConversationMessage;
  replies: ConversationMessage[];
  onClose: () => void;
}

export function MessagingThreadPanel({
  anchorMessage,
  replies,
  onClose,
}: MessagingThreadPanelProps) {
  const [editState, setEditState] = React.useState<EditState | null>(null);

  function handleStartEdit(messageId: string) {
    const msg = replies.find((r) => r.id === messageId);
    if (!msg) return;
    setEditState({ messageId, draftBody: msg.body });
  }

  function handleCancelEdit() {
    setEditState(null);
  }

  function handleSaveEdit(_messageId: string, _newBody: string) {
    // Phase 1: static — no persistence
    setEditState(null);
  }

  function handleToggleReaction(_messageId: string, _emoji: string) {
    // Phase 1: static — no persistence
  }

  return (
    <div
      className="flex flex-col h-full w-80 shrink-0 border-l bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="thread-panel"
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "#E0E0E0" }}
        data-testid="thread-panel-header"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: "#79747E" }} />
          <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>
            Thread
          </span>
          <span
            className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ color: "#79747E" }}
            data-testid="thread-reply-count"
          >
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
      <ThreadAnchorMessage message={anchorMessage} />

      {/* Replies divider */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-2"
        style={{ borderBottom: "1px solid #F0F0F0" }}
      >
        <div className="flex-1 h-px" style={{ background: "#F0F0F0" }} />
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: "#79747E" }}
        >
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </span>
        <div className="flex-1 h-px" style={{ background: "#F0F0F0" }} />
      </div>

      {/* Replies list */}
      <div className="flex-1 overflow-y-auto py-1" data-testid="thread-replies-list">
        {replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <MessageSquare className="h-6 w-6" style={{ color: "#C4C4C4" }} />
            <p className="text-xs" style={{ color: "#79747E" }}>
              No replies yet. Be the first to reply.
            </p>
          </div>
        ) : (
          replies.map((reply) => (
            <ThreadReplyRow
              key={reply.id}
              reply={reply}
              editState={editState}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
              onToggleReaction={handleToggleReaction}
            />
          ))
        )}
        <div className="h-2" />
      </div>

      {/* Reply composer */}
      <ThreadReplyComposer />
    </div>
  );
}
