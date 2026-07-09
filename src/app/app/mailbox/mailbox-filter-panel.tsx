"use client";

import { X, SlidersHorizontal, Mailbox, UserCircle2, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveFilter, ActiveFilterState, MailboxConnection } from "./types";

interface MailboxFilterPanelProps {
  panelId: string;
  open: boolean;
  activeConnection: MailboxConnection | null;
  viewLabel: string;
  filterState: ActiveFilterState;
  draftState: ActiveFilterState;
  connections: MailboxConnection[];
  onToggleDraftFilter: (filter: ActiveFilter) => void;
  onClearDraft: () => void;
  onApply: () => void;
  onClose: () => void;
}

function FilterOption({
  label,
  active,
  onClick,
  disabled = false,
  testId,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        disabled
          ? "cursor-not-allowed border-[#E2E5EA] bg-[#F7F8FB] text-[#94A3B8]"
          : active
          ? "border-[#16294D] bg-[#16294D] text-white"
          : "border-[#E2E5EA] bg-white text-[#64748B] hover:border-[#D1D5DB] hover:text-[#0F172A]"
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function hasDraftFilter(state: ActiveFilterState, field: string, value: string) {
  return state.filters.some((filter) => filter.field === field && filter.value === value);
}

export function MailboxFilterPanel({
  panelId,
  open,
  activeConnection,
  viewLabel,
  filterState,
  draftState,
  connections,
  onToggleDraftFilter,
  onClearDraft,
  onApply,
  onClose,
}: MailboxFilterPanelProps) {
  if (!open) return null;

  const activeDraftCount = draftState.filters.length;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-black/20 md:bg-transparent"
        aria-label="Close filter panel"
        data-testid="mailbox-filter-panel-backdrop"
        onClick={onClose}
      />

      <section
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Filter threads"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] flex-col rounded-t-2xl border border-[#E2E5EA] bg-white shadow-[0_-12px_32px_rgba(15,23,42,0.16)] md:absolute md:right-3 md:top-[calc(100%+8px)] md:inset-x-auto md:bottom-auto md:w-[360px] md:max-h-[min(70vh,560px)] md:rounded-2xl md:shadow-xl"
        data-testid="mailbox-filter-panel"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#16294D]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#0F172A]">Filter threads</h3>
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              {activeConnection
                ? `Filtering inside ${viewLabel}. Mailbox scope is fixed by this route.`
                : `Refine ${viewLabel} without leaving the current mailbox view.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            aria-label="Close filter panel header"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <Section icon={Mailbox} label="Mailbox scope">
            {activeConnection ? (
              <FilterOption
                label={activeConnection.displayName}
                active
                disabled
                testId="filter-option-mailbox-fixed"
              />
            ) : (
              <>
                <FilterOption
                  label="All mailboxes"
                  active={!draftState.filters.some((filter) => filter.field === "mailbox")}
                  testId="filter-option-mailbox-all"
                  onClick={() => {
                    draftState.filters
                      .filter((filter) => filter.field === "mailbox")
                      .forEach((filter) => onToggleDraftFilter(filter));
                  }}
                />
                {connections.map((connection) => {
                  const filter = {
                    field: "mailbox" as const,
                    value: connection.id,
                    label: connection.displayName,
                  };

                  return (
                    <FilterOption
                      key={connection.id}
                      label={connection.displayName}
                      active={hasDraftFilter(draftState, "mailbox", connection.id)}
                      testId={`filter-option-mailbox-${connection.slug}`}
                      onClick={() => onToggleDraftFilter(filter)}
                    />
                  );
                })}
              </>
            )}
          </Section>

          <Section icon={UserCircle2} label="Assignment">
            <FilterOption
              label="Assigned to me"
              active={hasDraftFilter(draftState, "assignee", "me")}
              testId="filter-option-assignee-me"
              onClick={() =>
                onToggleDraftFilter({ field: "assignee", value: "me", label: "Assigned to me" })
              }
            />
            <FilterOption
              label="Unassigned"
              active={hasDraftFilter(draftState, "assignee", "none")}
              testId="filter-option-assignee-none"
              onClick={() =>
                onToggleDraftFilter({ field: "assignee", value: "none", label: "Unassigned" })
              }
            />
          </Section>

          <Section icon={CircleDot} label="Status">
            <FilterOption
              label="Open"
              active={hasDraftFilter(draftState, "status", "open")}
              testId="filter-option-status-open"
              onClick={() => onToggleDraftFilter({ field: "status", value: "open", label: "Open" })}
            />
            <FilterOption
              label="Pending"
              active={hasDraftFilter(draftState, "status", "pending")}
              testId="filter-option-status-pending"
              onClick={() =>
                onToggleDraftFilter({ field: "status", value: "pending", label: "Pending" })
              }
            />
            <FilterOption
              label="Closed"
              active={hasDraftFilter(draftState, "status", "closed")}
              testId="filter-option-status-closed"
              onClick={() =>
                onToggleDraftFilter({ field: "status", value: "closed", label: "Closed" })
              }
            />
          </Section>

          <Section icon={CircleDot} label="Message state">
            <FilterOption
              label="Unread"
              active={hasDraftFilter(draftState, "unread", "true")}
              testId="filter-option-unread"
              onClick={() =>
                onToggleDraftFilter({ field: "unread", value: "true", label: "Unread" })
              }
            />
            <FilterOption
              label="Flagged"
              active={hasDraftFilter(draftState, "flagged", "true")}
              testId="filter-option-flagged"
              onClick={() =>
                onToggleDraftFilter({ field: "flagged", value: "true", label: "Flagged" })
              }
            />
          </Section>

        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
          <button
            type="button"
            onClick={onClearDraft}
            className="text-xs font-semibold text-[#64748B] transition-colors hover:text-[#DC2626]"
            disabled={activeDraftCount === 0 && filterState.filters.length === 0}
          >
            Clear all
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E5EA] px-3 py-1.5 text-xs font-semibold text-[#64748B] transition-colors hover:bg-[#F7F8FB]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className="rounded-lg bg-[#16294D] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              Apply filters
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
