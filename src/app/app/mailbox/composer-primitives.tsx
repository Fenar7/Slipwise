"use client";

/**
 * Shared composer primitives used by floating, expanded, and inline composers.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  AlignLeft,
  AlignCenter,
  Quote,
  Paperclip,
  X,
  FileText,
  FileSpreadsheet,
  File,
} from "lucide-react";
import type { ComposeDraftAttachment } from "./types";

// ─── Rich-text toolbar ────────────────────────────────────────────────────────

const TOOLBAR_GROUPS = [
  [
    { icon: Bold, label: "Bold" },
    { icon: Italic, label: "Italic" },
    { icon: Underline, label: "Underline" },
  ],
  [
    { icon: List, label: "Bullet list" },
    { icon: ListOrdered, label: "Numbered list" },
    { icon: Quote, label: "Blockquote" },
  ],
  [
    { icon: AlignLeft, label: "Align left" },
    { icon: AlignCenter, label: "Align center" },
  ],
  [{ icon: Link2, label: "Insert link" }],
];

export function RichTextToolbar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-t",
        compact ? "px-2 py-1" : "px-3 py-1.5"
      )}
      style={{ borderColor: "#E2E5EA" }}
      role="toolbar"
      aria-label="Text formatting"
    >
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && (
            <span
              className="mx-1 h-4 w-px shrink-0"
              style={{ background: "#E2E5EA" }}
              aria-hidden="true"
            />
          )}
          {group.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className={cn(
                "flex items-center justify-center rounded text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]",
                compact ? "h-6 w-6" : "h-7 w-7"
              )}
              title={label}
              aria-label={label}
            >
              <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          ))}
        </div>
      ))}

      {/* Attach file — lives in toolbar */}
      <span className="mx-1 h-4 w-px shrink-0" style={{ background: "#E2E5EA" }} aria-hidden="true" />
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center rounded text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]",
          compact ? "h-6 w-6" : "h-7 w-7"
        )}
        title="Attach file"
        aria-label="Attach file"
      >
        <Paperclip className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <input type="file" className="sr-only" multiple tabIndex={-1} />
      </label>
    </div>
  );
}

// ─── Attachment strip ─────────────────────────────────────────────────────────

function attachmentIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return File;
}

interface AttachmentStripProps {
  attachments: ComposeDraftAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentStrip({ attachments, onRemove }: AttachmentStripProps) {
  if (attachments.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-1.5 border-t px-3 py-2"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Attached files"
    >
      {attachments.map((att) => {
        const Icon = attachmentIcon(att.mimeType);
        return (
          <div
            key={att.id}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-2 py-1 text-xs"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#64748B]" aria-hidden="true" />
            <span className="max-w-[120px] truncate font-medium text-[#334155]">{att.filename}</span>
            <span className="text-[#94A3B8]">{att.sizeLabel}</span>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-[#94A3B8] transition-colors hover:bg-[#E2E5EA] hover:text-[#DC2626]"
              aria-label={`Remove ${att.filename}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recipient field row ──────────────────────────────────────────────────────

interface RecipientFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function RecipientField({ label, value, onChange, placeholder, autoFocus }: RecipientFieldProps) {
  return (
    <div
      className="flex items-center gap-2 border-b px-3 py-1.5"
      style={{ borderColor: "#F1F3F7" }}
    >
      <span className="w-7 shrink-0 text-xs font-semibold text-[#94A3B8]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
        aria-label={label}
      />
    </div>
  );
}

// ─── From identity badge ──────────────────────────────────────────────────────

export function FromIdentityBadge({
  label,
  email,
  color,
}: {
  label: string;
  email: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b px-3 py-1.5"
      style={{ borderColor: "#F1F3F7" }}
    >
      <span className="w-7 shrink-0 text-xs font-semibold text-[#94A3B8]">From</span>
      <span
        className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
        style={{ background: `${color}18`, color }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
        {label}
      </span>
      <span className="text-xs text-[#64748B]">{email}</span>
    </div>
  );
}

// ─── Body textarea ────────────────────────────────────────────────────────────

interface BodyAreaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}

export function BodyArea({ value, onChange, placeholder = "Write your message…", minRows = 4, className }: BodyAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className={cn(
        "w-full flex-1 resize-none bg-transparent px-3 py-3 text-sm text-[#334155] placeholder-[#94A3B8] outline-none",
        className
      )}
      aria-label="Message body"
    />
  );
}

// ─── Send / Discard action bar ────────────────────────────────────────────────

interface SendBarProps {
  sendState: "idle" | "sending" | "sent" | "failed";
  onSend: () => void;
  onDiscard: () => void;
  onExpand?: () => void;
  showExpand?: boolean;
  compact?: boolean;
}

export function SendBar({ sendState, onSend, onDiscard, onExpand, showExpand, compact }: SendBarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t",
        compact ? "px-2 py-1.5" : "px-3 py-2"
      )}
      style={{ borderColor: "#E2E5EA" }}
    >
      <button
        type="button"
        onClick={onSend}
        disabled={sendState === "sending" || sendState === "sent"}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors",
          sendState === "sending" && "opacity-60 cursor-not-allowed",
          sendState === "sent" && "bg-green-600",
          sendState === "failed" && "bg-red-600",
          sendState === "idle" && "hover:opacity-90"
        )}
        style={sendState === "idle" || sendState === "sending" ? { background: "#16294D" } : undefined}
        aria-label={
          sendState === "sending" ? "Sending…" :
          sendState === "sent" ? "Sent" :
          sendState === "failed" ? "Send failed — retry" :
          "Send"
        }
      >
        {sendState === "sending" ? "Sending…" :
         sendState === "sent" ? "Sent ✓" :
         sendState === "failed" ? "Retry send" :
         "Send"}
      </button>

      {showExpand && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E5EA] text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
          title="Expand composer"
          aria-label="Expand composer"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 10v4h4M14 6V2h-4M10 6l4-4M6 10l-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onDiscard}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-[#DC2626]"
        title="Discard draft"
        aria-label="Discard draft"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
