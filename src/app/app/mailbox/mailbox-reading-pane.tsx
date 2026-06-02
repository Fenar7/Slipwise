"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  Flag,
  MoreHorizontal,
  Paperclip,
  ChevronDown,
  ChevronUp,
  UserCircle2,
  Download,
  FileText,
  FileSpreadsheet,
  File,
  PanelRightOpen,
  Eye,
  Loader2,
} from "lucide-react";
import { sanitizeMessageHtml } from "@/lib/mailbox/sanitize-message-html";
import type { MailboxThreadDetail, MailboxMessageItem, MailboxAttachmentSummary } from "./types";

// ─── Attachment chip ─────────────────────────────────────────────────────────

function attachmentIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return File;
}

function isPreviewableMimeType(mimeType: string): boolean {
  const previewable = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
  ];
  return previewable.includes(mimeType);
}

function AttachmentChip({
  attachment,
  onPreview,
}: {
  attachment: MailboxAttachmentSummary;
  onPreview?: (attachment: MailboxAttachmentSummary) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const Icon = attachmentIcon(attachment.mimeType);
  const canPreview = isPreviewableMimeType(attachment.mimeType);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/mailbox/attachments/message/${attachment.id}/download`);
      if (!res.ok) {
        console.error("Download failed", res.status);
        return;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { signedUrl?: string; error?: string };
        if (json.signedUrl) {
          window.open(json.signedUrl, "_blank");
        } else {
          console.error("Download error:", json.error);
        }
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloading(false);
    }
  }, [attachment.id, attachment.filename]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-3 py-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-[#0F172A]">{attachment.filename}</p>
        <p className="text-[10px] text-[#94A3B8]">{attachment.sizeLabel}</p>
      </div>
      {canPreview && onPreview && (
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#E2E5EA] hover:text-[#0F172A]"
          title={`Preview ${attachment.filename}`}
          aria-label={`Preview ${attachment.filename}`}
          onClick={() => onPreview(attachment)}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#E2E5EA] hover:text-[#0F172A] disabled:opacity-50"
        title={`Download ${attachment.filename}`}
        aria-label={`Download ${attachment.filename}`}
        disabled={downloading}
        onClick={handleDownload}
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── Preview Modal ──────────────────────────────────────────────────────────

function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: MailboxAttachmentSummary;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = attachment.mimeType.startsWith("image/");
  const isPdf = attachment.mimeType === "application/pdf";

  const handleDownloadInstead = useCallback(async () => {
    try {
      const res = await fetch(`/api/mailbox/attachments/message/${attachment.id}/download`);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { signedUrl?: string };
        if (json.signedUrl) window.open(json.signedUrl, "_blank");
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    }
  }, [attachment]);

  const isPreviewUnsupported = !isImage && !isPdf;
  const isBlockedMime = attachment.mimeType.startsWith("application/x-")
    || attachment.mimeType.startsWith("text/x-");

  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);
      try {
        const res = await fetch(`/api/mailbox/attachments/message/${attachment.id}/download`);
        if (!res.ok) {
          if (!cancelled) setError(`Preview failed (${res.status})`);
          return;
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = (await res.json()) as { signedUrl?: string; error?: string };
          if (!cancelled) {
            if (json.signedUrl) {
              setPreviewUrl(json.signedUrl);
            } else {
              setError(json.error ?? "Preview unavailable");
            }
          }
        } else {
          const blob = await res.blob();
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            setPreviewUrl(url);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [attachment.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.filename}`}
    >
      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#0F172A]">{attachment.filename}</p>
            <p className="text-xs text-[#94A3B8]">{attachment.sizeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-[#E2E5EA] px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
              onClick={handleDownloadInstead}
              aria-label="Download instead"
            >
              Download
            </button>
            <button
              className="rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
              onClick={onClose}
              aria-label="Close preview"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {isBlockedMime ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-[#64748B]">Preview unavailable for this file type</p>
              <button
                className="rounded-lg border border-[#E2E5EA] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
                onClick={handleDownloadInstead}
              >
                Download file
              </button>
            </div>
          ) : isPreviewUnsupported ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-[#64748B]">Preview unavailable for this file type</p>
              <button
                className="rounded-lg border border-[#E2E5EA] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
                onClick={handleDownloadInstead}
              >
                Download file
              </button>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-[#DC2626]">{error}</p>
              <button
                className="rounded-lg border border-[#E2E5EA] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F7F8FB]"
                onClick={handleDownloadInstead}
              >
                Download instead
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#64748B]" />
            </div>
          ) : previewUrl && isImage ? (
            <img
              src={previewUrl}
              alt={attachment.filename}
              className="max-h-[70vh] max-w-full rounded object-contain"
              onError={() => setError("Failed to load preview")}
            />
          ) : previewUrl && isPdf ? (
            <iframe
              src={previewUrl}
              className="h-[70vh] w-full rounded"
              title={attachment.filename}
              onError={() => setError("Failed to load preview")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Message item ─────────────────────────────────────────────────────────────

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeRenderableHtmlText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MessageItem({
  message,
  onReply,
  onPreviewAttachment,
}: {
  message: MailboxMessageItem;
  onReply?: (mode: "reply" | "reply-all" | "forward") => void;
  onPreviewAttachment?: (attachment: MailboxAttachmentSummary) => void;
}) {
  const [collapsed, setCollapsed] = useState(message.isCollapsed);
  const isOutbound = message.direction === "outbound";
  const safeHtml = sanitizeMessageHtml(message.bodyHtml);
  const hasRenderableHtml = normalizeRenderableHtmlText(safeHtml).length > 0;
  const hasTextFallback = !!message.bodyText?.trim();

  return (
    <article
      className={cn(
        "rounded-xl border transition-colors",
        isOutbound ? "border-[#E2E5EA] bg-white" : "border-[#E2E5EA] bg-white"
      )}
      data-message-id={message.id}
      data-direction={message.direction}
    >
      {/* Message header — always visible */}
      <button
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand message" : "Collapse message"}
      >
        {/* Sender avatar */}
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: message.fromColor }}
          aria-hidden="true"
        >
          {message.fromInitial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0F172A]">{message.from}</span>
            {isOutbound && (
              <span className="rounded bg-[#F1F3F7] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B]">
                Sent
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11px] text-[#94A3B8]">
              {formatSentAt(message.sentAt)}
            </span>
          </div>
          {collapsed ? (
            <p className="mt-0.5 truncate text-xs text-[#64748B]">
              {message.to.join(", ")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[#64748B]">
              <span className="font-medium text-[#334155]">To:</span>{" "}
              {message.to.join(", ")}
              {message.cc && message.cc.length > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-[#334155]">Cc:</span>{" "}
                  {message.cc.join(", ")}
                </>
              )}
            </p>
          )}
        </div>

        {/* Collapse toggle */}
        <span className="mt-1 shrink-0 text-[#94A3B8]">
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Message body — only when expanded */}
      {!collapsed && (
        <>
          {hasRenderableHtml ? (
            <div
              className="mailbox-message-body border-t px-4 py-4 text-sm leading-relaxed text-[#334155]"
              style={{ borderColor: "#F1F3F7" }}
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : hasTextFallback ? (
            <div
              className="mailbox-message-body whitespace-pre-wrap break-words border-t px-4 py-4 text-sm leading-relaxed text-[#334155]"
              style={{ borderColor: "#F1F3F7" }}
            >
              {message.bodyText}
            </div>
          ) : (
            <div
              className="mailbox-message-body border-t px-4 py-4 text-sm leading-relaxed text-[#94A3B8]"
              style={{ borderColor: "#F1F3F7" }}
            >
              Message body unavailable.
            </div>
          )}

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div
              className="border-t px-4 py-3"
              style={{ borderColor: "#F1F3F7" }}
              aria-label="Attachments"
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                {message.attachments.length} attachment{message.attachments.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} />
                ))}
              </div>
            </div>
          )}

          {/* Inline reply affordance */}
          <div
            className="border-t px-4 py-3"
            style={{ borderColor: "#F1F3F7" }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => onReply?.("reply")}
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
                aria-label="Reply to this message"
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>
              <button
                onClick={() => onReply?.("reply-all")}
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
                aria-label="Reply all"
              >
                <ReplyAll className="h-3.5 w-3.5" />
                Reply all
              </button>
              <button
                onClick={() => onReply?.("forward")}
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
                aria-label="Forward"
              >
                <Forward className="h-3.5 w-3.5" />
                Forward
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

// ─── Thread header ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  closed: "bg-gray-100 text-gray-500 border-gray-200",
  archived: "bg-gray-100 text-gray-400 border-gray-200",
};

import type { ThreadAction } from "./use-thread-action";

function ThreadHeader({
  detail,
  onOpenContext,
  isActionLoading,
  onAction,
  allowThreadActions = true,
}: {
  detail: MailboxThreadDetail;
  onOpenContext?: () => void;
  isActionLoading: boolean;
  onAction: (action: ThreadAction) => void;
  allowThreadActions?: boolean;
}) {
  const isArchived = detail.status === "archived";
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b bg-white px-5 py-3"
      style={{ borderColor: "#E2E5EA" }}
    >
      {/* Subject + actions */}
      <div className="flex items-start gap-3">
        <h2 className="flex-1 text-base font-bold leading-snug text-[#0F172A]">
          {detail.subject}
        </h2>
        {allowThreadActions ? (
        <div className="flex shrink-0 items-center gap-1">
          {onOpenContext && (
            <button
              onClick={onOpenContext}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] xl:hidden"
              title="View thread context"
              aria-label="View thread context"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] disabled:opacity-50"
            title={isArchived ? "Unarchive thread" : "Archive thread"}
            aria-label={isArchived ? "Unarchive thread" : "Archive thread"}
            disabled={isActionLoading}
            onClick={() => onAction(isArchived ? "unarchive" : "archive")}
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50",
              detail.isFlagged
                ? "text-[#DC2626] hover:bg-red-50"
                : "text-[#64748B] hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            )}
            title={detail.isFlagged ? "Unflag thread" : "Flag thread"}
            aria-label={detail.isFlagged ? "Unflag thread" : "Flag thread"}
            disabled={isActionLoading}
            onClick={() => onAction(detail.isFlagged ? "unflag" : "flag")}
          >
            <Flag className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-red-50 hover:text-[#DC2626] disabled:opacity-50"
            title="Delete thread"
            aria-label="Delete thread"
            disabled={isActionLoading}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A] disabled:opacity-50"
            title="More thread actions"
            aria-label="More thread actions"
            disabled={isActionLoading}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        ) : null}
      </div>

      {/* Meta row: mailbox source, status, assignee, participants, attachments */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Mailbox source */}
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: `${detail.mailboxColor}18`,
            color: detail.mailboxColor,
          }}
        >
          {detail.mailboxLabel}
        </span>

        {/* Status */}
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
            STATUS_STYLES[detail.status]
          )}
        >
          {detail.status}
        </span>

        {/* Assignee */}
        {detail.assignee && (
          <span className="flex items-center gap-1 text-[#64748B]">
            <UserCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium">{detail.assignee}</span>
          </span>
        )}

        {/* Participants */}
        <span className="text-[#94A3B8]">{detail.participantsSummary}</span>

        {/* Attachment count */}
        {detail.totalAttachments > 0 && (
          <span className="flex items-center gap-1 text-[#94A3B8]">
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            {detail.totalAttachments} attachment{detail.totalAttachments !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Reading pane ─────────────────────────────────────────────────────────────

import { InlineReply } from "./mailbox-inline-reply";
import type { MailboxComposerState, ComposeMode } from "./types";

interface MailboxReadingPaneProps {
  detail: MailboxThreadDetail;
  composerState: MailboxComposerState | null;
  onOpenReply: (mode: ComposeMode, threadId: string, messageId: string, subject: string, to: string[]) => void;
  onCloseReply: () => void;
  onDiscardReply: () => void;
  onExpandReply: () => void;
  onSendReply: () => void;
  onPatchComposer: (patch: Partial<MailboxComposerState>) => void;
  onOpenContext?: () => void;
  isActionLoading: boolean;
  onThreadAction: (action: ThreadAction) => void;
  allowReplies?: boolean;
  allowThreadActions?: boolean;
}

export function MailboxReadingPane({
  detail,
  composerState,
  onOpenReply,
  onCloseReply,
  onDiscardReply,
  onExpandReply,
  onSendReply,
  onPatchComposer,
  onOpenContext,
  isActionLoading,
  onThreadAction,
  allowReplies = true,
  allowThreadActions = true,
}: MailboxReadingPaneProps) {
  const [previewAttachment, setPreviewAttachment] = useState<MailboxAttachmentSummary | null>(null);
  const lastMessage = detail.messages[detail.messages.length - 1];

  const handleOpenReply = (mode: ComposeMode) => {
    const to = mode === "forward" ? [] : lastMessage.to;
    onOpenReply(mode, detail.threadId, lastMessage.id, detail.subject, to);
  };

  const showInlineReply =
    composerState?.isOpen &&
    composerState.layout !== "expanded" &&
    composerState.threadId === detail.threadId;

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[#F7F8FB]"
      data-testid="mailbox-reading-pane-active"
      aria-label={`Thread: ${detail.subject}`}
    >
      {/* Thread header */}
      <ThreadHeader
        detail={detail}
        onOpenContext={onOpenContext}
        isActionLoading={isActionLoading}
        onAction={onThreadAction}
        allowThreadActions={allowThreadActions}
      />

      {/* Message stack + inline reply */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {detail.messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onReply={allowReplies ? (mode) => handleOpenReply(mode) : undefined}
              onPreviewAttachment={setPreviewAttachment}
            />
          ))}

          {/* Inline reply — rendered below message stack */}
          {allowReplies && showInlineReply && composerState ? (
            <InlineReply
              state={composerState}
              onClose={onCloseReply}
              onDiscard={onDiscardReply}
              onExpand={onExpandReply}
              onSend={onSendReply}
              onModeChange={(mode) => {
                const to = mode === "forward" ? [] : lastMessage.to;
                onPatchComposer({ mode, to });
              }}
              onChange={onPatchComposer}
            />
          ) : allowReplies ? (
            /* Quick-reply prompt when no inline reply is open */
            <div
              className="flex items-center gap-2 rounded-xl border border-dashed border-[#D1D5DB] bg-white px-4 py-3 text-sm text-[#94A3B8] cursor-pointer hover:border-[#16294D] hover:text-[#16294D] transition-colors"
              onClick={() => handleOpenReply("reply")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenReply("reply");
                }
              }}
              aria-label="Click to reply"
              data-testid="reply-prompt"
            >
              <span className="text-xs">Click to reply…</span>
            </div>
          ) : null
          }
        </div>
      </div>

      {/* Preview modal */}
      {previewAttachment && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
