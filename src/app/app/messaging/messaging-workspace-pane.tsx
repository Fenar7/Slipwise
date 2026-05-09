"use client";

import { cn } from "@/lib/utils";
import {
  Hash,
  MessageSquare,
  Users,
  CheckSquare,
  Calendar,
  Paperclip,
  ShieldAlert,
  Lock,
  Circle,
  Clock,
  AlertTriangle,
  CalendarCheck,
  FileText,
  FileSpreadsheet,
  Image,
} from "lucide-react";
import type { MessagingSection, TaskStatus, FileCategory, PresenceStatus } from "./types";
import {
  MOCK_CHANNELS,
  MOCK_DMS,
  MOCK_GROUPS,
  MOCK_TASKS,
  MOCK_MEETINGS,
  MOCK_FILES,
  MOCK_ADMIN_ENTRIES,
} from "./mock-data";

interface MessagingWorkspacePaneProps {
  activeSection: MessagingSection;
}

const CARD_BUTTON_CLASS =
  "flex w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function taskStatusLabel(status: TaskStatus) {
  switch (status) {
    case "open": return { label: "Open", color: "text-[#49454F]", bg: "bg-gray-100" };
    case "in-progress": return { label: "In Progress", color: "text-blue-700", bg: "bg-blue-50" };
    case "done": return { label: "Done", color: "text-emerald-700", bg: "bg-emerald-50" };
    case "overdue": return { label: "Overdue", color: "text-[#DC2626]", bg: "bg-red-50" };
  }
}

function fileCategoryIcon(category: FileCategory) {
  switch (category) {
    case "document": return FileText;
    case "spreadsheet": return FileSpreadsheet;
    case "image": return Image;
    default: return Paperclip;
  }
}

function presenceLabel(status: PresenceStatus) {
  switch (status) {
    case "online": return "Online";
    case "away": return "Away";
    case "offline": return "Offline";
  }
}

function presenceColor(status: PresenceStatus) {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "away": return "bg-amber-400";
    case "offline": return "bg-gray-300";
  }
}

// ─── Section: Channels ────────────────────────────────────────────────────────

function ChannelsPane() {
  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-channels">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Channels</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {MOCK_CHANNELS.length} channels · {MOCK_CHANNELS.filter(c => c.visibility === "private").length} private
          </p>
        </div>
        <button
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + New Channel
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_CHANNELS.map((ch) => (
          <button
            type="button"
            key={ch.id}
            className={cn(
              CARD_BUTTON_CLASS,
              "items-start gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
            )}
            style={{ borderColor: "#F0F0F0" }}
            aria-label={`Open ${ch.name} channel`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              {ch.visibility === "private"
                ? <Lock className="h-4 w-4 text-[#79747E]" />
                : <Hash className="h-4 w-4 text-[#79747E]" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold truncate", ch.unreadCount > 0 && "font-bold text-[#1C1B1F]")} style={{ color: "#1C1B1F" }}>
                  #{ch.name}
                </span>
                {ch.visibility === "private" && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#79747E]">Private</span>
                )}
                {ch.isPinned && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Pinned</span>
                )}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: "#79747E" }}>{ch.description}</p>
              <p className="text-[10px] mt-1" style={{ color: "#79747E" }}>{ch.memberCount} members</p>
            </div>
            {ch.unreadCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                {ch.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Direct Messages ─────────────────────────────────────────────────

function DirectMessagesPane() {
  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-dms">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Direct Messages</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {MOCK_DMS.length} conversations
          </p>
        </div>
        <button
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + New Message
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_DMS.map((dm) => (
          <button
            type="button"
            key={dm.id}
            className={cn(
              CARD_BUTTON_CLASS,
              "items-center gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
            )}
            style={{ borderColor: "#F0F0F0" }}
            aria-label={`Open DM with ${dm.participant.name}`}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold" style={{ color: "#49454F" }}>
              {dm.participant.avatarInitials}
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white", presenceColor(dm.participant.presence))} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold", dm.unreadCount > 0 && "font-bold text-[#1C1B1F]")} style={{ color: "#1C1B1F" }}>
                  {dm.participant.name}
                </span>
                <span className="text-[10px]" style={{ color: "#79747E" }}>{presenceLabel(dm.participant.presence)}</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                {dm.participant.role === "admin" ? "Admin" : dm.participant.role === "owner" ? "Owner" : "Member"}
              </p>
            </div>
            {dm.unreadCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                {dm.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Groups ──────────────────────────────────────────────────────────

function GroupsPane() {
  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-groups">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Groups</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {MOCK_GROUPS.length} groups · {MOCK_GROUPS.filter(g => g.isPrivate).length} private
          </p>
        </div>
        <button
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + New Group
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_GROUPS.map((grp) => (
          <button
            type="button"
            key={grp.id}
            className={cn(
              CARD_BUTTON_CLASS,
              "items-start gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
            )}
            style={{ borderColor: "#F0F0F0" }}
            aria-label={`Open ${grp.name} group`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              {grp.isPrivate
                ? <Lock className="h-4 w-4 text-[#79747E]" />
                : <Users className="h-4 w-4 text-[#79747E]" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold", grp.unreadCount > 0 && "font-bold text-[#1C1B1F]")} style={{ color: "#1C1B1F" }}>
                  {grp.name}
                </span>
                {grp.isPrivate && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#79747E]">Private</span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>{grp.memberCount} members</p>
            </div>
            {grp.unreadCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[10px] font-bold text-white">
                {grp.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Tasks ───────────────────────────────────────────────────────────

function TasksPane() {
  const overdueTasks = MOCK_TASKS.filter((t) => t.status === "overdue");
  const openTasks = MOCK_TASKS.filter((t) => t.status === "open");
  const inProgressTasks = MOCK_TASKS.filter((t) => t.status === "in-progress");

  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-tasks">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Tasks</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {MOCK_TASKS.length} tasks · {overdueTasks.length} overdue
          </p>
        </div>
        <button
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + New Task
        </button>
      </div>

      {overdueTasks.length > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
          <span className="text-xs font-semibold text-[#DC2626]">
            {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""} need attention
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_TASKS.map((task) => {
          const { label, color, bg } = taskStatusLabel(task.status);
          return (
            <button
              type="button"
              key={task.id}
              className={cn(
                CARD_BUTTON_CLASS,
                "items-start gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
              )}
              style={{ borderColor: task.status === "overdue" ? "#FCA5A5" : "#F0F0F0" }}
              aria-label={task.title}
            >
              <Circle className={cn("h-4 w-4 mt-0.5 shrink-0", task.status === "overdue" ? "text-[#DC2626]" : "text-[#79747E]")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold", task.status === "overdue" && "text-[#DC2626]")} style={{ color: task.status === "overdue" ? undefined : "#1C1B1F" }}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", bg, color)}>
                    {label}
                  </span>
                  {task.assignee && (
                    <span className="text-[10px]" style={{ color: "#79747E" }}>
                      → {task.assignee.name}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#79747E" }}>
                      <Clock className="h-2.5 w-2.5" />
                      {task.dueDate}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Meetings ────────────────────────────────────────────────────────

function MeetingsPane() {
  const upcoming = MOCK_MEETINGS.filter((m) => m.status === "upcoming");
  const past = MOCK_MEETINGS.filter((m) => m.status === "ended");

  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-meetings">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Meetings</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {upcoming.length} upcoming · Calendar not connected
          </p>
        </div>
        <button
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + Schedule
        </button>
      </div>

      {/* Calendar not connected hint */}
      <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5" style={{ borderColor: "#E0E0E0" }}>
        <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
        <span className="text-xs" style={{ color: "#79747E" }}>
          Connect Google Calendar to sync meetings automatically
        </span>
        <button className="ml-auto text-xs font-semibold text-[#DC2626] hover:underline">Connect</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {upcoming.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#79747E" }}>Upcoming</p>
            <div className="space-y-2">
              {upcoming.map((meet) => (
                <button
                  type="button"
                  key={meet.id}
                  className={cn(
                    CARD_BUTTON_CLASS,
                    "items-start gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
                  )}
                  style={{ borderColor: "#F0F0F0" }}
                  aria-label={meet.title}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{meet.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {meet.participantCount} participants · {meet.durationMinutes} min
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {past.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#79747E" }}>Past</p>
            <div className="space-y-2">
              {past.map((meet) => (
                <button
                  type="button"
                  key={meet.id}
                  className={cn(
                    CARD_BUTTON_CLASS,
                    "items-start gap-3 rounded-xl border p-4 opacity-60"
                  )}
                  style={{ borderColor: "#F0F0F0" }}
                  aria-label={meet.title}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Calendar className="h-4 w-4 text-[#79747E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{meet.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {meet.participantCount} participants · Ended
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Files ───────────────────────────────────────────────────────────

function FilesPane() {
  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-files">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Files</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {MOCK_FILES.length} shared files
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_FILES.map((file) => {
          const FileIcon = fileCategoryIcon(file.category);
          return (
            <button
              type="button"
              key={file.id}
              className={cn(
                CARD_BUTTON_CLASS,
                "items-center gap-3 rounded-xl border p-4 hover:border-[#DC2626] hover:bg-red-50/30"
              )}
              style={{ borderColor: "#F0F0F0" }}
              aria-label={file.name}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <FileIcon className="h-4 w-4 text-[#79747E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#1C1B1F" }}>{file.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                  {file.sizeLabel} · {file.uploadedBy}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Admin / Governance ─────────────────────────────────────────────

function AdminPane() {
  return (
    <div className="flex flex-col h-full" data-testid="messaging-pane-admin">
      <div className="flex items-center gap-3 border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Admin &amp; Governance</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            Restricted to org admins and owners
          </p>
        </div>
      </div>

      {/* Role restriction notice */}
      <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
        <p className="text-xs text-amber-700">
          These settings affect all members of your organization. Changes are logged in the audit trail.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {MOCK_ADMIN_ENTRIES.map((entry) => (
          <button
            type="button"
            key={entry.area}
            className={cn(
              CARD_BUTTON_CLASS,
              "items-start gap-3 rounded-xl border p-4 hover:border-amber-300 hover:bg-amber-50/50 focus-visible:ring-amber-400"
            )}
            style={{ borderColor: "#F0F0F0" }}
            aria-label={entry.label}
            data-testid={`admin-pane-entry-${entry.area}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{entry.label}</p>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 capitalize">
                  {entry.requiresRole}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>{entry.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Default: no section selected ────────────────────────────────────────────

function DefaultPane() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center" data-testid="messaging-pane-default">
      <MessageSquare className="h-10 w-10" style={{ color: "#E0E0E0" }} />
      <p className="text-sm font-semibold" style={{ color: "#49454F" }}>
        Select a section to get started
      </p>
      <p className="text-xs" style={{ color: "#79747E" }}>
        Choose Channels, Direct Messages, Groups, Tasks, Meetings, or Files from the left rail.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessagingWorkspacePane({ activeSection }: MessagingWorkspacePaneProps) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" data-testid="messaging-workspace-pane">
      {activeSection === "channels" && <ChannelsPane />}
      {activeSection === "dms" && <DirectMessagesPane />}
      {activeSection === "groups" && <GroupsPane />}
      {activeSection === "tasks" && <TasksPane />}
      {activeSection === "meetings" && <MeetingsPane />}
      {activeSection === "files" && <FilesPane />}
      {activeSection === "admin" && <AdminPane />}
    </div>
  );
}
