"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Minus, X, Maximize2 } from "lucide-react";
import type { MailboxComposerState, ComposeDraftAttachment } from "./types";
import {
  RichTextToolbar,
  AttachmentStrip,
  RecipientField,
  FromIdentityBadge,
  BodyArea,
  SendBar,
} from "./composer-primitives";

interface FloatingComposerProps {
  state: MailboxComposerState;
  onClose: () => void;
  onExpand: () => void;
  onChange: (patch: Partial<MailboxComposerState>) => void;
}

export function FloatingComposer({ state, onClose, onExpand, onChange }: FloatingComposerProps) {
  const [minimized, setMinimized] = useState(false);

  const removeAttachment = (id: string) =>
    onChange({ attachments: state.attachments.filter((a) => a.id !== id) });

  return (
    <div
      className={cn(
        "fixed bottom-0 right-6 z-50 flex w-[680px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-xl transition-all",
        minimized ? "h-10" : "h-[560px]"
      )}
      style={{ borderColor: "#D1D5DB" }}
      data-testid="floating-composer"
      role="dialog"
      aria-label="New message"
      aria-modal="false"
    >
      {/* Title bar */}
      <div
        className="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3"
        style={{ background: "#16294D" }}
        onClick={() => setMinimized((v) => !v)}
      >
        <span className="flex-1 truncate text-sm font-semibold text-white">
          {state.mode === "new"
            ? "New message"
            : state.mode === "reply"
            ? `Reply — ${state.subject}`
            : state.mode === "reply-all"
            ? `Reply all — ${state.subject}`
            : `Fwd: ${state.subject}`}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className="flex h-6 w-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={minimized ? "Restore composer" : "Minimize composer"}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="flex h-6 w-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Expand composer"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex h-6 w-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close composer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!minimized && (
        <>
          {/* Fields */}
          <div className="shrink-0">
            <FromIdentityBadge
              label={state.fromLabel}
              email={state.fromEmail}
              color="#16294D"
            />
            <RecipientField
              label="To"
              value={state.to.join(", ")}
              onChange={(v) => onChange({ to: v ? v.split(",").map((s) => s.trim()) : [] })}
              placeholder="Recipients"
              autoFocus
            />
            {state.showCc && (
              <RecipientField
                label="Cc"
                value={state.cc.join(", ")}
                onChange={(v) => onChange({ cc: v ? v.split(",").map((s) => s.trim()) : [] })}
                placeholder="Cc"
              />
            )}
            {state.showBcc && (
              <RecipientField
                label="Bcc"
                value={state.bcc.join(", ")}
                onChange={(v) => onChange({ bcc: v ? v.split(",").map((s) => s.trim()) : [] })}
                placeholder="Bcc"
              />
            )}

            {/* Subject + cc/bcc toggles */}
            <div
              className="flex items-center gap-2 border-b px-3 py-1.5"
              style={{ borderColor: "#F1F3F7" }}
            >
              <span className="w-7 shrink-0 text-xs font-semibold text-[#94A3B8]">Sub</span>
              <input
                type="text"
                value={state.subject}
                onChange={(e) => onChange({ subject: e.target.value })}
                placeholder="Subject"
                className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
                aria-label="Subject"
              />
              <div className="flex shrink-0 items-center gap-1">
                {!state.showCc && (
                  <button
                    type="button"
                    onClick={() => onChange({ showCc: true })}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
                    aria-label="Add Cc"
                  >
                    Cc
                  </button>
                )}
                {!state.showBcc && (
                  <button
                    type="button"
                    onClick={() => onChange({ showBcc: true })}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
                    aria-label="Add Bcc"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <BodyArea
            value={state.bodyHtml}
            onChange={(v) => onChange({ bodyHtml: v })}
            minRows={8}
            className="flex-1"
          />

          {/* Attachment strip */}
          <AttachmentStrip attachments={state.attachments} onRemove={removeAttachment} />

          {/* Toolbar + send bar */}
          <RichTextToolbar compact />
          <SendBar
            sendState={state.sendState}
            onSend={() => onChange({ sendState: "sending" })}
            deliveryMode={state.deliveryMode}
            scheduledSendAt={state.scheduledSendAt}
            scheduleLabel={state.scheduleLabel}
            schedulePanelOpen={state.schedulePanelOpen}
            onSchedulePanelToggle={() => onChange({ schedulePanelOpen: !state.schedulePanelOpen })}
            onScheduleApply={({ iso, label }) =>
              onChange({
                deliveryMode: "schedule_send",
                scheduledSendAt: iso,
                scheduleLabel: label,
                schedulePanelOpen: false,
              })
            }
            onScheduleClear={() =>
              onChange({
                deliveryMode: "send_now",
                scheduledSendAt: null,
                scheduleLabel: null,
                schedulePanelOpen: false,
              })
            }
            onDiscard={onClose}
            onExpand={onExpand}
            showExpand
            compact
          />
        </>
      )}
    </div>
  );
}
