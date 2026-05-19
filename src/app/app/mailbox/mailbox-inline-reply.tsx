"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { MailboxComposerState, ComposeMode } from "./types";
import {
  RichTextToolbar,
  AttachmentStrip,
  RecipientField,
  BodyArea,
  SendBar,
} from "./composer-primitives";

const MODE_LABELS: Record<ComposeMode, string> = {
  new: "New message",
  reply: "Reply",
  "reply-all": "Reply all",
  forward: "Forward",
};

const MODE_COLORS: Record<ComposeMode, string> = {
  new: "#16294D",
  reply: "#16294D",
  "reply-all": "#16294D",
  forward: "#7C3AED",
};

interface InlineReplyProps {
  state: MailboxComposerState;
  onClose: () => void;
  onDiscard: () => void;
  onExpand: () => void;
  onSend: () => void;
  onModeChange: (mode: ComposeMode) => void;
  onChange: (patch: Partial<MailboxComposerState>) => void;
}

export function InlineReply({ state, onClose, onDiscard, onExpand, onSend, onModeChange, onChange }: InlineReplyProps) {
  const removeAttachment = (id: string) =>
    onChange({ attachments: state.attachments.filter((a) => a.id !== id) });

  const modes: ComposeMode[] = ["reply", "reply-all", "forward"];

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: "#D1D5DB" }}
      data-testid="inline-reply"
      role="form"
      aria-label={MODE_LABELS[state.mode]}
    >
      {/* Mode switcher + close */}
      <div
        className="flex h-9 shrink-0 items-center gap-1 border-b px-3"
        style={{ borderColor: "#E2E5EA" }}
      >
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              state.mode === m
                ? "text-white"
                : "text-[#64748B] hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            )}
            style={state.mode === m ? { background: MODE_COLORS[m] } : undefined}
            aria-pressed={state.mode === m}
            aria-label={MODE_LABELS[m]}
          >
            {MODE_LABELS[m]}
          </button>
        ))}

        <div className="flex-1" />

        {/* Sender identity */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "#16294D18", color: "#16294D" }}
          aria-label={`Sending from ${state.fromEmail}`}
        >
          {state.fromLabel}
        </span>

        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-[#94A3B8] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
          aria-label="Close reply"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* To field — shown for forward, or when reply-all has multiple recipients */}
      {(state.mode === "forward" || state.mode === "reply-all") && (
        <RecipientField
          label="To"
          value={state.to.join(", ")}
          onChange={(v) => onChange({ to: v ? v.split(",").map((s) => s.trim()) : [] })}
          placeholder={state.mode === "forward" ? "Forward to…" : "Recipients"}
          autoFocus={state.mode === "forward"}
        />
      )}

      {/* Cc field */}
      {state.showCc && (
        <RecipientField
          label="Cc"
          value={state.cc.join(", ")}
          onChange={(v) => onChange({ cc: v ? v.split(",").map((s) => s.trim()) : [] })}
          placeholder="Cc"
        />
      )}

      {/* Bcc field */}
      {state.showBcc && (
        <RecipientField
          label="Bcc"
          value={state.bcc.join(", ")}
          onChange={(v) => onChange({ bcc: v ? v.split(",").map((s) => s.trim()) : [] })}
          placeholder="Bcc"
        />
      )}

      {/* Cc/Bcc toggles when not shown */}
      {(!state.showCc || !state.showBcc) && (
        <div
          className="flex items-center gap-1 border-b px-3 py-1"
          style={{ borderColor: "#F1F3F7" }}
        >
          {!state.showCc && (
            <button
              type="button"
              onClick={() => onChange({ showCc: true })}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
              aria-label="Add Cc"
            >
              + Cc
            </button>
          )}
          {!state.showBcc && (
            <button
              type="button"
              onClick={() => onChange({ showBcc: true })}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
              aria-label="Add Bcc"
            >
              + Bcc
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <BodyArea
        value={state.bodyHtml}
        onChange={(v) => onChange({ bodyHtml: v })}
        placeholder={
          state.mode === "forward"
            ? "Add a note before forwarding…"
            : "Write your reply…"
        }
        minRows={4}
      />

      {/* Attachment strip */}
      <AttachmentStrip attachments={state.attachments} onRemove={removeAttachment} />

      {/* Toolbar + send bar */}
      <RichTextToolbar compact />
      <SendBar
        sendState={state.sendState}
        onSend={onSend}
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
        onDiscard={onDiscard}
        onExpand={onExpand}
        showExpand
        compact
      />
    </div>
  );
}
