"use client";

import React, { useState } from "react";
import { AlertTriangle, Clock, Link, MoreHorizontal, ArrowLeft, Plus, CheckSquare, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingTaskCreate } from "./messaging-task-create";
import type { TaskFilterStatus, TaskPriority, MessagingTaskDetail, MessagingTask, MessagingParticipant, TaskStatus } from "./types";
import { useConversationTasks } from "./lib/use-conversation-tasks";
import { useConversationDetail } from "./lib/use-conversation-detail";
import type { ApiTaskSummary, ApiConversationDetail } from "./lib/mappers";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "overdue", label: "Overdue" },
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
  onNavigateToOrigin?: (conversationId: string, messageId: string) => void;
  onEditTask?: (updates: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueDate: string | null;
    assigneeId: string | null;
    status: TaskStatus;
  }) => Promise<void>;
}

function TaskDetailPanel({
  task,
  onBack,
  participants,
  onUpdateStatus,
  onAssign,
  onNavigateToOrigin,
  onEditTask,
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
  const [editAssigneeId, setEditAssigneeId] = useState(task.assignee?.id ?? "");
  const [editStatus, setEditStatus] = useState<TaskStatus>(task.dbStatus ?? task.status);

  // Sync edit details when task changes (no stale selection bugs)
  React.useEffect(() => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ?? "");
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
              disabled={updating}
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

        {/* Metadata */}
        <div className="text-xs space-y-0.5" style={{ color: "#79747E" }}>
          <p>Created by <span className="font-semibold">{task.createdBy}</span></p>
          <p>{new Date(task.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        {task.status !== "done" && (
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
      </div>
    </div>
  );
}

interface MessagingTaskPanelProps {
  conversationId?: string | null;
  onNavigateToOrigin?: (conversationId: string, messageId: string) => void;
}

export function MessagingTaskPanel({ conversationId, onNavigateToOrigin }: MessagingTaskPanelProps) {
  const [filter, setFilter] = useState<TaskFilterStatus>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Hook up hooks if we have conversationId
  const {
    tasks: apiTasks,
    loading: tasksLoading,
    errorType: tasksError,
    refresh: refreshTasks,
  } = useConversationTasks(conversationId ?? null);

  const {
    detail: conversationDetail,
  } = useConversationDetail(conversationId ?? null);

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
      status,
      conversationRef: t.conversationId,
      priority: t.priority,
      description: t.description,
      createdAt: t.createdAt,
      createdBy: t.createdByName ?? t.createdBy,
      originatingMessageId: t.originatingMessageId,
      dbStatus,
    };
  }, []);

  // Map API tasks to UI shape — only when we have a real conversation context
  const listTasks: MessagingTaskDetail[] = React.useMemo(() => {
    if (!conversationId) return [];
    return (apiTasks ?? []).map(mapApiTaskToFrontend);
  }, [conversationId, apiTasks, mapApiTaskToFrontend]);

  const filtered = filter === "all"
    ? listTasks
    : listTasks.filter((t) => t.status === filter);

  const overdue = listTasks.filter((t) => t.status === "overdue").length;
  const selectedTask = listTasks.find((t) => t.id === selectedTaskId) ?? null;

  // Unified PATCH handler
  const handleUpdateTask = async (updates: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    dueDate?: string | null;
    assigneeId?: string | null;
    status?: TaskStatus;
  }) => {
    if (!conversationId || !selectedTaskId) return;

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
    
    if (updates.assigneeId !== undefined) {
      payload.assigneeId = updates.assigneeId || null;
    }
    
    if (updates.status !== undefined) {
      payload.status = updates.status === "done" ? "DONE" : updates.status.toUpperCase().replace("-", "_");
    }

    if (Object.keys(payload).length === 0) return;

    const res = await fetch(`/api/messaging/conversations/${conversationId}/tasks/${selectedTaskId}`, {
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

  if (!conversationId) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12 text-center px-6">
        <MessageSquare className="h-10 w-10 mb-3" style={{ color: "#E0E0E0" }} />
        <h3 className="text-base font-bold mb-1" style={{ color: "#1C1B1F" }}>
          No Conversation Selected
        </h3>
        <p className="text-sm max-w-xs" style={{ color: "#79747E" }}>
          Select a conversation to view and manage its tasks.
        </p>
      </div>
    );
  }

  if (tasksLoading) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#DC2626]"></div>
        <p className="text-sm mt-4 font-semibold" style={{ color: "#79747E" }}>Loading tasks...</p>
      </div>
    );
  }

  if (conversationId && tasksError !== "none") {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full items-center justify-center py-12 text-center px-6">
        <AlertTriangle className="h-10 w-10 text-[#DC2626] mb-3" />
        <h3 className="text-base font-bold mb-1" style={{ color: "#1C1B1F" }}>
          {tasksError === "restricted" ? "Access Restricted" : "Failed to Load Tasks"}
        </h3>
        <p className="text-sm mb-4 max-w-xs" style={{ color: "#79747E" }}>
          {tasksError === "restricted"
            ? "You do not have permission to view tasks in this conversation."
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

  if (selectedTask) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full">
        <div data-testid="task-panel" className="flex flex-col h-full">
          <TaskDetailPanel
            task={selectedTask}
            onBack={() => setSelectedTaskId(null)}
            participants={conversationId ? participantsList : undefined}
            onUpdateStatus={conversationId ? handleUpdateStatus : undefined}
            onAssign={conversationId ? handleAssign : undefined}
            onNavigateToOrigin={onNavigateToOrigin}
            onEditTask={conversationId ? handleUpdateTask : undefined}
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
          <button
            type="button"
            data-testid="task-panel-new-btn"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
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
              <p className="text-sm" style={{ color: "#79747E" }}>No tasks match this filter.</p>
            </div>
          ) : (
            filtered.map((task) => {
              const { label, cls } = statusBadge(task.status);
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
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`task-actions-${task.id}`}
                    aria-label="Task options"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-lg p-2 opacity-0 group-hover:opacity-100 hover:bg-gray-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] self-center mr-2 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" style={{ color: "#79747E" }} />
                  </button>
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
