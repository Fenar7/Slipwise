"use client";

import React, { useState } from "react";
import { AlertTriangle, Clock, Link, MoreHorizontal, ArrowLeft, Plus, CheckSquare, MessageSquare, Archive, Lock, Bell, RotateCcw, X, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingTaskCreate } from "./messaging-task-create";
import type { TaskFilterStatus, TaskPriority, MessagingTaskDetail, MessagingTask, MessagingParticipant, TaskStatus } from "./types";
import { useConversationTasks } from "./lib/use-conversation-tasks";
import { useConversationDetail } from "./lib/use-conversation-detail";
import type { ApiTaskSummary, ApiConversationDetail } from "./lib/mappers";

/** Map UI filter values to server-side scope parameters. */
function scopeForFilter(filter: TaskFilterStatus): string | undefined {
  switch (filter) {
    case "assigned": return "assigned";
    case "created": return "created";
    case "due-soon": return "due_soon";
    case "open": return "open";
    case "in-progress": return "in_progress";
    case "done": return "done";
    case "cancelled": return "cancelled";
    case "overdue": return "overdue";
    default: return undefined;
  }
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned to Me" },
  { value: "created", label: "Created by Me" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "due-soon", label: "Due Soon" },
  { value: "overdue", label: "Overdue" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

function priorityStrip(p: TaskPriority) {
  switch (p) {
    case "low": return "bg-gray-400";
    case "medium": return "bg-amber-400";
    case "high": return "bg-orange-500";
    case "critical": return "bg-[#DC2626]";
  }
}

function priorityBadge(p: TaskPriority) {
  switch (p) {
    case "low": return "bg-gray-100 text-gray-600";
    case "medium": return "bg-amber-100 text-amber-700";
    case "high": return "bg-orange-100 text-orange-700";
    case "critical": return "bg-red-100 text-[#DC2626]";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "open": return { label: "Open", cls: "bg-gray-100 text-[#49454F]" };
    case "in-progress": return { label: "In Progress", cls: "bg-blue-50 text-blue-700" };
    case "done": return { label: "Done", cls: "bg-emerald-50 text-emerald-700" };
    case "overdue": return { label: "Overdue", cls: "bg-red-50 text-[#DC2626]" };
    case "cancelled": return { label: "Cancelled", cls: "bg-gray-100 text-gray-400 line-through" };
    default: return { label: status, cls: "bg-gray-100 text-gray-600" };
  }
}

interface TaskDetailPanelProps {
  task: MessagingTaskDetail;
  onBack: () => void;
  participants?: MessagingParticipant[];
  onUpdateStatus?: (status: TaskStatus) => Promise<void>;
  onAssign?: (assigneeId: string) => Promise<void>;
  onNavigateToOrigin?: (conversationId: string, messageId: string | null) => void;
  onEditTask?: (updates: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueDate: string | null;
    reminderAt: string | null;
    assigneeId: string | null;
    status: TaskStatus;
  }) => Promise<void>;
  readOnly?: boolean;
  archived?: boolean;
  locked?: boolean;
}

function TaskDetailPanel({
  task,
  onBack,
  participants,
  onUpdateStatus,
  onAssign,
  onNavigateToOrigin,
  onEditTask,
  readOnly = false,
  archived = false,
  locked = false,
}: TaskDetailPanelProps) {
  const { label, cls } = statusBadge(task.status);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit details form states
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? "");
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? "");
  const [editReminderAt, setEditReminderAt] = useState(task.reminderAt ?? "");
  const [editAssigneeId, setEditAssigneeId] = useState(task.assignee?.id ?? "");
  const [editStatus, setEditStatus] = useState<TaskStatus>(task.dbStatus ?? task.status);

  // Sync edit details when task changes (no stale selection bugs)
  React.useEffect(() => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ?? "");
    setEditReminderAt(task.reminderAt ?? "");
    setEditAssigneeId(task.assignee?.id ?? "");
    setEditStatus(task.dbStatus ?? task.status);
    setIsEditing(false);
    setError(null);
  }, [task]);

  const handleUpdateStatus = async (newStatus: TaskStatus) => {
    if (!onUpdateStatus) return;
    setUpdating(true);
    setError(null);
    try {
      await onUpdateStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async (assigneeId: string) => {
    if (!onAssign) return;
    setUpdating(true);
    setError(null);
    try {
      await onAssign(assigneeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign task");
    } finally {
      setUpdating(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col h-full" data-testid="task-edit-panel">
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
          <button
            type="button"
            data-testid="task-edit-back"
            onClick={() => setIsEditing(false)}
            disabled={updating}
            className="rounded-lg p-1.5 hover:bg-gray-100 focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "#49454F" }} />
          </button>
          <h2 className="text-base font-bold truncate flex-1" style={{ color: "#1C1B1F" }}>Edit Task</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-[#DC2626]" data-testid="task-edit-error">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>
              Task title <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              data-testid="task-edit-title"
              value={editTitle}
              disabled={updating}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Description</label>
            <textarea
              data-testid="task-edit-description"
              rows={3}
              value={editDescription}
              disabled={updating}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add more context…"
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#1C1B1F" }}>Priority</label>
            <select
              data-testid="task-edit-priority"
              value={editPriority}
              disabled={updating}
              onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Status</label>
            <select
              data-testid="task-edit-status"
              value={editStatus}
              disabled={updating}
              onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            >
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Assignee</label>
            <select
              data-testid="task-edit-assignee"
              value={editAssigneeId}
              disabled={updating}
              onChange={(e) => setEditAssigneeId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            >
              <option value="">Unassigned</option>
              {participants?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Due date</label>
            <input
              type="date"
              data-testid="task-edit-due-date"
              value={editDueDate}
              disabled={updating}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Reminder */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Reminder</label>
            <input
              type="datetime-local"
              data-testid="task-edit-reminder-at"
              value={editReminderAt}
              disabled={updating}
              onChange={(e) => setEditReminderAt(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-6 py-4 justify-end" style={{ borderColor: "#E0E0E0" }}>
          <button
            type="button"
            data-testid="task-edit-cancel"
            disabled={updating}
            onClick={() => setIsEditing(false)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="task-edit-save"
            disabled={updating || !editTitle.trim()}
            onClick={async () => {
              setUpdating(true);
              setError(null);
              try {
                if (onEditTask) {
                  await onEditTask({
                    title: editTitle.trim(),
                    description: editDescription.trim() || null,
                    priority: editPriority,
                    dueDate: editDueDate || null,
                    reminderAt: editReminderAt || null,
                    assigneeId: editAssigneeId || null,
                    status: editStatus,
                  });
                  setIsEditing(false);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save changes");
              } finally {
                setUpdating(false);
              }
            }}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold text-white",
              editTitle.trim() && !updating ? "bg-[#DC2626] hover:bg-red-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {updating ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="task-detail-panel">
      <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <button
          type="button"
          data-testid="task-detail-back"
          onClick={onBack}
          aria-label="Back to task list"
          className="rounded-lg p-1.5 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
        >
          <ArrowLeft className="h-4 w-4" style={{ color: "#49454F" }} />
        </button>
        <h2 className="text-base font-bold truncate flex-1" style={{ color: "#1C1B1F" }}>{task.title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-[#DC2626]">
            {error}
          </div>
        )}

        {/* Archived / Locked banner */}
        {(archived || locked) && (
          <div
            className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
            data-testid="task-detail-readonly-banner"
          >
            {archived && <Archive className="h-3.5 w-3.5 shrink-0" />}
            {locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
            <span className="font-semibold">
              {archived && locked ? "This conversation is archived and locked." : archived ? "This conversation is archived." : "This conversation is locked."}
              {" Task details are read-only."}
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", priorityBadge(task.priority))}>
            {task.priority}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{label}</span>
        </div>

        {/* Assignee */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#79747E" }}>Assignee</p>
          {participants && participants.length > 0 ? (
            <select
              value={task.assignee?.id ?? ""}
              disabled={updating || readOnly}
              onChange={(e) => handleAssign(e.target.value)}
              className="text-sm rounded-lg border px-3 py-1.5 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            >
              <option value="">Unassigned</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : task.assignee ? (
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold" style={{ color: "#49454F" }}>
                {task.assignee.avatarInitials}
              </span>
              <span className="text-sm" style={{ color: "#1C1B1F" }}>{task.assignee.name}</span>
            </div>
          ) : (
            <span className="text-sm" style={{ color: "#79747E" }}>Unassigned</span>
          )}
        </div>

        {/* Due date */}
        {task.dueDate && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#79747E" }}>Due date</p>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
              <span className="text-sm" style={{ color: "#1C1B1F" }}>{task.dueDate}</span>
            </div>
          </div>
        )}

        {/* Reminder */}
        {task.reminderAt && (
          <div data-testid="task-detail-reminder">
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#79747E" }}>Reminder</p>
            <div className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
              <span className="text-sm" style={{ color: "#1C1B1F" }}>{new Date(task.reminderAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#79747E" }}>Description</p>
            <p className="text-sm" style={{ color: "#1C1B1F" }}>{task.description}</p>
          </div>
        )}

        {/* Originating message link */}
        {task.originatingMessageId && task.conversationRef && onNavigateToOrigin && (
          <button
            type="button"
            data-testid="task-origin-link"
            onClick={() => onNavigateToOrigin(task.conversationRef!, task.originatingMessageId!)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-50 border px-3 py-2 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0" }}
          >
            <Link className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
            <span className="text-xs font-medium" style={{ color: "#2563EB" }}>
              View originating message
            </span>
          </button>
        )}

        {/* Conversation reference tag */}
        {task.conversationName && task.conversationRef && onNavigateToOrigin && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#79747E" }}>Conversation</p>
            <button
              type="button"
              data-testid="task-detail-conv-link"
              onClick={() => onNavigateToOrigin(task.conversationRef!, task.originatingMessageId ?? null)}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-left hover:bg-red-100/50 hover:border-red-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            >
              <MessageSquare className="h-3.5 w-3.5 text-[#DC2626]" />
              <span className="text-xs font-semibold text-[#DC2626]">
                Go to {task.conversationType === "CHANNEL" ? `#${task.conversationName}` : task.conversationName}
              </span>
            </button>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs space-y-0.5" style={{ color: "#79747E" }}>
          <p>Created by <span className="font-semibold">{task.createdBy}</span></p>
          <p>{new Date(task.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        {task.status !== "done" && !readOnly && (
          <button
            type="button"
            data-testid="task-mark-done"
            disabled={updating}
            onClick={() => handleUpdateStatus("done")}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            Mark as done
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            data-testid="task-detail-edit"
            disabled={updating}
            onClick={() => setIsEditing(true)}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            Edit details
          </button>
        )}
      </div>
    </div>
  );
}

interface MessagingTaskPanelProps {
  conversationId?: string | null;
  onNavigateToOrigin?: (conversationId: string, messageId: string | null) => void;
}

export function MessagingTaskPanel({ conversationId, onNavigateToOrigin }: MessagingTaskPanelProps) {
  const [filter, setFilter] = useState<TaskFilterStatus>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [dynamicParticipants, setDynamicParticipants] = useState<MessagingParticipant[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [selectedTaskConvDetail, setSelectedTaskConvDetail] = useState<ApiConversationDetail | null>(null);
  const [selectedTaskConvError, setSelectedTaskConvError] = useState<"none" | "restricted" | "network" | "unknown">("none");

  // Server-side scope for the current filter (only used in global mode)
  const activeScope = scopeForFilter(filter);

  // Hook up data hooks first
  const targetId = conversationId || "global";
  const {
    tasks: apiTasks,
    loading: tasksLoading,
    errorType: tasksError,
    refresh: refreshTasks,
  } = useConversationTasks(targetId, conversationId ? undefined : { scope: activeScope });

  const {
    detail: conversationDetail,
    loading: detailLoading,
    errorType: detailErrorType,
  } = useConversationDetail(conversationId ?? null);

  const conversationReadOnly = Boolean(
    conversationDetail && (conversationDetail.archivedAt != null || conversationDetail.lockedAt != null)
  );
  const conversationArchived = conversationDetail?.archivedAt != null;
  const conversationLocked = conversationDetail?.lockedAt != null;

  // Effects after all hook declarations
  React.useEffect(() => {
    setSelectedTaskId(null);
    setDynamicParticipants(null);
    setSelectedTaskConvDetail(null);
    setSelectedTaskConvError("none");
    setShowCreate(false);
  }, [conversationId]);

  // Clear selection when filter changes to avoid stale task references
  React.useEffect(() => {
    setSelectedTaskId(null);
    setDynamicParticipants(null);
    setSelectedTaskConvDetail(null);
    setSelectedTaskConvError("none");
  }, [filter]);

  React.useEffect(() => {
    if (detailErrorType === "restricted") {
      setSelectedTaskId(null);
      setDynamicParticipants(null);
      setSelectedTaskConvDetail(null);
      setSelectedTaskConvError("none");
      setShowCreate(false);
    }
  }, [detailErrorType]);

  // Extract participants list
  const participantsList: MessagingParticipant[] = React.useMemo(() => {
    if (!conversationDetail) return [];
    const profilesMap = new Map(
      conversationDetail.participantProfiles?.map((p) => [p.userId, p]) ?? []
    );
    return conversationDetail.participants.map((p) => {
      const prof = profilesMap.get(p.userId);
      const name = prof?.name ?? p.displayName ?? `User ${p.userId.slice(0, 4)}`;
      return {
        id: p.userId,
        name,
        avatarInitials: prof?.avatarInitials ?? name.slice(0, 2).toUpperCase(),
        role: (p.role === "owner" || p.role === "admin" ? p.role : "member") as "owner" | "admin" | "member",
        presence: "online" as const,
      };
    });
  }, [conversationDetail]);

  const mapApiTaskToFrontend = React.useCallback((t: ApiTaskSummary): MessagingTaskDetail => {
    const isOverdue = t.isOverdue || t.status === "OVERDUE";
    const dbStatus = t.status.toLowerCase().replace("_", "-") as TaskStatus;
    const status = isOverdue ? "overdue" : dbStatus;
    return {
      id: t.id,
      title: t.title,
      assignee: t.assigneeId
        ? {
            id: t.assigneeId,
            name: t.assigneeName ?? "Unknown Assignee",
            avatarInitials: t.assigneeAvatarInitials ?? "UA",
            role: "member",
            presence: "online",
          }
        : null,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : null,
      reminderAt: t.reminderAt ?? null,
      reminderSentAt: t.reminderSentAt ?? undefined,
      status,
      conversationRef: t.conversationId,
      priority: t.priority,
      description: t.description,
      createdAt: t.createdAt,
      createdBy: t.createdByName ?? t.createdBy,
      originatingMessageId: t.originatingMessageId,
      dbStatus,
      conversationName: t.conversationName,
      conversationType: t.conversationType,
    };
  }, []);

  // Map API tasks to UI shape
  const listTasks: MessagingTaskDetail[] = React.useMemo(() => {
    return (apiTasks ?? []).map(mapApiTaskToFrontend);
  }, [apiTasks, mapApiTaskToFrontend]);

  // Load selected-task conversation detail (and participants) dynamically in global mode
  React.useEffect(() => {
    if (!selectedTaskId || conversationId) {
      setDynamicParticipants(null);
      setSelectedTaskConvDetail(null);
      setSelectedTaskConvError("none");
      return;
    }
    const task = listTasks.find((t) => t.id === selectedTaskId);
    if (!task || !task.conversationRef) return;

    setLoadingParticipants(true);
    setSelectedTaskConvError("none");
    fetch(`/api/messaging/conversations/${task.conversationRef}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.success) {
          const code = payload.error?.code ?? "";
          const status = payload.error?.status ?? 0;
          if (status === 404 || code === "NOT_FOUND" || status === 403 || code === "FORBIDDEN") {
            setSelectedTaskConvError("restricted");
          } else {
            setSelectedTaskConvError("unknown");
          }
          setSelectedTaskConvDetail(null);
          setDynamicParticipants(null);
          return;
        }
        const detail: ApiConversationDetail = payload.data;
        setSelectedTaskConvDetail(detail);
        const profilesMap = new Map(
          detail.participantProfiles?.map((p) => [p.userId, p]) ?? []
        );
        const list = detail.participants.map((p) => {
          const prof = profilesMap.get(p.userId);
          const name = prof?.name ?? p.displayName ?? `User ${p.userId.slice(0, 4)}`;
          return {
            id: p.userId,
            name,
            avatarInitials: prof?.avatarInitials ?? name.slice(0, 2).toUpperCase(),
            role: (p.role === "owner" || p.role === "admin" ? p.role : "member") as "owner" | "admin" | "member",
            presence: "online" as const,
          };
        });
        setDynamicParticipants(list);
      })
      .catch(() => {
        setSelectedTaskConvError("network");
        setSelectedTaskConvDetail(null);
        setDynamicParticipants(null);
      })
      .finally(() => setLoadingParticipants(false));
  }, [selectedTaskId, conversationId, listTasks]);

  // Effective conversation state (scoped vs global selected task)
  const effectiveDetail = conversationId ? conversationDetail : selectedTaskConvDetail;
  const effectiveErrorType = conversationId ? detailErrorType : selectedTaskConvError;
  const effectiveReadOnly = Boolean(
    effectiveDetail && (effectiveDetail.archivedAt != null || effectiveDetail.lockedAt != null)
  );
  const effectiveArchived = effectiveDetail?.archivedAt != null;
  const effectiveLocked = effectiveDetail?.lockedAt != null;

  const filtered = filter === "all"
    ? listTasks
    : listTasks.filter((t) => t.status === filter);

  const overdue = listTasks.filter((t) => t.status === "overdue").length;
  const selectedTask = listTasks.find((t) => t.id === selectedTaskId) ?? null;

  // Fast action handler for list-row buttons (no navigation needed)
  const handleUpdateTaskById = async (
    taskId: string,
    conversationRef: string | null | undefined,
    updates: { status?: TaskStatus; assigneeId?: string },
  ) => {
    if (!conversationRef) return;
    const payload: Record<string, string> = {};
    if (updates.status !== undefined) {
      payload.status = updates.status === "done" ? "DONE" : updates.status.toUpperCase().replace("-", "_");
    }
    if (updates.assigneeId !== undefined) {
      payload.assigneeId = updates.assigneeId || "";
    }
    if (Object.keys(payload).length === 0) return;
    const res = await fetch(`/api/messaging/conversations/${conversationRef}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      refreshTasks();
    }
  };

  // Unified PATCH handler
  const handleUpdateTask = async (updates: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    dueDate?: string | null;
    reminderAt?: string | null;
    assigneeId?: string | null;
    status?: TaskStatus;
  }) => {
    if (!selectedTaskId) return;

    const task = listTasks.find((t) => t.id === selectedTaskId);
    if (!task || !task.conversationRef) return;
    const targetConvId = task.conversationRef;

    // Map frontend values to backend payload format
    const payload: any = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    
    if (updates.priority !== undefined) {
      const priorityMap: Record<TaskPriority, number> = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3
      };
      payload.priority = priorityMap[updates.priority];
    }
    
    if (updates.dueDate !== undefined) {
      payload.dueDate = updates.dueDate || null;
    }

    if (updates.reminderAt !== undefined) {
      payload.reminderAt = updates.reminderAt || null;
    }

    if (updates.assigneeId !== undefined) {
      payload.assigneeId = updates.assigneeId || null;
    }
    
    if (updates.status !== undefined) {
      payload.status = updates.status === "done" ? "DONE" : updates.status.toUpperCase().replace("-", "_");
    }

    if (Object.keys(payload).length === 0) return;

    const res = await fetch(`/api/messaging/conversations/${targetConvId}/tasks/${selectedTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message ?? "Failed to update task");
    }

    refreshTasks();
  };

  // PATCH status handler
  const handleUpdateStatus = async (status: TaskStatus) => {
    await handleUpdateTask({ status });
  };

  // PATCH assignee handler
  const handleAssign = async (assigneeId: string) => {
    await handleUpdateTask({ assigneeId });
  };

  if (tasksLoading) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#DC2626]"></div>
        <p className="text-sm mt-4 font-semibold" style={{ color: "#79747E" }}>Loading tasks...</p>
      </div>
    );
  }

  if (tasksError !== "none") {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12 text-center px-6">
        <AlertTriangle className="h-10 w-10 text-[#DC2626] mb-3" />
        <h3 className="text-base font-bold mb-1" style={{ color: "#1C1B1F" }}>
          {tasksError === "restricted" ? "Access Restricted" : "Failed to Load Tasks"}
        </h3>
        <p className="text-sm mb-4 max-w-xs" style={{ color: "#79747E" }}>
          {tasksError === "restricted"
            ? "You do not have permission to view tasks."
            : "There was a problem communicating with the server. Please check your connection."}
        </p>
        <button
          type="button"
          onClick={refreshTasks}
          className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Restricted / member-removed: truthful unavailable state
  if (effectiveErrorType === "restricted") {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12 text-center px-6">
        <AlertTriangle className="h-10 w-10 text-[#DC2626] mb-3" />
        <h3 className="text-base font-bold mb-1" style={{ color: "#1C1B1F" }}>Access Restricted</h3>
        <p className="text-sm mb-4 max-w-xs" style={{ color: "#79747E" }}>
          You no longer have access to this conversation. Task information is unavailable.
        </p>
        <button
          type="button"
          onClick={refreshTasks}
          className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (selectedTask) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full">
        <div data-testid="task-panel" className="flex flex-col h-full">
          <TaskDetailPanel
            task={selectedTask}
            onBack={() => setSelectedTaskId(null)}
            participants={conversationId ? participantsList : (dynamicParticipants ?? undefined)}
            onUpdateStatus={handleUpdateStatus}
            onAssign={handleAssign}
            onNavigateToOrigin={onNavigateToOrigin}
            onEditTask={handleUpdateTask}
            readOnly={effectiveReadOnly}
            archived={effectiveArchived}
            locked={effectiveLocked}
          />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="messaging-pane-tasks" className="flex flex-col h-full">
      <div data-testid="task-panel" className="flex flex-col h-full">
        {/* Header — metric strip */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>Total</p>
              <p className="text-lg font-bold" style={{ color: "#1C1B1F" }}>{listTasks.length}</p>
            </div>
            <div className="h-8 w-px" style={{ background: "#F0F0F0" }} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>Overdue</p>
              <p className={cn("text-lg font-bold", overdue > 0 ? "text-[#DC2626]" : "text-[#1C1B1F]")}>{overdue}</p>
            </div>
            <div className="h-8 w-px" style={{ background: "#F0F0F0" }} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>Open</p>
              <p className="text-lg font-bold" style={{ color: "#1C1B1F" }}>{listTasks.filter((t) => t.status === "open").length}</p>
            </div>
          </div>
          {!conversationReadOnly && !(conversationId && detailLoading) && (
            <button
              type="button"
              data-testid="task-panel-new-btn"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#49454F" }}
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="px-6 py-2 border-b flex items-center gap-3" style={{ borderColor: "#E0E0E0" }}>
          <RadioPill
            name="task-filter"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={(v) => setFilter(v as TaskFilterStatus)}
          />
          {overdue > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#DC2626]">
              <AlertTriangle className="h-3 w-3" />
              {overdue} overdue
            </span>
          )}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {filtered.length === 0 ? (
            <div data-testid="task-list-empty" className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="h-8 w-8 mb-2" style={{ color: "#E0E0E0" }} />
              <p className="text-sm font-semibold" style={{ color: "#49454F" }}>
                {filter === "all" ? "No tasks yet" : filter === "assigned" ? "No tasks assigned to you" : filter === "created" ? "No tasks you created" : filter === "due-soon" ? "No tasks due soon" : `No ${filter} tasks`}
              </p>
              <p className="text-xs mt-1" style={{ color: "#79747E" }}>
                {filter === "all" ? "Create a task to get started." : "Try a different filter."}
              </p>
            </div>
          ) : (
            filtered.map((task) => {
              const { label, cls } = statusBadge(task.status);
              const isActive = task.status !== "done" && task.status !== "cancelled";
              return (
                <div
                  key={task.id}
                  data-testid={`task-row-${task.id}`}
                  aria-label={task.title}
                  onClick={() => setSelectedTaskId(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTaskId(task.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group relative flex w-full text-left items-start gap-3 rounded-lg border bg-white overflow-hidden hover:border-[#C0C0C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 transition-colors cursor-pointer"
                  style={{ borderColor: task.status === "overdue" ? "#FCA5A5" : "#F0F0F0" }}
                >
                  {/* Priority strip */}
                  <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", priorityStrip(task.priority))} />
                  <div className="flex-1 min-w-0 pl-4 pr-2 py-3">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm font-semibold", task.status === "overdue" && "text-[#DC2626]")} style={{ color: task.status === "overdue" ? undefined : "#1C1B1F" }}>
                        {task.title}
                      </p>
                      {task.status === "overdue" && (
                        <AlertTriangle className="h-3 w-3 text-[#DC2626]" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>{label}</span>
                      {task.assignee && (
                        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#79747E" }}>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[9px] font-bold" style={{ color: "#49454F" }}>{task.assignee.avatarInitials}</span>
                          {task.assignee.name}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#79747E" }}>
                          <Clock className="h-2.5 w-2.5" />{task.dueDate}
                        </span>
                      )}
                      {task.conversationName && (
                        <span
                          data-testid={`task-conv-badge-${task.id}`}
                          onClick={(e) => {
                            if (onNavigateToOrigin && task.conversationRef) {
                              e.stopPropagation();
                              onNavigateToOrigin(task.conversationRef, task.originatingMessageId ?? null);
                            }
                          }}
                          className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#DC2626] hover:bg-red-100 transition-colors cursor-pointer"
                        >
                          <MessageSquare className="h-2.5 w-2.5" />
                          {task.conversationType === "CHANNEL" ? `#${task.conversationName}` : task.conversationName}
                        </span>
                      )}
                      {task.originatingMessageId && task.conversationRef && onNavigateToOrigin && (
                        <button
                          type="button"
                          data-testid={`task-origin-${task.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToOrigin(task.conversationRef!, task.originatingMessageId!);
                          }}
                          className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                          title="Go to originating message"
                        >
                          <Link className="h-2.5 w-2.5" />
                          origin
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Fast actions */}
                  {!conversationReadOnly && (
                    <div className="flex items-center gap-1 shrink-0 self-center mr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {task.status !== "done" && task.status !== "cancelled" && (
                        <button
                          type="button"
                          data-testid={`task-action-done-${task.id}`}
                          title="Mark as done"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateTaskById(task.id, task.conversationRef, { status: "done" });
                          }}
                          className="rounded p-1.5 hover:bg-emerald-50 text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {task.status === "done" && (
                        <button
                          type="button"
                          data-testid={`task-action-reopen-${task.id}`}
                          title="Reopen"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateTaskById(task.id, task.conversationRef, { status: "open" });
                          }}
                          className="rounded p-1.5 hover:bg-blue-50 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {task.status !== "cancelled" && task.status !== "done" && (
                        <button
                          type="button"
                          data-testid={`task-action-cancel-${task.id}`}
                          title="Cancel task"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateTaskById(task.id, task.conversationRef, { status: "cancelled" });
                          }}
                          className="rounded p-1.5 hover:bg-red-50 text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {task.assignee && (
                        <button
                          type="button"
                          data-testid={`task-action-unassign-${task.id}`}
                          title="Clear assignee"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateTaskById(task.id, task.conversationRef, { assigneeId: "" });
                          }}
                          className="rounded p-1.5 hover:bg-gray-100 text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {showCreate && (
          <MessagingTaskCreate
            onClose={() => setShowCreate(false)}
            conversationId={conversationId}
            participants={conversationId ? participantsList : undefined}
            readOnly={conversationReadOnly}
            onSuccess={() => {
              refreshTasks();
              setShowCreate(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
