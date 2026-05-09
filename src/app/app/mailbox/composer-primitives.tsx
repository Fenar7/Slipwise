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
  ChevronDown,
  CalendarClock,
  Clock3,
} from "lucide-react";
import type { ComposeDraftAttachment, ComposeDeliveryMode } from "./types";

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
  deliveryMode?: ComposeDeliveryMode;
  scheduledSendAt?: string | null;
  scheduleLabel?: string | null;
  schedulePanelOpen?: boolean;
  onSend: () => void;
  onSchedulePanelToggle?: () => void;
  onScheduleApply?: (schedule: { iso: string; label: string }) => void;
  onScheduleClear?: () => void;
  onDiscard: () => void;
  onExpand?: () => void;
  showExpand?: boolean;
  compact?: boolean;
}

const QUICK_SCHEDULES = [
  { id: "later-today", label: "Later today · 6:00 PM IST", date: "2026-05-09", time: "18:00" },
  { id: "tomorrow", label: "Tomorrow morning · 9:00 AM IST", date: "2026-05-10", time: "09:00" },
  { id: "business-day", label: "Next business day · 9:30 AM IST", date: "2026-05-11", time: "09:30" },
] as const;

export function SendBar({
  sendState,
  deliveryMode = "send_now",
  scheduledSendAt,
  scheduleLabel,
  schedulePanelOpen = false,
  onSend,
  onSchedulePanelToggle,
  onScheduleApply,
  onScheduleClear,
  onDiscard,
  onExpand,
  showExpand,
  compact,
}: SendBarProps) {
  const defaultSchedule = QUICK_SCHEDULES[1];
  const scheduleDateRef = useRef<HTMLInputElement>(null);
  const scheduleTimeRef = useRef<HTMLInputElement>(null);

  const handleScheduleApply = (date: string, time: string, label: string) => {
    onScheduleApply?.({
      iso: `${date}T${time}:00+05:30`,
      label,
    });
  };

  return (
    <div
      className={cn(
        "shrink-0 border-t",
        compact ? "px-2 py-2" : "px-3 py-3"
      )}
      style={{ borderColor: "#E2E5EA" }}
    >
      {deliveryMode === "schedule_send" && scheduleLabel && (
        <div
          className={cn(
            "mb-2 rounded-2xl border bg-[#F8FAFC] shadow-sm",
            compact ? "px-3 py-2.5" : "px-4 py-3"
          )}
          style={{ borderColor: "#D8E2F0" }}
          data-testid="scheduled-send-summary"
        >
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#16294D]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Scheduled send</p>
              <p className="mt-0.5 text-xs font-semibold text-[#0F172A]">{scheduleLabel}</p>
            </div>
            <button
              type="button"
              onClick={onScheduleClear}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#64748B] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A]"
              aria-label="Remove scheduled send"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
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
           deliveryMode === "schedule_send" ? "Send now" :
           "Send"}
        </button>

        <div className="relative shrink-0">
          {schedulePanelOpen && (
            <div
              className={cn(
                "absolute bottom-[calc(100%+12px)] left-0 z-20 rounded-2xl border bg-white shadow-2xl",
                compact
                  ? "w-[340px] max-w-[min(340px,calc(100vw-64px))]"
                  : "w-[380px] max-w-[min(380px,calc(100vw-64px))]"
              )}
              style={{ borderColor: "#D1D5DB" }}
              role="dialog"
              aria-label="Schedule send"
              data-testid="schedule-send-panel"
            >
              <div className="border-b px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#16294D]" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-[#0F172A]">Schedule send</h4>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Choose when this draft should be sent from your organization mailbox.
                </p>
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Quick picks</p>
                  <div className="flex flex-col gap-1.5">
                    {QUICK_SCHEDULES.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleScheduleApply(preset.date, preset.time, preset.label)}
                        className="rounded-full border border-[#E2E5EA] bg-white px-3 py-1.5 text-left text-[11px] font-semibold text-[#64748B] transition-colors hover:border-[#16294D] hover:text-[#0F172A]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Date</span>
                    <input
                      ref={scheduleDateRef}
                      type="date"
                      defaultValue={defaultSchedule.date}
                      className="w-full rounded-lg border border-[#D1D5DB] px-2.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#16294D] focus:ring-2 focus:ring-[rgba(22,41,77,0.12)]"
                      aria-label="Schedule date"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Time</span>
                    <input
                      ref={scheduleTimeRef}
                      type="time"
                      defaultValue={defaultSchedule.time}
                      className="w-full rounded-lg border border-[#D1D5DB] px-2.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#16294D] focus:ring-2 focus:ring-[rgba(22,41,77,0.12)]"
                      aria-label="Schedule time"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-[#E2E5EA] bg-[#F8FAFC] px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                    <Clock3 className="h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
                    <span>Timezone: India Standard Time (IST)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
                <button
                  type="button"
                  onClick={onSchedulePanelToggle}
                  className="rounded-lg border border-[#E2E5EA] px-3 py-1.5 text-xs font-semibold text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = scheduleDateRef.current?.value || defaultSchedule.date;
                    const time = scheduleTimeRef.current?.value || defaultSchedule.time;
                    handleScheduleApply(date, time, `${date} · ${time} IST`);
                  }}
                  className="rounded-lg bg-[#16294D] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
                >
                  Schedule
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onSchedulePanelToggle}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
              compact ? "h-7" : "h-8",
              schedulePanelOpen || deliveryMode === "schedule_send"
                ? "border-[#16294D] bg-[#F8FAFC] text-[#16294D]"
                : "border-[#E2E5EA] text-[#64748B] hover:bg-[#F7F8FB] hover:text-[#0F172A]"
            )}
            aria-label="Schedule send"
            aria-expanded={schedulePanelOpen}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Schedule</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", schedulePanelOpen && "rotate-180")} />
          </button>
        </div>

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
    </div>
  );
}
