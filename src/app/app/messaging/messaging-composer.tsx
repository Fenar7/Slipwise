"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Paperclip,
  AtSign,
  Smile,
  Send,
  X,
  FileText,
  FileSpreadsheet,
  Image,
  File,
  CheckSquare,
  Video,
  Hash,
  Lock,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { FormattingToolbar, applyComposerFormat } from "./messaging-formatting-toolbar";
import type {
  AttachedFile,
  MentionSuggestion,
  SlashCommand,
  ComposerState,
  PresenceStatus,
} from "./types";
import { MOCK_PARTICIPANTS } from "./mock-data";
import { useDrafts } from "./lib/use-drafts";
import { useAttachmentUpload, type UploadedAttachment } from "./lib/use-attachment-upload";

const MOCK_MENTION_SUGGESTIONS: MentionSuggestion[] = MOCK_PARTICIPANTS.map((p) => ({
  userId: p.id,
  name: p.name,
  avatarInitials: p.avatarInitials,
  role: p.role,
  presence: p.presence,
}));

const MOCK_SLASH_COMMANDS: SlashCommand[] = [
  { command: "/task", label: "Create Task", description: "Create a new task linked to this conversation", iconName: "CheckSquare" },
  { command: "/meet", label: "Schedule Meeting", description: "Schedule a meeting with participants in this channel", iconName: "Video" },
  { command: "/doc", label: "New Document", description: "Create and share a new document", iconName: "FileText" },
  { command: "/mention", label: "Mention Someone", description: "Quickly mention a team member", iconName: "AtSign" },
  { command: "/channel", label: "Link Channel", description: "Reference another channel in your message", iconName: "Hash" },
];

function extractMentionPayload(
  body: string,
  suggestions: MentionSuggestion[],
): Array<{ userId: string; offsetStart: number; offsetEnd: number }> {
  const mentions: Array<{ userId: string; offsetStart: number; offsetEnd: number }> = [];
  for (const suggestion of suggestions) {
    const token = `@${suggestion.name}`;
    let searchFrom = 0;
    while (searchFrom < body.length) {
      const offsetStart = body.indexOf(token, searchFrom);
      if (offsetStart === -1) break;
      const offsetEnd = offsetStart + token.length;
      mentions.push({ userId: suggestion.userId, offsetStart, offsetEnd });
      searchFrom = offsetEnd;
    }
  }
  return mentions.sort((a, b) => a.offsetStart - b.offsetStart);
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-400",
        status === "offline" && "bg-gray-300"
      )}
      aria-hidden="true"
    />
  );
}

function fileIcon(category: AttachedFile["mimeCategory"]) {
  switch (category) {
    case "spreadsheet": return FileSpreadsheet;
    case "image": return Image;
    case "document": return FileText;
    default: return File;
  }
}

function slashIcon(iconName: SlashCommand["iconName"]) {
  switch (iconName) {
    case "CheckSquare": return CheckSquare;
    case "Video": return Video;
    case "FileText": return FileText;
    case "AtSign": return AtSign;
    case "Hash": return Hash;
  }
}

function uploadedFileIcon(mimeCategory: string) {
  switch (mimeCategory) {
    case "spreadsheet": return FileSpreadsheet;
    case "image": return Image;
    case "document": return FileText;
    default: return File;
  }
}

function formatSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentStagingProps {
  files: UploadedAttachment[];
  onRemove: (storageRef: string) => void;
}

function AttachmentStaging({ files, onRemove }: AttachmentStagingProps) {
  if (files.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-2 border-b px-3 py-2"
      style={{ borderColor: "#F0F0F0" }}
      data-testid="composer-attachment-staging"
    >
      {files.map((file) => {
        const Icon = uploadedFileIcon(file.mimeCategory);
        return (
          <div
            key={file.storageRef}
            className="group flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs"
            style={{ borderColor: "#E8E8E8" }}
            data-testid={`composer-attachment-chip-${file.storageRef}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
            <span className="max-w-[140px] truncate font-medium" style={{ color: "#1C1B1F" }}>
              {file.fileName}
            </span>
            <span className="shrink-0" style={{ color: "#79747E" }}>
              {formatSizeLabel(file.sizeBytes)}
            </span>
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
              aria-label={`Remove ${file.fileName}`}
              onClick={() => onRemove(file.storageRef)}
              data-testid={`composer-attachment-remove-${file.storageRef}`}
            >
              <X className="h-2.5 w-2.5 text-[#79747E] group-hover:text-[#DC2626]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface MentionPopoverProps {
  suggestions: MentionSuggestion[];
  onSelect: (suggestion: MentionSuggestion) => void;
}

function MentionPopover({ suggestions, onSelect }: MentionPopoverProps) {
  return (
    <div
      className="absolute bottom-full left-0 mb-1 w-72 rounded-xl border bg-white shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      role="listbox"
      aria-label="Mention suggestions"
      data-testid="composer-mention-popover"
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "#F0F0F0" }}
      >
        <AtSign className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
        <span className="text-xs font-semibold" style={{ color: "#79747E" }}>
          Mention a team member
        </span>
      </div>
      <ul className="py-1">
        {suggestions.map((s) => (
          <li key={s.userId} role="option" aria-selected={false}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
              onClick={() => onSelect(s)}
              data-testid={`mention-suggestion-${s.userId}`}
            >
              <div className="relative shrink-0">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold"
                  style={{ color: "#49454F" }}
                >
                  {s.avatarInitials}
                </div>
                <PresenceDot status={s.presence} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" style={{ color: "#1C1B1F" }}>
                  {s.name}
                </p>
                <p className="text-[10px] capitalize" style={{ color: "#79747E" }}>
                  {s.role}
                </p>
              </div>
              <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "#C4C4C4" }} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SlashPopoverProps {
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
}

function SlashPopover({ commands, onSelect }: SlashPopoverProps) {
  return (
    <div
      className="absolute bottom-full left-0 mb-1 w-80 rounded-xl border bg-white shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      role="listbox"
      aria-label="Slash commands"
      data-testid="composer-slash-popover"
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "#F0F0F0" }}
      >
        <span className="text-xs font-semibold" style={{ color: "#79747E" }}>
          Commands
        </span>
      </div>
      <ul className="py-1">
        {commands.map((cmd) => {
          const Icon = slashIcon(cmd.iconName);
          return (
            <li key={cmd.command} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
                onClick={() => onSelect(cmd)}
                data-testid={`slash-command-${cmd.command.replace("/", "")}`}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: "#49454F" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: "#1C1B1F" }}>
                    <span className="text-[#DC2626]">{cmd.command}</span>{" "}
                    {cmd.label}
                  </p>
                  <p className="truncate text-[10px]" style={{ color: "#79747E" }}>
                    {cmd.description}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RestrictedComposer({ reason }: { reason?: string }) {
  return (
    <div
      className="shrink-0 border-t bg-white px-4 py-3"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="composer-restricted"
    >
      <div
        className="flex items-center gap-3 rounded-xl border bg-gray-50 px-4 py-3"
        style={{ borderColor: "#E8E8E8" }}
      >
        <Lock className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="text-xs" style={{ color: "#79747E" }}>
          {reason ?? "You do not have permission to post in this channel."}
        </p>
      </div>
    </div>
  );
}

export interface MessagingComposerProps {
  placeholder: string;
  isAccessible?: boolean;
  restricted?: boolean;
  restrictedReason?: string;
  simulatedState?: ComposerState;
  onSend?: (
    body: string,
    options?: {
      mentions?: Array<{ userId: string; offsetStart: number; offsetEnd: number }>;
      attachments?: Array<{ storageRef: string; fileName: string; mimeType: string; sizeBytes: number }>;
    },
  ) => void | Promise<unknown>;
  sending?: boolean;
  sendError?: string | null;
  conversationId?: string;
  threadId?: string | null;
  participants?: MentionSuggestion[];
}

export function MessagingComposer({
  placeholder,
  isAccessible = true,
  restricted = false,
  restrictedReason,
  simulatedState,
  onSend,
  sending = false,
  sendError,
  conversationId,
  threadId,
  participants,
}: MessagingComposerProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [activePopover, setActivePopover] = React.useState<
    "mention" | "slash" | null
  >(simulatedState === "mention-popover" ? "mention" : simulatedState === "slash-popover" ? "slash" : null);

  const { fetchDraft, saveDraft, deleteDraft } = useDrafts();
  const {
    uploading,
    stagedFiles,
    failures,
    error: uploadError,
    upload,
    removeStaged,
    clearFailures,
    clearAll,
    clearError,
  } = useAttachmentUpload();

  const inputRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const mentionSuggestions = participants && participants.length > 0
    ? participants
    : MOCK_MENTION_SUGGESTIONS;

  const hasContent = inputValue.trim().length > 0 || stagedFiles.length > 0;

  React.useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    fetchDraft(conversationId, threadId ?? null).then((draft) => {
      if (cancelled || !draft) return;
      setInputValue(draft.body);
      if (inputRef.current) {
        inputRef.current.textContent = draft.body;
      }
    });
    return () => { cancelled = true; };
  }, [conversationId, threadId]);

  React.useEffect(() => {
    if (!conversationId || inputValue.trim().length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(conversationId, inputValue, threadId ?? null);
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [inputValue, conversationId, threadId]);

  function handleRemoveFile(storageRef: string) {
    removeStaged(storageRef);
  }

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await upload(files[i]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleMentionSelect(s: MentionSuggestion) {
    setActivePopover(null);
    setInputValue((prev) => {
      const updated = prev ? `${prev} @${s.name} ` : `@${s.name} `;
      if (inputRef.current) {
        inputRef.current.textContent = updated;
      }
      return updated;
    });
  }

  function handleSlashSelect(_cmd: SlashCommand) {
    setActivePopover(null);
  }

  function toggleMentionPopover() {
    setActivePopover((prev) => (prev === "mention" ? null : "mention"));
  }

  function toggleSlashPopover() {
    setActivePopover((prev) => (prev === "slash" ? null : "slash"));
  }

  async function handleSend() {
    if (!onSend || !hasContent || sending) return;
    const mentions = extractMentionPayload(inputValue, mentionSuggestions);

    const attachmentPayload = stagedFiles.map((f) => ({
      storageRef: f.storageRef,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    }));

    if (mentions.length > 0 || attachmentPayload.length > 0) {
      await onSend(inputValue, {
        mentions: mentions.length > 0 ? mentions : undefined,
        attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
      });
    } else {
      await onSend(inputValue);
    }

    setInputValue("");
    if (inputRef.current) inputRef.current.textContent = "";
    clearAll();
    if (conversationId) {
      deleteDraft(conversationId, threadId ?? null);
    }
  }

  const displayHasContent = simulatedState === "has-content" ? true : hasContent;

  function applyFormat(type: string) {
    applyComposerFormat(type, inputRef, setInputValue);
  }

  if (restricted || !isAccessible) {
    return <RestrictedComposer reason={restrictedReason} />;
  }

  return (
    <div
      className="shrink-0 border-t bg-white px-4 py-3"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="reading-workspace-composer"
    >
      <div className="relative">
        {activePopover === "mention" && (
          <MentionPopover
            suggestions={mentionSuggestions}
            onSelect={handleMentionSelect}
          />
        )}
        {activePopover === "slash" && (
          <SlashPopover
            commands={MOCK_SLASH_COMMANDS}
            onSelect={handleSlashSelect}
          />
        )}

        {sendError && (
          <div className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700" data-testid="composer-send-error">
            {sendError}
          </div>
        )}

        {failures.length > 0 && (
          <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2" data-testid="composer-upload-failures">
            {failures.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="flex-1 truncate">{f.fileName}: {f.message}</span>
                {i === failures.length - 1 && (
                  <button
                    type="button"
                    onClick={clearFailures}
                    className="text-amber-800 hover:underline"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div
          className="flex flex-col rounded-xl border bg-white transition-shadow focus-within:shadow-sm focus-within:border-gray-300"
          style={{ borderColor: "#E0E0E0" }}
          data-testid="composer-shell"
        >
          <FormattingToolbar onFormat={applyFormat} />

          <AttachmentStaging files={stagedFiles} onRemove={handleRemoveFile} />

          {uploading && (
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "#F0F0F0" }}>
              <Loader2 className="h-3 w-3 animate-spin text-[#DC2626]" />
              <span className="text-xs" style={{ color: "#79747E" }}>Uploading attachments…</span>
            </div>
          )}

          <div
            className="relative min-h-[2.75rem] max-h-40 overflow-y-auto px-3 py-2.5"
            data-testid="composer-input-area"
          >
            <div
              ref={inputRef}
              role="textbox"
              aria-label={placeholder}
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              className="min-h-[1.25rem] w-full text-sm leading-relaxed outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[#C4C4C4]"
              style={{ color: "#1C1B1F" }}
              data-placeholder={placeholder}
              data-testid="composer-input"
              onInput={(e) => setInputValue(e.currentTarget.textContent ?? "")}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && onSend && displayHasContent && !sending) { e.preventDefault(); handleSend(); }}}
            />
          </div>

          {uploadError && (
            <div className="border-t px-3 py-1.5" style={{ borderColor: "#FED7D7" }}>
              <p className="text-xs text-red-600">{uploadError}</p>
              <button
                type="button"
                onClick={clearError}
                className="text-xs text-red-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            className="flex items-center gap-1 border-t px-2 py-1.5"
            style={{ borderColor: "#F0F0F0" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFileChange}
              data-testid="composer-file-input"
            />

            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
              aria-label="Attach file"
              data-testid="composer-attach-btn"
              onClick={handleAttachClick}
            >
              <Paperclip className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
            </button>

            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]",
                activePopover === "mention"
                  ? "bg-red-50 text-[#DC2626]"
                  : "hover:bg-gray-100"
              )}
              aria-label="Mention someone"
              aria-pressed={activePopover === "mention"}
              aria-expanded={activePopover === "mention"}
              data-testid="composer-mention-btn"
              onClick={toggleMentionPopover}
            >
              <AtSign
                className="h-3.5 w-3.5"
                style={{ color: activePopover === "mention" ? "#DC2626" : "#79747E" }}
              />
            </button>

            <button
              type="button"
              className={cn(
                "flex h-7 items-center justify-center rounded-lg px-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]",
                activePopover === "slash"
                  ? "bg-red-50 text-[#DC2626]"
                  : "hover:bg-gray-100"
              )}
              aria-label="Slash commands"
              aria-pressed={activePopover === "slash"}
              aria-expanded={activePopover === "slash"}
              data-testid="composer-slash-btn"
              onClick={toggleSlashPopover}
            >
              <span
                className="text-xs font-bold"
                style={{ color: activePopover === "slash" ? "#DC2626" : "#79747E" }}
              >
                /
              </span>
            </button>

            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
              aria-label="Add emoji"
              data-testid="composer-emoji-btn"
            >
              <Smile className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
            </button>

            <div className="flex-1" />

            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1",
                displayHasContent && !sending
                  ? "bg-[#DC2626] text-white hover:bg-red-700 cursor-pointer"
                  : "bg-gray-100 text-[#79747E] cursor-not-allowed opacity-60"
              )}
              disabled={!displayHasContent || sending}
              aria-label="Send message"
              data-testid="composer-send-btn"
              onClick={handleSend}
            >
              <Send className="h-3 w-3" />
              <span>{sending ? "Sending…" : "Send"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
