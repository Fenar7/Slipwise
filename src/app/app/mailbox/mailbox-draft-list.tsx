"use client";

import { Clock, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftRowData } from "./types";

export interface MailboxDraftListProps {
  drafts: DraftRowData[];
  selectedDraftId: string | null;
  onSelectDraft: (id: string) => void;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
}

function formatDraftTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MailboxDraftList({
  drafts,
  selectedDraftId,
  onSelectDraft,
  emptyState,
  isLoading = false,
}: MailboxDraftListProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      role="listbox"
      aria-label="Draft list"
    >
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center bg-[#F7F8FB]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#16294D]" />
          </div>
        ) : drafts.length === 0 && emptyState ? (
          emptyState
        ) : (
          drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => onSelectDraft(draft.id)}
              className={cn(
                "group flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(22,41,77,0.25)]",
                selectedDraftId === draft.id
                  ? "bg-[rgba(22,41,77,0.07)] ring-inset ring-1 ring-[rgba(22,41,77,0.12)]"
                  : "bg-white hover:bg-[#F7F8FB]",
              )}
              style={{ borderColor: "#E2E5EA" }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: draft.mailboxColor }}
                aria-hidden="true"
              >
                <FileEdit className="h-3.5 w-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-[#0F172A]">
                    {draft.subject}
                  </span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                    style={{
                      background: `${draft.mailboxColor}18`,
                      color: draft.mailboxColor,
                    }}
                  >
                    {draft.mailboxLabel}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-[#334155]">
                  To: {draft.to.join(", ")}
                </p>
                <p className="mt-0.5 truncate text-xs text-[#64748B]">{draft.snippet}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[#94A3B8]">
                  <Clock className="h-3 w-3" />
                  Saved {formatDraftTimestamp(draft.updatedAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
