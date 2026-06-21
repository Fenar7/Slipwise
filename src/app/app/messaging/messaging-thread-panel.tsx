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
 * - Thread reply composer with real attachment staging/upload/removal (Sprint 5.5)
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
  Image,
  Check,
  AlertTriangle,
  Loader2,
  Download,
} from "lucide-react";
import type { ConversationMessage, MessageReaction, EditState } from "./types";
import { useAttachmentUpload, type UploadedAttachment } from "./lib/use-attachment-upload";
import { MentionText } from "./messaging-mention-text";
import { FormattingToolbar, applyComposerFormat } from "./messaging-formatting-toolbar";
import { FilePreviewModal, type FilePreviewAttachment } from "./components/file-preview-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Attachment chips for thread replies ──────────────────────────────────────

function ThreadReplyAttachmentChip({ attachment, onRemove }: { attachment: UploadedAttachment; onRemove?: () => void }) {
  const isSpreadsheet = attachment.mimeType?.includes("spreadsheet") || attachment.mimeType?.includes("excel") || attachment.mimeType === "text/csv";
  const Icon = isSpreadsheet ? FileSpreadsheet : FileText;
  return (
    <div
      className="mt-1.5 inline-flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs"
      style={{ borderColor: "#E8E8E8" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
      <span className="max-w-[140px] truncate font-medium" style={{ color: "#1C1B1F" }}>
        {attachment.fileName}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-gray-200"
          aria-label={`Remove ${attachment.fileName}`}
        >
          <X className="h-3 w-3 text-[#79747E]" />
        </button>
      )}
    </div>
  );
}

// ─── Failure chip ─────────────────────────────────────────────────────────────

function UploadFailureChip({ fileName, message, onDismiss }: { fileName: string; message: string; onDismiss?: () => void }) {
  return (
    <div className="mt-1.5 inline-flex items-center gap-2 rounded-lg border bg-red-50 px-2.5 py-1.5 text-xs" style={{ borderColor: "#FECACA" }}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
      <span className="text-red-700 truncate max-w-[160px]" title={message}>{fileName} – {message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="ml-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-red-100">
          <X className="h-3 w-3 text-red-500" />
        </button>
      )}
    </div>
  );
}

// ─── Attachment chip (for anchor/reply messages) ──────────────────────────────

interface AttachmentChipProps {
  name: string;
  mimeType?: string;
  attachmentId?: string;
  sizeBytes?: number;
  scanStatus?: string;
  onDownload?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
}

function AttachmentChip({ name, mimeType, attachmentId, sizeBytes, scanStatus, onDownload }: AttachmentChipProps) {
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [urlLoading, setUrlLoading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const isImage = mimeType?.startsWith("image/") ?? false;
  const isSpreadsheet = name.endsWith(".xlsx") || name.endsWith(".csv");
  const isBlocked = scanStatus === "BLOCKED";
  const Icon = isImage ? Image : isSpreadsheet ? FileSpreadsheet : FileText;

  React.useEffect(() => {
    if (!isImage || !attachmentId || !onDownload || isBlocked || scanStatus === "PENDING") return;
    let cancelled = false;
    onDownload(attachmentId).then((result) => {
      if (!cancelled && result?.signedUrl) setSignedUrl(result.signedUrl);
    });
    return () => { cancelled = true; };
  }, [isImage, attachmentId, onDownload, isBlocked, scanStatus]);

  async function ensureSignedUrl(): Promise<string | null> {
    if (signedUrl) return signedUrl;
    if (!attachmentId || !onDownload) return null;
    setUrlLoading(true);
    setDownloadError(false);
    try {
      const result = await onDownload(attachmentId);
      if (result?.signedUrl) {
        setSignedUrl(result.signedUrl);
        return result.signedUrl;
      }
      setDownloadError(true);
      return null;
    } catch {
      setDownloadError(true);
      return null;
    } finally {
      setUrlLoading(false);
    }
  }

  function triggerAnchorDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleCardClick() {
    if (isBlocked || scanStatus === "PENDING" || urlLoading) return;
    const url = await ensureSignedUrl();
    if (url) setPreviewOpen(true);
  }

  async function handleDownloadClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (urlLoading) return;
    const url = await ensureSignedUrl();
    if (url) triggerAnchorDownload(url, name);
  }

  const modalAttachment: FilePreviewAttachment | null = signedUrl ? {
    name,
    mimeType: mimeType ?? "application/octet-stream",
    sizeBytes: sizeBytes ?? 0,
    signedUrl,
  } : null;

  return (
    <div className="mt-1.5 inline-flex flex-col gap-1">
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
      ) : isImage && signedUrl ? (
        <div className="group relative inline-block" style={{ maxWidth: "260px" }}>
          <button
            type="button"
            onClick={handleCardClick}
            className="block rounded-xl overflow-hidden border hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E8E8E8" }}
            title={`Preview ${name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={name}
              className="block max-h-40 w-auto object-contain bg-gray-50"
              style={{ maxWidth: "260px" }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-white truncate block">{name}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={handleDownloadClick}
            className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`Download ${name}`}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-0">
          <button
            type="button"
            onClick={handleCardClick}
            disabled={urlLoading}
            className={cn(
              "rounded-l-lg border bg-gray-50 px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
              urlLoading ? "opacity-60 cursor-wait" : "hover:bg-gray-100 cursor-pointer"
            )}
            style={{ borderColor: "#E8E8E8", borderRightWidth: 0 }}
            title={`Preview ${name}`}
          >
            <span className="inline-flex items-center gap-2">
              {urlLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#79747E]" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
              )}
              <span className="max-w-[130px] truncate font-medium" style={{ color: "#1C1B1F" }}>
                {name}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={urlLoading}
            className="rounded-r-lg border bg-gray-50 px-2 py-1.5 text-xs transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E8E8E8" }}
            aria-label={`Download ${name}`}
            title="Download"
          >
            {urlLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#79747E]" />
            ) : (
              <Download className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
            )}
          </button>
        </div>
      )}
      {downloadError && (
        <span className="text-[10px] text-red-600">Access denied</span>
      )}
      {modalAttachment && (
        <FilePreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          attachment={modalAttachment}
          onDownload={(url) => triggerAnchorDownload(url, name)}
        />
      )}
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
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
}

function ThreadReplyRow({
  reply,
  editState,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleReaction,
  onReact,
  onReply,
  onDownloadAttachment,
}: ThreadReplyRowProps) {
  const isEditing = editState?.messageId === reply.id;
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [showActions, setShowActions] = React.useState(false);

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
            <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "#1C1B1F" }}>
              <MentionText text={reply.body} />
            </div>
            {reply.attachmentRecords && reply.attachmentRecords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {reply.attachmentRecords.map((att) => (
                <AttachmentChip
                  key={att.id}
                  name={att.name}
                  mimeType={att.mimeType}
                  attachmentId={att.id}
                  sizeBytes={att.sizeBytes}
                  scanStatus={att.scanStatus}
                  onDownload={onDownloadAttachment}
                />
              ))}
            </div>
          )}
            <ReactionChips
              reactions={enrichedReactions}
              onToggle={(emoji) => onToggleReaction(reply.id, emoji)}
            />
          </>
        )}
      </div>

      {/* Hover actions */}
      {!isEditing && (
        <div className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-0.5 rounded-lg border bg-white shadow-sm"
          style={{ borderColor: "#E0E0E0" }}
          data-testid={`thread-reply-hover-actions-${reply.id}`}
        >
          <div className="relative">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-l-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
              aria-label="React to reply"
              onClick={() => setShowEmojiPicker((o) => !o)}
              data-testid={`thread-reply-react-btn-${reply.id}`}
            >
              <Smile className="h-3 w-3" style={{ color: "#79747E" }} />
            </button>
            {showEmojiPicker && (
              <div className="absolute right-0 top-7 z-10">
                <MessagingEmojiPicker
                  onClose={() => setShowEmojiPicker(false)}
                  onSelect={(emoji) => {
                    onReact?.(reply.id, emoji);
                    setShowEmojiPicker(false);
                  }}
                />
              </div>
            )}
          </div>
          {onReply && (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
              aria-label="Reply to message"
              onClick={() => onReply(reply.id)}
              data-testid={`thread-reply-reply-btn-${reply.id}`}
            >
              <CornerUpRight className="h-3 w-3" style={{ color: "#79747E" }} />
            </button>
          )}
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="Edit reply"
            onClick={() => onStartEdit(reply.id)}
            data-testid={`thread-reply-edit-btn-${reply.id}`}
          >
            <Pencil className="h-3 w-3" style={{ color: "#79747E" }} />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-r-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="More actions"
            onClick={() => setShowActions((o) => !o)}
            data-testid={`thread-reply-more-btn-${reply.id}`}
          >
            <MoreHorizontal className="h-3 w-3" style={{ color: "#79747E" }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Thread anchor message ────────────────────────────────────────────────────

function ThreadAnchorMessage({ message, onDownloadAttachment }: { message: ConversationMessage; onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null> }) {
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
          <div className="mt-0.5 text-sm leading-relaxed" style={{ color: "#1C1B1F" }}>
            <MentionText text={message.body} />
          </div>
          {message.attachmentRecords && message.attachmentRecords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {message.attachmentRecords.map((att) => (
                <AttachmentChip
                  key={att.id}
                  name={att.name}
                  mimeType={att.mimeType}
                  attachmentId={att.id}
                  sizeBytes={att.sizeBytes}
                  scanStatus={att.scanStatus}
                  onDownload={onDownloadAttachment}
                />
              ))}
            </div>
          )}
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

export interface ThreadReplyAttachmentPayload {
  storageRef: string;
  uploadToken: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

interface ThreadReplyComposerProps {
  onReply?: (body: string, attachments?: ThreadReplyAttachmentPayload[]) => void;
  sendingReply?: boolean;
}

function ThreadReplyComposer({ onReply, sendingReply = false }: ThreadReplyComposerProps) {
  const {
    stagedFiles,
    uploading,
    failures,
    upload,
    removeStaged,
    clearFailures,
    clearAll,
    error: uploadError,
  } = useAttachmentUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = React.useState("");

  const handleFileSelect = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await upload(files[i]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [upload]);

  const handleSend = React.useCallback(() => {
    const body = replyText.trim() || editorRef.current?.textContent?.trim() || "";
    if (!body && stagedFiles.length === 0) return;
    const attachments: ThreadReplyAttachmentPayload[] = stagedFiles.map((f) => ({
      storageRef: f.storageRef,
      uploadToken: f.uploadToken,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    }));
    if (attachments.length > 0) {
      onReply?.(body || "", attachments);
    } else {
      onReply?.(body || "");
    }
    if (editorRef.current) editorRef.current.textContent = "";
    setReplyText("");
    clearAll();
  }, [replyText, stagedFiles, onReply, clearAll]);

  function applyFormat(type: string) {
    applyComposerFormat(type, editorRef, setReplyText);
  }

  return (
    <div
      className="shrink-0 border-t px-3 py-2.5"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="thread-composer"
    >
      {/* Staged attachments */}
      {stagedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1" data-testid="thread-composer-staged">
          {stagedFiles.map((att) => (
            <ThreadReplyAttachmentChip
              key={att.storageRef}
              attachment={att}
              onRemove={() => removeStaged(att.storageRef)}
            />
          ))}
        </div>
      )}

      {/* Upload failures */}
      {failures.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1" data-testid="thread-composer-failures">
          {failures.map((f, i) => (
            <UploadFailureChip
              key={i}
              fileName={f.fileName}
              message={f.message}
              onDismiss={() => clearFailures()}
            />
          ))}
        </div>
      )}

      {/* Upload error banner */}
      {uploadError && (
        <div className="mb-2 text-[11px] text-red-600" data-testid="thread-composer-upload-error">
          {uploadError}
        </div>
      )}

      <div
        className="flex flex-col rounded-xl border bg-[#f8f9fc] transition-shadow focus-within:shadow-sm focus-within:border-gray-300"
        style={{ borderColor: "#E0E0E0" }}
      >
        <FormattingToolbar onFormat={applyFormat} testId="thread-formatting-toolbar" />
        <div className="flex items-center gap-2 px-3 py-2">
          <div
            ref={editorRef}
            role="textbox"
            aria-label="Reply in thread"
            aria-multiline="true"
            contentEditable={!sendingReply}
            suppressContentEditableWarning
            className="flex-1 text-xs outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[#C4C4C4]"
            style={{ color: "#1C1B1F" }}
            data-placeholder={sendingReply ? "Sending…" : "Reply in thread…"}
            data-testid="thread-reply-input"
            onInput={(e) => {
              const text = (e.target as HTMLElement).textContent ?? "";
              setReplyText(text);
              if (editorRef.current && editorRef.current.textContent !== text) {
                editorRef.current.textContent = text;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingReply || uploading}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
            aria-label="Attach file"
            data-testid="thread-attach-button"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#C4C4C4" }} />
            ) : (
              <Paperclip className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            multiple
            data-testid="thread-file-input"
            onChange={handleFileSelect}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface MessagingThreadPanelProps {
  anchorMessage: ConversationMessage;
  replies: ConversationMessage[];
  onClose: () => void;
  /** Live reply handler — accepts body + attachments payload (Sprint 5.5) */
  onReply?: (body: string, attachments?: ThreadReplyAttachmentPayload[]) => void;
  /** Whether a reply is currently being sent */
  sendingReply?: boolean;
  /** Error from last reply attempt */
  replyError?: string | null;
  /** Whether replies are being loaded */
  loadingReplies?: boolean;
  /** Handler for reacting to a thread reply */
  onReactToReply?: (messageId: string, emoji: string) => void;
  /** Download handler for attachments — enables image previews and file downloads in thread */
  onDownloadAttachment?: (attachmentId: string) => Promise<{ signedUrl: string } | null>;
}

export function MessagingThreadPanel({
  anchorMessage,
  replies,
  onClose,
  onReply,
  sendingReply = false,
  replyError,
  loadingReplies = false,
  onReactToReply,
  onDownloadAttachment,
}: MessagingThreadPanelProps) {
  const [editState, setEditState] = React.useState<EditState | null>(null);
  const repliesEndRef = React.useRef<HTMLDivElement>(null);
  const prevReplyCountRef = React.useRef(replies.length);

  function handleStartEdit(messageId: string) {
    const msg = replies.find((r) => r.id === messageId);
    if (!msg) return;
    setEditState({ messageId, draftBody: msg.body });
  }

  function handleCancelEdit() {
    setEditState(null);
  }

  function handleSaveEdit(_messageId: string, _newBody: string) {
    setEditState(null);
  }

  function handleToggleReaction(_messageId: string, _emoji: string) {
    // Phase 1: static — no persistence
  }

  // Auto-scroll to bottom when new replies arrive
  React.useEffect(() => {
    if (replies.length > prevReplyCountRef.current) {
      repliesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
    prevReplyCountRef.current = replies.length;
  }, [replies.length]);

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
      <ThreadAnchorMessage message={anchorMessage} onDownloadAttachment={onDownloadAttachment} />

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
        {loadingReplies && replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#C4C4C4" }} />
            <p className="text-xs" style={{ color: "#79747E" }}>
              Loading replies…
            </p>
          </div>
        ) : replies.length === 0 ? (
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
              onReact={onReactToReply}
              onReply={undefined}
              onDownloadAttachment={onDownloadAttachment}
            />
          ))
        )}
        <div ref={repliesEndRef} className="h-2" />
      </div>

      {/* Error banner */}
      {replyError && (
        <div className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-2" data-testid="thread-reply-error">
          <p className="text-[11px] text-red-600">{replyError}</p>
        </div>
      )}

      {/* Reply composer */}
      <ThreadReplyComposer onReply={onReply} sendingReply={sendingReply} />
    </div>
  );
}
