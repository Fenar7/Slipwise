"use client";

import React, { useState } from "react";
import { AlertTriangle, Clock, Link, MoreHorizontal, ArrowLeft, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingTaskCreate } from "./messaging-task-create";
import { MOCK_TASK_DETAILS, MOCK_TASKS } from "./mock-data";
import type { TaskFilterStatus, TaskPriority, MessagingTaskDetail, MessagingTask } from "./types";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "overdue", label: "Overdue" },
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
    default: return { label: status, cls: "bg-gray-100 text-gray-600" };
  }
}

function TaskDetailPanel({ task, onBack }: { task: MessagingTaskDetail; onBack: () => void }) {
  const { label, cls } = statusBadge(task.status);
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
          {task.assignee ? (
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

        {/* Conversation link */}
        {task.conversationRef && (
          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 border px-3 py-2" style={{ borderColor: "#E0E0E0" }}>
            <Link className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
            <span className="text-xs" style={{ color: "#79747E" }}>
              Linked to: <span className="font-semibold" style={{ color: "#1C1B1F" }}>{task.conversationRef}</span>
            </span>
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
        <button
          type="button"
          aria-label="Edit task"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {task.status !== "done" && (
          <button
            type="button"
            data-testid="task-mark-done"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            Mark as done
          </button>
        )}
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete task
        </button>
      </div>
    </div>
  );
}

export function MessagingTaskPanel() {
  const [filter, setFilter] = useState<TaskFilterStatus>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Use MOCK_TASKS for the list (backward compat with Sprint 1.1 tests — preserves original titles/statuses)
  // Use MOCK_TASK_DETAILS for the detail view (Sprint 1.5 data with priority, description, etc.)
  const listTasks = MOCK_TASKS;
  const filtered = filter === "all"
    ? listTasks
    : listTasks.filter((t) => t.status === filter);

  const overdue = listTasks.filter((t) => t.status === "overdue").length;
  // For detail view, look up in MOCK_TASK_DETAILS; fall back to a minimal detail shape
  const baseTask = listTasks.find((t) => t.id === selectedTaskId);
  const selectedTask: MessagingTaskDetail | null = selectedTaskId
    ? (MOCK_TASK_DETAILS.find((t) => t.id === selectedTaskId) ??
        (baseTask
          ? {
              ...baseTask,
              priority: "medium" as const,
              description: null,
              createdAt: new Date().toISOString(),
              createdBy: "Unknown",
            }
          : null))
    : null;

  if (selectedTask) {
    return (
      <div data-testid="messaging-pane-tasks" className="flex flex-col h-full">
        <div data-testid="task-panel" className="flex flex-col h-full">
          <TaskDetailPanel task={selectedTask} onBack={() => setSelectedTaskId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="messaging-pane-tasks" className="flex flex-col h-full">
    <div data-testid="task-panel" className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Tasks</h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            {listTasks.length} tasks · {overdue} overdue
          </p>
        </div>
        <button
          type="button"
          data-testid="task-panel-new-btn"
          onClick={() => setShowCreate(true)}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + New Task
        </button>
      </div>

      {/* Overdue warning banner */}
      {overdue > 0 && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
          <span className="text-xs font-semibold text-[#DC2626]">
            {overdue} overdue task{overdue > 1 ? "s" : ""} need attention
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="px-6 py-3 border-b" style={{ borderColor: "#E0E0E0" }}>
        <RadioPill
          name="task-filter"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as TaskFilterStatus)}
        />
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div data-testid="task-list-empty" className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm" style={{ color: "#79747E" }}>No tasks match this filter.</p>
          </div>
        ) : (
          filtered.map((task) => {
            const { label, cls } = statusBadge(task.status);
            return (
              <button
                type="button"
                key={task.id}
                data-testid={`task-row-${task.id}`}
                aria-label={task.title}
                onClick={() => setSelectedTaskId(task.id)}
                className="relative flex w-full text-left items-start gap-3 rounded-xl border overflow-hidden hover:border-[#DC2626] hover:bg-red-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 transition-colors"
                style={{ borderColor: task.status === "overdue" ? "#FCA5A5" : "#F0F0F0" }}
              >
                {/* Priority strip */}
                <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", priorityStrip(("priority" in task ? task.priority : "medium") as TaskPriority))} />
                <div className="flex-1 min-w-0 pl-4 pr-2 py-3">
                  <p className={cn("text-sm font-semibold", task.status === "overdue" && "text-[#DC2626]")} style={{ color: task.status === "overdue" ? undefined : "#1C1B1F" }}>
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", cls)}>{label}</span>
                    {task.assignee && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#79747E" }}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] font-bold">{task.assignee.avatarInitials}</span>
                        {task.assignee.name}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#79747E" }}>
                        <Clock className="h-2.5 w-2.5" />{task.dueDate}
                      </span>
                    )}
                    {task.status === "overdue" && (
                      <AlertTriangle className="h-3 w-3 text-[#DC2626]" />
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`task-actions-${task.id}`}
                  aria-label="Task options"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded-lg p-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] self-center mr-2"
                >
                  <MoreHorizontal className="h-4 w-4" style={{ color: "#79747E" }} />
                </button>
              </button>
            );
          })
        )}
      </div>

      {showCreate && (
        <MessagingTaskCreate onClose={() => setShowCreate(false)} />
      )}
    </div>
    </div>
  );
}
