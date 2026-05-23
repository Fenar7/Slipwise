"use client";

import { cn } from "@/lib/utils";
import { FileEdit, Clock } from "lucide-react";
import type { DraftRowData } from "./types";

export interface MailboxDraftListProps {
  drafts: DraftRowData[];
  selectedDraftId: string | null;
  onSelectDraft: (id: string) => void;
  emptyState?: React.ReactNode;
}

function DraftRow({
  draft,
  isSelected,
  onClick,
}: {
  draft: DraftRowData;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      data-draft-id={draft.id}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(22,41,77,0.25)]",
        isSelected
          ? "bg-[rgba(22,41,77,0.07)] ring-inset ring-1 ring-[rgba(22,41,77,0.12)]"
          : "bg-white hover:bg-[#F7F8FB]"
      )}
      style={{ borderColor: "#E2E5EA" }}
    >
      {/* Draft icon */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: draft.mailboxColor }}
        aria-hidden="true"
      >
        <FileEdit className="h-3.5 w-3.5" />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-2">
        {/* Row 1: subject + mailbox badge + timestamp */}
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-[#0F172A]">
            {draft.to.join(", ")}
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
          <span className="ml-auto shrink-0 text-[11px] text-[#94A3B8]">
            <Clock className="inline h-3 w-3 mr-0.5" />
            Draft
          </span>
        </div>

        {/* Row 2: subject */}
        <p className="mt-0.5 truncate text-sm font-semibold text-[#0F172A]">
          {draft.subject}
        </p>

        {/* Row 3: snippet */}
        <p className="mt-0.5 truncate text-xs text-[#64748B]">{draft.snippet}</p>
      </div>
    </div>
  );
}

export function MailboxDraftList({
  drafts,
  selectedDraftId,
  onSelectDraft,
  emptyState,
}: MailboxDraftListProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      role="listbox"
      aria-label="Draft list"
      aria-multiselectable="false"
    >
      <div className="flex-1 overflow-y-auto">
        {drafts.length === 0 && emptyState ? (
          emptyState
        ) : (
          drafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={selectedDraftId === draft.id}
              onClick={() => onSelectDraft(draft.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
