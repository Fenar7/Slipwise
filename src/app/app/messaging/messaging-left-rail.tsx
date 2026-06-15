"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Hash,
  MessageSquare,
  Users,
  CheckSquare,
  Calendar,
  Paperclip,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Lock,
  Circle,
  Inbox,
} from "lucide-react";
import type { MessagingSection, PresenceStatus } from "./types";
import {
  MOCK_CHANNELS,
  MOCK_DMS,
  MOCK_GROUPS,
  MOCK_TASKS,
  MOCK_MEETINGS,
  MOCK_FILES,
  MOCK_UNREAD_SUMMARY,
} from "./mock-data";

interface MessagingLeftRailProps {
  activeSection: MessagingSection;
  onSectionChange: (section: MessagingSection) => void;
}

const ROW_BUTTON_CLASS =
  "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1";

// ─── Presence dot ─────────────────────────────────────────────────────────────

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-400",
        status === "offline" && "bg-gray-300"
      )}
      aria-label={status}
    />
  );
}

// ─── Unread badge ─────────────────────────────────────────────────────────────

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white"
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ElementType;
  label: string;
  section: MessagingSection;
  activeSection: MessagingSection;
  unreadCount?: number;
  onSelect: (section: MessagingSection) => void;
  isExpanded: boolean;
  onToggle: () => void;
  adminOnly?: boolean;
}

function SectionHeader({
  icon: Icon,
  label,
  section,
  activeSection,
  unreadCount = 0,
  onSelect,
  isExpanded,
  onToggle,
  adminOnly = false,
}: SectionHeaderProps) {
  const isActive = activeSection === section;
  const handleActivate = () => {
    onSelect(section);
    onToggle();
  };

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1",
        isActive
          ? "bg-red-50 text-[#DC2626]"
          : "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
      )}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }}
      aria-expanded={isExpanded}
      aria-label={`${label} section`}
      data-testid={`messaging-section-${section}`}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          isActive ? "text-[#DC2626]" : "text-[#79747E] group-hover:text-[#DC2626]"
        )}
      />
      <span className={cn("flex-1 text-xs font-semibold uppercase tracking-wide", isActive && "font-bold")}>
        {label}
      </span>
      {adminOnly && (
        <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label="Admin only" />
      )}
      {unreadCount > 0 && !isExpanded && <UnreadBadge count={unreadCount} />}
      {isExpanded ? (
        <ChevronDown className="h-3 w-3 shrink-0 text-[#79747E]" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0 text-[#79747E]" />
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessagingLeftRail({ activeSection, onSectionChange }: MessagingLeftRailProps) {
  // Local expand state — each section can be independently expanded
  const [expanded, setExpanded] = React.useState<Record<MessagingSection, boolean>>({
    channels: true,
    dms: true,
    groups: false,
    tasks: false,
    meetings: false,
    files: false,
    admin: false,
  });

  const toggle = (section: MessagingSection) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const overdueTaskCount = MOCK_TASKS.filter((t) => t.status === "overdue").length;

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col border-r bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      aria-label="Messaging navigation"
      data-testid="messaging-left-rail"
    >
      {/* Rail header — contextual workspace identity */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "#E0E0E0" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f8f9fc] border" style={{ borderColor: "#E0E0E0" }}>
            <Inbox className="h-3.5 w-3.5 text-[#79747E]" />
          </div>
          <div>
            <span className="text-xs font-semibold" style={{ color: "#1C1B1F" }}>
              Messages
            </span>
            <span className="ml-1.5 text-[10px] font-medium" style={{ color: "#79747E" }}>
              {MOCK_UNREAD_SUMMARY.channels + MOCK_UNREAD_SUMMARY.dms + MOCK_UNREAD_SUMMARY.groups} unread
            </span>
          </div>
        </div>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626] text-[9px] font-bold text-white">
          {MOCK_UNREAD_SUMMARY.channels + MOCK_UNREAD_SUMMARY.dms + MOCK_UNREAD_SUMMARY.groups}
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label="Messaging sections">

        {/* ── Channels ── */}
        <SectionHeader
          icon={Hash}
          label="Channels"
          section="channels"
          activeSection={activeSection}
          unreadCount={MOCK_UNREAD_SUMMARY.channels}
          onSelect={onSectionChange}
          isExpanded={expanded.channels}
          onToggle={() => toggle("channels")}
        />
        {expanded.channels && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_CHANNELS.map((ch) => (
              <li key={ch.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
                  )}
                  aria-label={`${ch.name} channel`}
                >
                  {ch.visibility === "private" ? (
                    <Lock className="h-3 w-3 shrink-0 text-[#79747E]" />
                  ) : (
                    <Hash className="h-3 w-3 shrink-0 text-[#79747E]" />
                  )}
                  <span className={cn("flex-1 truncate font-medium", ch.unreadCount > 0 && "font-bold text-[#1C1B1F]")}>
                    {ch.name}
                  </span>
                  <UnreadBadge count={ch.unreadCount} />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(
                  ROW_BUTTON_CLASS,
                  "text-[#79747E] hover:text-[#DC2626]"
                )}
                aria-label="Browse all channels"
              >
                <span className="font-medium">Browse channels…</span>
              </button>
            </li>
          </ul>
        )}

        {/* ── Direct Messages ── */}
        <SectionHeader
          icon={MessageSquare}
          label="Direct Messages"
          section="dms"
          activeSection={activeSection}
          unreadCount={MOCK_UNREAD_SUMMARY.dms}
          onSelect={onSectionChange}
          isExpanded={expanded.dms}
          onToggle={() => toggle("dms")}
        />
        {expanded.dms && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_DMS.map((dm) => (
              <li key={dm.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
                  )}
                  aria-label={`DM with ${dm.participant.name}`}
                >
                  <PresenceDot status={dm.participant.presence} />
                  <span className={cn("flex-1 truncate font-medium", dm.unreadCount > 0 && "font-bold text-[#1C1B1F]")}>
                    {dm.participant.name}
                  </span>
                  <UnreadBadge count={dm.unreadCount} />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(
                  ROW_BUTTON_CLASS,
                  "text-[#79747E] hover:text-[#DC2626]"
                )}
                aria-label="New direct message"
              >
                <span className="font-medium">New message…</span>
              </button>
            </li>
          </ul>
        )}

        {/* ── Groups ── */}
        <SectionHeader
          icon={Users}
          label="Groups"
          section="groups"
          activeSection={activeSection}
          unreadCount={MOCK_UNREAD_SUMMARY.groups}
          onSelect={onSectionChange}
          isExpanded={expanded.groups}
          onToggle={() => toggle("groups")}
        />
        {expanded.groups && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_GROUPS.map((grp) => (
              <li key={grp.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
                  )}
                  aria-label={`${grp.name} group`}
                >
                  {grp.isPrivate ? (
                    <Lock className="h-3 w-3 shrink-0 text-[#79747E]" />
                  ) : (
                    <Users className="h-3 w-3 shrink-0 text-[#79747E]" />
                  )}
                  <span className={cn("flex-1 truncate font-medium", grp.unreadCount > 0 && "font-bold text-[#1C1B1F]")}>
                    {grp.name}
                  </span>
                  <UnreadBadge count={grp.unreadCount} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* ── Tasks ── */}
        <SectionHeader
          icon={CheckSquare}
          label="Tasks"
          section="tasks"
          activeSection={activeSection}
          unreadCount={overdueTaskCount}
          onSelect={onSectionChange}
          isExpanded={expanded.tasks}
          onToggle={() => toggle("tasks")}
        />
        {expanded.tasks && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_TASKS.slice(0, 3).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50"
                  )}
                  aria-label={task.title}
                >
                  <Circle
                    className={cn(
                      "h-3 w-3 shrink-0",
                      task.status === "overdue" ? "text-[#DC2626]" : "text-[#79747E]"
                    )}
                  />
                  <span className={cn("flex-1 truncate font-medium", task.status === "overdue" && "text-[#DC2626]")}>
                    {task.title}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(
                  ROW_BUTTON_CLASS,
                  "text-[#79747E] hover:text-[#DC2626]"
                )}
              >
                <span className="font-medium">View all tasks…</span>
              </button>
            </li>
          </ul>
        )}

        {/* ── Meetings ── */}
        <SectionHeader
          icon={Calendar}
          label="Meetings"
          section="meetings"
          activeSection={activeSection}
          unreadCount={MOCK_UNREAD_SUMMARY.meetings}
          onSelect={onSectionChange}
          isExpanded={expanded.meetings}
          onToggle={() => toggle("meetings")}
        />
        {expanded.meetings && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_MEETINGS.filter((m) => m.status === "upcoming").map((meet) => (
              <li key={meet.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50"
                  )}
                  aria-label={meet.title}
                >
                  <Calendar className="h-3 w-3 shrink-0 text-[#79747E]" />
                  <span className="flex-1 truncate font-medium">{meet.title}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(
                  ROW_BUTTON_CLASS,
                  "text-[#79747E] hover:text-[#DC2626]"
                )}
              >
                <span className="font-medium">Schedule meeting…</span>
              </button>
            </li>
          </ul>
        )}

        {/* ── Files ── */}
        <SectionHeader
          icon={Paperclip}
          label="Files"
          section="files"
          activeSection={activeSection}
          onSelect={onSectionChange}
          isExpanded={expanded.files}
          onToggle={() => toggle("files")}
        />
        {expanded.files && (
          <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
            {MOCK_FILES.slice(0, 3).map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className={cn(
                    ROW_BUTTON_CLASS,
                    "text-[#49454F] hover:bg-gray-50"
                  )}
                  aria-label={file.name}
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-[#79747E]" />
                  <span className="flex-1 truncate font-medium">{file.name}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(
                  ROW_BUTTON_CLASS,
                  "text-[#79747E] hover:text-[#DC2626]"
                )}
              >
                <span className="font-medium">Browse all files…</span>
              </button>
            </li>
          </ul>
        )}

        {/* ── Admin / Governance — visually separated ── */}
        <div className="pt-2 mt-2 border-t" style={{ borderColor: "#F0F0F0" }}>
          <SectionHeader
            icon={ShieldAlert}
            label="Admin"
            section="admin"
            activeSection={activeSection}
            onSelect={onSectionChange}
            isExpanded={expanded.admin}
            onToggle={() => toggle("admin")}
            adminOnly
          />
          {expanded.admin && (
            <ul className="ml-4 space-y-0.5 border-l pl-2" style={{ borderColor: "#F0F0F0" }}>
              {[
                { label: "Channel Policy", href: "#channel-policy" },
                { label: "Retention & Export", href: "#retention" },
                { label: "Moderation", href: "#moderation" },
                { label: "Audit Log", href: "#audit-log" },
                { label: "Member Governance", href: "#member-governance" },
              ].map((entry) => (
                <li key={entry.href}>
                  <button
                    type="button"
                    className={cn(
                      ROW_BUTTON_CLASS,
                      "text-[#49454F] hover:bg-amber-50 hover:text-amber-700"
                    )}
                    aria-label={entry.label}
                    data-testid={`admin-entry-${entry.href.replace("#", "")}`}
                  >
                    <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" />
                    <span className="font-medium">{entry.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
