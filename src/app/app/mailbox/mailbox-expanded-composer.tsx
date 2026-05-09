"use client";

import { X, Minimize2 } from "lucide-react";
import type { MailboxComposerState } from "./types";
import {
  RichTextToolbar,
  AttachmentStrip,
  RecipientField,
  FromIdentityBadge,
  BodyArea,
  SendBar,
} from "./composer-primitives";

interface ExpandedComposerProps {
  state: MailboxComposerState;
  onClose: () => void;
  onCollapse: () => void;
  onChange: (patch: Partial<MailboxComposerState>) => void;
}

export function ExpandedComposer({ state, onClose, onCollapse, onChange }: ExpandedComposerProps) {
  const removeAttachment = (id: string) =>
    onChange({ attachments: state.attachments.filter((a) => a.id !== id) });

  const modeLabel =
    state.mode === "new" ? "New message" :
    state.mode === "reply" ? "Reply" :
    state.mode === "reply-all" ? "Reply all" :
    "Forward";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
      data-testid="expanded-composer"
      role="dialog"
      aria-label={modeLabel}
      aria-modal="true"
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: "#D1D5DB" }}
      >
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center gap-3 border-b px-5"
          style={{ borderColor: "#E2E5EA" }}
        >
          <h2 className="flex-1 text-sm font-bold text-[#0F172A]">{modeLabel}</h2>
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
            aria-label="Collapse to floating composer"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-red-50 hover:text-[#DC2626]"
            aria-label="Close composer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
            className="flex items-center gap-2 border-b px-3 py-2"
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

        {/* Body — flex-1 so it fills remaining space */}
        <BodyArea
          value={state.bodyHtml}
          onChange={(v) => onChange({ bodyHtml: v })}
          minRows={10}
          className="flex-1"
        />

        {/* Attachment strip */}
        <AttachmentStrip attachments={state.attachments} onRemove={removeAttachment} />

        {/* Toolbar */}
        <RichTextToolbar />

        {/* Send bar */}
        <SendBar
          sendState={state.sendState}
          onSend={() => onChange({ sendState: "sending" })}
          onDiscard={onClose}
        />
      </div>
    </div>
  );
}
