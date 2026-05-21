"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Receipt,
  FileCheck,
  Quote,
  User,
  UserCircle2,
  Link2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  UserCheck,
} from "lucide-react";
import type { LinkedContextState, ThreadLinkSummary, ThreadStatus } from "./types";
import { NoLinkedRecordsEmpty } from "./mailbox-empty-states";
import type { AssignableMember } from "./actions";

// ─── Entity icon map ──────────────────────────────────────────────────────────

const ENTITY_ICONS = {
  invoice: Receipt,
  voucher: FileCheck,
  quote: Quote,
  customer: User,
} as const;

const ENTITY_COLORS = {
  invoice: "#16294D",
  voucher: "#7C3AED",
  quote: "#0891B2",
  customer: "#16A34A",
} as const;

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ThreadStatus, { icon: React.ElementType; label: string; className: string }> = {
  open: { icon: AlertCircle, label: "Open", className: "bg-blue-50 text-blue-700 border-blue-100" },
  pending: { icon: Clock, label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-100" },
  closed: { icon: CheckCircle2, label: "Closed", className: "bg-green-50 text-green-700 border-green-100" },
  archived: { icon: Archive, label: "Archived", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

// ─── Link card ────────────────────────────────────────────────────────────────

function LinkCard({
  link,
  onUnlink,
}: {
  link: ThreadLinkSummary;
  onUnlink?: (id: string) => void;
}) {
  const Icon = ENTITY_ICONS[link.entityType];
  const color = ENTITY_COLORS[link.entityType];
  const isSuggested = link.confidence === "suggested";

  return (
    <div
      className={cn(
        "group rounded-xl border p-3 transition-colors",
        isSuggested
          ? "border-dashed border-[#D1D5DB] bg-[#FAFBFC]"
          : "border-[#E2E5EA] bg-white hover:border-[#D1D5DB]"
      )}
      data-testid={`link-card-${link.id}`}
      aria-label={`${isSuggested ? "Suggested link: " : ""}${link.entityLabel}`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}14` }}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isSuggested && (
              <Sparkles className="h-3 w-3 shrink-0 text-[#94A3B8]" aria-label="Suggested" />
            )}
            <p className="truncate text-xs font-semibold text-[#0F172A]">{link.entityLabel}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-[#64748B]">{link.entityRef}</p>
          <p className="mt-0.5 text-[11px] text-[#94A3B8]">{link.entityMeta}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isSuggested && (
            <a
              href="#"
              className="flex h-6 w-6 items-center justify-center rounded text-[#94A3B8] transition-colors hover:text-[#16294D]"
              title={`Open ${link.entityLabel}`}
              aria-label={`Open ${link.entityLabel}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {isSuggested ? (
            <button
              onClick={() => onUnlink?.(link.id)}
              className="rounded-md border border-[#E2E5EA] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#16294D] transition-colors hover:bg-[#F1F3F7]"
              aria-label={`Confirm link to ${link.entityLabel}`}
              data-testid={`confirm-link-${link.id}`}
            >
              Link
            </button>
          ) : (
            <button
              onClick={() => onUnlink?.(link.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-[#94A3B8] opacity-0 transition-colors group-hover:opacity-100 hover:text-[#DC2626]"
              aria-label={`Unlink ${link.entityLabel}`}
              data-testid={`unlink-${link.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Assignment block ─────────────────────────────────────────────────────────

function AssignmentBlock({
  assignee,
  assigneeId,
  status,
  members,
  currentUserId,
  onChangeAssignee,
  onChangeStatus,
}: {
  assignee: string | null;
  assigneeId: string | null;
  status: ThreadStatus;
  members: AssignableMember[];
  currentUserId: string;
  onChangeAssignee: (name: string | null, userId: string | null) => void;
  onChangeStatus: (v: ThreadStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const statusCfg = STATUS_CONFIG[status];
  const statuses: ThreadStatus[] = ["open", "pending", "closed", "archived"];

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = (member: AssignableMember | null) => {
    setOpen(false);
    if (!member) {
      onChangeAssignee(null, null);
      return;
    }
    const label = member.userId === currentUserId ? "You" : member.name;
    onChangeAssignee(label, member.userId);
  };

  return (
    <div className="space-y-3" data-testid="assignment-block">
      {/* Status */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
          Status
        </p>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            return (
              <button
                key={s}
                onClick={() => onChangeStatus(s)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  status === s
                    ? cfg.className
                    : "border-[#E2E5EA] bg-white text-[#64748B] hover:border-[#D1D5DB]"
                )}
                aria-pressed={status === s}
                aria-label={`Set status to ${cfg.label}`}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Assignee */}
      <div ref={dropdownRef} className="relative">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
          Assigned to
        </p>
        {assignee ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-[#E2E5EA] bg-white px-2.5 py-2 text-left transition-colors hover:border-[#D1D5DB]"
            aria-label="Change assignee"
            data-testid="assignee-chip"
          >
            <UserCircle2 className="h-4 w-4 shrink-0 text-[#16294D]" aria-hidden="true" />
            <span className="flex-1 text-xs font-semibold text-[#0F172A]">{assignee}</span>
            <X
              className="h-3.5 w-3.5 shrink-0 text-[#94A3B8] transition-colors hover:text-[#DC2626]"
              aria-label="Unassign"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
            />
          </button>
        ) : (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#D1D5DB] px-2.5 py-2 text-xs text-[#94A3B8] transition-colors hover:border-[#16294D] hover:text-[#16294D]"
            aria-label="Choose assignee"
            data-testid="assign-btn"
          >
            <UserCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Choose assignee…
          </button>
        )}

        {open && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#E2E5EA] bg-white py-1 shadow-lg">
            {/* Self-assign option */}
            <button
              onClick={() =>
                handleSelect({
                  id: "self",
                  userId: currentUserId,
                  name: "You",
                  email: "",
                  avatarUrl: null,
                })
              }
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-[#0F172A] transition-colors hover:bg-[#F1F3F7]"
              data-testid="assign-self-option"
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#16294D]" aria-hidden="true" />
              Assign to me
            </button>

            {members.length > 0 && (
              <>
                <div className="my-1 border-t border-[#F1F3F7]" />
                {members.map((m) => (
                  <button
                    key={m.userId}
                    onClick={() => handleSelect(m)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-[#F1F3F7]",
                      m.userId === assigneeId ? "font-semibold text-[#16294D]" : "text-[#0F172A]"
                    )}
                    data-testid={`assign-option-${m.userId}`}
                  >
                    <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" aria-hidden="true" />
                    {m.name}
                    <span className="ml-auto text-[10px] text-[#94A3B8]">{m.email}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Context panel ────────────────────────────────────────────────────────────

interface MailboxContextPanelProps {
  context: LinkedContextState;
  onPatch: (patch: Partial<LinkedContextState>) => void;
  members: AssignableMember[];
  currentUserId: string;
}

export function MailboxContextPanel({ context, onPatch, members, currentUserId }: MailboxContextPanelProps) {
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [noteExpanded, setNoteExpanded] = useState(false);

  const hasLinks = context.links.length > 0;
  const hasSuggestions = context.suggestions.length > 0;
  const hasAnyContext = hasLinks || hasSuggestions;

  const handleUnlink = (id: string) => {
    onPatch({ links: context.links.filter((l) => l.id !== id) });
  };

  const handleConfirmSuggestion = (id: string) => {
    const suggestion = context.suggestions.find((s) => s.id === id);
    if (!suggestion) return;
    onPatch({
      links: [...context.links, { ...suggestion, confidence: "confirmed" }],
      suggestions: context.suggestions.filter((s) => s.id !== id),
    });
  };

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-l bg-white"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Thread context"
      data-testid="context-panel"
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "#E2E5EA" }}
      >
        <span className="text-xs font-bold text-[#0F172A]">Context</span>
        <Link2 className="h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Assignment + status */}
        <AssignmentBlock
          assignee={context.assignee}
          assigneeId={context.assigneeId}
          status={context.status}
          members={members}
          currentUserId={currentUserId}
          onChangeAssignee={(name, userId) => onPatch({ assignee: name, assigneeId: userId })}
          onChangeStatus={(v) => onPatch({ status: v })}
        />

        <div className="border-t" style={{ borderColor: "#F1F3F7" }} />

        {/* Linked records */}
        <div>
          <button
            className="mb-2 flex w-full items-center justify-between"
            onClick={() => setLinksExpanded((v) => !v)}
            aria-expanded={linksExpanded}
            aria-label="Toggle linked records"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
              Linked records
              {hasLinks && (
                <span className="ml-1.5 rounded-full bg-[#16294D] px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {context.links.length}
                </span>
              )}
            </p>
            {linksExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
            )}
          </button>

          {linksExpanded && (
            <div className="space-y-2">
              {/* Confirmed links */}
              {context.links.map((link) => (
                <LinkCard key={link.id} link={link} onUnlink={handleUnlink} />
              ))}

              {/* Suggested links */}
              {hasSuggestions && (
                <>
                  {hasLinks && (
                    <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                      Suggestions
                    </p>
                  )}
                  {context.suggestions.map((s) => (
                    <LinkCard key={s.id} link={s} onUnlink={handleConfirmSuggestion} />
                  ))}
                </>
              )}

              {/* No links, no suggestions */}
              {!hasAnyContext && (
                <NoLinkedRecordsEmpty />
              )}

              {/* Add link button when links exist */}
              {hasAnyContext && (
                <button
                  className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-[#D1D5DB] px-2.5 py-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:border-[#16294D] hover:text-[#16294D]"
                  aria-label="Add another linked record"
                  data-testid="add-link-btn"
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Add link
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t" style={{ borderColor: "#F1F3F7" }} />

        {/* Internal note */}
        <div>
          <button
            className="mb-2 flex w-full items-center justify-between"
            onClick={() => setNoteExpanded((v) => !v)}
            aria-expanded={noteExpanded}
            aria-label="Toggle internal note"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
              Internal note
            </p>
            {noteExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
            )}
          </button>
          {noteExpanded && (
            <textarea
              value={context.internalNote}
              onChange={(e) => onPatch({ internalNote: e.target.value })}
              placeholder="Add a note visible only to your team…"
              rows={3}
              className="w-full resize-none rounded-lg border border-[#E2E5EA] bg-[#F7F8FB] px-2.5 py-2 text-xs text-[#334155] placeholder-[#94A3B8] outline-none focus:border-[#16294D] focus:ring-1 focus:ring-[rgba(22,41,77,0.12)]"
              aria-label="Internal note"
            />
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Empty context panel ──────────────────────────────────────────────────────

export function MailboxContextPanelEmpty() {
  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col items-center justify-center gap-3 border-l bg-white px-4 text-center"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Thread context"
      data-testid="context-panel-empty"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: "rgba(22,41,77,0.06)" }}
      >
        <Link2 className="h-5 w-5" style={{ color: "#16294D" }} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold text-[#0F172A]">No thread selected</p>
        <p className="mt-0.5 text-[11px] text-[#64748B]">
          Select a thread to see linked records and context.
        </p>
      </div>
    </aside>
  );
}
