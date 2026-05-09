"use client";

import { useState } from "react";
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
} from "lucide-react";
import type { MailboxThreadDetail, MailboxMessageItem, MailboxAttachmentSummary } from "./types";

// ─── Attachment chip ─────────────────────────────────────────────────────────

function attachmentIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return File;
}

function AttachmentChip({ attachment }: { attachment: MailboxAttachmentSummary }) {
  const Icon = attachmentIcon(attachment.mimeType);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-3 py-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[#0F172A]">{attachment.filename}</p>
        <p className="text-[10px] text-[#94A3B8]">{attachment.sizeLabel}</p>
      </div>
      <button
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#E2E5EA] hover:text-[#0F172A]"
        title={`Download ${attachment.filename}`}
        aria-label={`Download ${attachment.filename}`}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
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

function MessageItem({ message }: { message: MailboxMessageItem }) {
  const [collapsed, setCollapsed] = useState(message.isCollapsed);
  const isOutbound = message.direction === "outbound";

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
          <div
            className="border-t px-4 py-4 text-sm leading-relaxed text-[#334155]"
            style={{ borderColor: "#F1F3F7" }}
            // Safe for static HTML — real implementation will sanitize
            dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
          />

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
                  <AttachmentChip key={att.id} attachment={att} />
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
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
                aria-label="Reply to this message"
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>
              <button
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#D1D5DB] hover:bg-[#F7F8FB]"
                aria-label="Reply all"
              >
                <ReplyAll className="h-3.5 w-3.5" />
                Reply all
              </button>
              <button
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

function ThreadHeader({ detail }: { detail: MailboxThreadDetail }) {
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            title="Archive thread"
            aria-label="Archive thread"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            title="Flag thread"
            aria-label="Flag thread"
          >
            <Flag className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-red-50 hover:text-[#DC2626]"
            title="Delete thread"
            aria-label="Delete thread"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            title="More thread actions"
            aria-label="More thread actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
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

interface MailboxReadingPaneProps {
  detail: MailboxThreadDetail;
}

export function MailboxReadingPane({ detail }: MailboxReadingPaneProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[#F7F8FB]"
      data-testid="mailbox-reading-pane-active"
      aria-label={`Thread: ${detail.subject}`}
    >
      {/* Thread header */}
      <ThreadHeader detail={detail} />

      {/* Message stack */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {detail.messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
        </div>
      </div>
    </div>
  );
}
