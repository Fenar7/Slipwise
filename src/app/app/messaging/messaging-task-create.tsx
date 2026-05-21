"use client";

import React, { useEffect, useState } from "react";
import { Link, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import type { TaskPriority, MessagingParticipant } from "./types";

interface MessagingTaskCreateProps {
  onClose: () => void;
  conversationId?: string | null;
  participants?: MessagingParticipant[];
  onSuccess?: () => void;
  conversationRef?: string | null;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function priorityStringToNumber(priority: TaskPriority): number {
  switch (priority) {
    case "low": return 0;
    case "medium": return 1;
    case "high": return 2;
    case "critical": return 3;
    default: return 1;
  }
}

export function MessagingTaskCreate({
  onClose,
  conversationId,
  participants,
  onSuccess,
  conversationRef,
}: MessagingTaskCreateProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Use passed participants — no mock fallback in live paths
  const allowedParticipants = participants ?? [];
  const assignee = allowedParticipants.find((p) => p.id === assigneeId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (!conversationId) {
      setError("A conversation must be selected to create a task.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Send real API request
      const res = await fetch(`/api/messaging/conversations/${conversationId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority: priorityStringToNumber(priority),
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error?.message ?? "Failed to create task");
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="task-create-modal"
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Create task"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        style={{ borderColor: "#E0E0E0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>New Task</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          >
            <X className="h-4 w-4" style={{ color: "#79747E" }} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-[#DC2626]">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>
              Task title <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              data-testid="task-title-input"
              value={title}
              disabled={submitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#1C1B1F" }}>Priority</label>
            <RadioPill
              name="task-priority"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(v) => setPriority(v as TaskPriority)}
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Assignee</label>
            {assignee ? (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "#E0E0E0" }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold" style={{ color: "#49454F" }}>
                  {assignee.avatarInitials}
                </span>
                <span className="flex-1 text-sm" style={{ color: "#1C1B1F" }}>{assignee.name}</span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setAssigneeId("")}
                  aria-label="Remove assignee"
                  className="rounded p-0.5 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                >
                  <X className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
                </button>
              </div>
            ) : (
              <select
                data-testid="task-assignee-picker"
                value={assigneeId}
                disabled={submitting}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: assigneeId ? "#1C1B1F" : "#79747E" }}
              >
                <option value="">Unassigned</option>
                {allowedParticipants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Due date (optional)</label>
            <input
              type="date"
              data-testid="task-due-date"
              value={dueDate}
              disabled={submitting}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Description (optional)</label>
            <textarea
              data-testid="task-description"
              rows={2}
              value={description}
              disabled={submitting}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more context…"
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Conversation link hint */}
          {conversationRef && (
            <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 border px-3 py-2" style={{ borderColor: "#E0E0E0" }}>
              <Link className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
              <span className="text-xs" style={{ color: "#79747E" }}>
                Linked to: <span className="font-semibold" style={{ color: "#1C1B1F" }}>{conversationRef}</span>
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            data-testid="task-create-cancel"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="task-create-submit"
            disabled={!title.trim() || submitting}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
              title.trim() && !submitting
                ? "bg-[#DC2626] text-white hover:bg-red-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {submitting ? "Creating..." : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
