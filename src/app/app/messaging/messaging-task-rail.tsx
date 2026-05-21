"use client";

import React from "react";
import { AlertTriangle, CheckSquare, Clock, Link2, Lock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversationTasks } from "./lib/use-conversation-tasks";
import type { ApiTaskSummary } from "./lib/mappers";

interface MessagingTaskRailProps {
  conversationId: string | null;
  degraded?: boolean;
}

function priorityStrip(p: ApiTaskSummary["priority"]) {
  switch (p) {
    case "low": return "bg-gray-400";
    case "medium": return "bg-amber-400";
    case "high": return "bg-orange-500";
    case "critical": return "bg-[#DC2626]";
  }
}

function priorityBadge(p: ApiTaskSummary["priority"]) {
  switch (p) {
    case "low": return "bg-gray-100 text-gray-600";
    case "medium": return "bg-amber-100 text-amber-700";
    case "high": return "bg-orange-100 text-orange-700";
    case "critical": return "bg-red-100 text-[#DC2626]";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "OPEN": return { label: "Open", cls: "bg-gray-100 text-[#49454F]" };
    case "IN_PROGRESS": return { label: "In Progress", cls: "bg-blue-50 text-blue-700" };
    case "DONE": return { label: "Done", cls: "bg-emerald-50 text-emerald-700" };
    case "OVERDUE": return { label: "Overdue", cls: "bg-red-50 text-[#DC2626]" };
    case "CANCELLED": return { label: "Cancelled", cls: "bg-gray-100 text-gray-400 line-through" };
    default: return { label: status, cls: "bg-gray-100 text-gray-600" };
  }
}

function TaskSkeletonRow() {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-white p-3" style={{ borderColor: "#F0F0F0" }}>
      <div className="mt-1 h-4 w-1 rounded bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 rounded-full bg-gray-200" />
          <div className="h-3 w-16 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function TaskSummaryCard({ task }: { task: ApiTaskSummary }) {
  const { label, cls } = statusBadge(task.status);
  const overdue = task.isOverdue || task.status === "OVERDUE";

  return (
    <div
      className="group relative flex w-full items-start gap-3 rounded-lg border bg-white p-3 overflow-hidden"
      style={{ borderColor: overdue ? "#FCA5A5" : "#F0F0F0" }}
      data-testid={`task-card-${task.id}`}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", priorityStrip(task.priority))} />
      <div className="flex-1 min-w-0 pl-3">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-semibold truncate", overdue && "text-[#DC2626]")} style={{ color: overdue ? undefined : "#1C1B1F" }}>
            {task.title}
          </p>
          {overdue && <AlertTriangle className="h-3 w-3 shrink-0 text-[#DC2626]" />}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>{label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityBadge(task.priority))}>
            {task.priority}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {task.assigneeName && (
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#79747E" }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[9px] font-bold" style={{ color: "#49454F" }}>
                {task.assigneeAvatarInitials ?? "?"}
              </span>
              {task.assigneeName}
            </span>
          )}
          {task.dueDate && (
            <span className={cn("flex items-center gap-0.5 text-[10px]", overdue ? "text-[#DC2626]" : "text-[#79747E]")}>
              <Clock className="h-2.5 w-2.5" />
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.originatingMessageId && (
            <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#79747E" }} title="Linked to a message">
              <Link2 className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessagingTaskRail({ conversationId, degraded }: MessagingTaskRailProps) {
  const { tasks, loading, errorType } = useConversationTasks(conversationId);
  const isRestricted = errorType === "restricted";
  const isEmpty = !loading && tasks !== null && tasks.length === 0 && !isRestricted;
  const hasTasks = !loading && tasks !== null && tasks.length > 0 && !isRestricted;

  return (
    <aside
      className="hidden xl:flex flex-col w-72 shrink-0 border-l bg-gray-50/50 h-full overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="messaging-task-rail"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3 shrink-0" style={{ borderColor: "#E0E0E0" }}>
        <CheckSquare className="h-4 w-4 shrink-0" style={{ color: "#49454F" }} />
        <h2 className="text-sm font-bold" style={{ color: "#1C1B1F" }}>Tasks</h2>
        {hasTasks && (
          <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold" style={{ color: "#49454F" }}>
            {tasks.length}
          </span>
        )}
      </div>

      {degraded && hasTasks && (
        <div
          className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 shrink-0"
          style={{ borderColor: "#FCD34D" }}
          data-testid="task-rail-degraded-banner"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
          <span className="text-[10px] text-amber-700">Connection interrupted. Task state may be delayed.</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {!conversationId && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" data-testid="task-rail-no-conversation">
            <MessageSquare className="h-8 w-8" style={{ color: "#E0E0E0" }} />
            <p className="text-xs font-semibold" style={{ color: "#49454F" }}>Select a conversation</p>
            <p className="text-[10px]" style={{ color: "#79747E" }}>Tasks for the selected conversation will appear here.</p>
          </div>
        )}

        {conversationId && loading && (
          <>
            <TaskSkeletonRow />
            <TaskSkeletonRow />
            <TaskSkeletonRow />
          </>
        )}

        {conversationId && isRestricted && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" data-testid="task-rail-restricted">
            <Lock className="h-8 w-8" style={{ color: "#E0E0E0" }} />
            <p className="text-xs font-semibold" style={{ color: "#49454F" }}>Access restricted</p>
            <p className="text-[10px]" style={{ color: "#79747E" }}>You don&apos;t have access to tasks in this conversation.</p>
          </div>
        )}

        {conversationId && isEmpty && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" data-testid="task-rail-empty">
            <CheckSquare className="h-8 w-8" style={{ color: "#E0E0E0" }} />
            <p className="text-xs font-semibold" style={{ color: "#49454F" }}>No tasks</p>
            <p className="text-[10px]" style={{ color: "#79747E" }}>This conversation has no tasks yet.</p>
          </div>
        )}

        {conversationId && hasTasks && tasks.map((task) => (
          <TaskSummaryCard key={task.id} task={task} />
        ))}
      </div>
    </aside>
  );
}
