"use client";

import React, { useEffect, useState } from "react";
import { Link, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import type { TaskPriority, MessagingParticipant } from "./types";
import { useConversationList } from "./lib/use-conversation-list";
import type { ApiConversationDetail } from "./lib/mappers";

interface MessagingTaskCreateProps {
  onClose: () => void;
  conversationId?: string | null;
  participants?: MessagingParticipant[];
  onSuccess?: () => void;
  conversationRef?: string | null;
  readOnly?: boolean;
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
  readOnly: readOnlyProp,
}: MessagingTaskCreateProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedConvId, setSelectedConvId] = useState(conversationId ?? "");
  const [dynamicParticipants, setDynamicParticipants] = useState<MessagingParticipant[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [scopedConvBlocked, setScopedConvBlocked] = useState<string | null>(null);

  // Validate scoped conversation target (archived/locked/non-sendable) when conversationId is provided directly
  useEffect(() => {
    if (!conversationId) {
      setScopedConvBlocked(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/messaging/conversations/${conversationId}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.success || !payload.data) {
          setScopedConvBlocked("This conversation is not available for task creation.");
          return;
        }
        const detail: ApiConversationDetail = payload.data;
        if (detail.archivedAt != null) {
          setScopedConvBlocked("This conversation is archived. Tasks cannot be created.");
        } else if (detail.lockedAt != null) {
          setScopedConvBlocked("This conversation is locked. Tasks cannot be created.");
        } else if (detail.canSend === false) {
          setScopedConvBlocked("You cannot send messages in this conversation. Tasks cannot be created.");
        } else {
          setScopedConvBlocked(null);
        }
      })
      .catch(() => {
        if (!cancelled) setScopedConvBlocked("Unable to verify conversation. Task creation is blocked.");
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  const readOnly = readOnlyProp || scopedConvBlocked != null;

  // Call hook for global conversation list
  const { channels, dms, groups } = useConversationList();

  const validConversations = React.useMemo(() => {
    return [...channels, ...dms, ...groups].filter(
      (c) => c.archivedAt == null && c.lockedAt == null && c.canSend !== false
    );
  }, [channels, dms, groups]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch participants when conversation selection changes in global mode
  useEffect(() => {
    if (conversationId || !selectedConvId) {
      setDynamicParticipants(null);
      return;
    }

    setLoadingParticipants(true);
    setDynamicParticipants([]);
    fetch(`/api/messaging/conversations/${selectedConvId}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success && payload.data) {
          const detail: ApiConversationDetail = payload.data;
          const profilesMap = new Map(
            detail.participantProfiles?.map((p: any) => [p.userId, p]) ?? []
          );
          const list = detail.participants.map((p: any) => {
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
        }
      })
      .catch((err) => console.error("Failed to load conversation participants", err))
      .finally(() => setLoadingParticipants(false));
  }, [selectedConvId, conversationId]);

  // Use passed participants or dynamically fetched participants in global mode
  const allowedParticipants = participants ?? dynamicParticipants ?? [];
  const assignee = allowedParticipants.find((p) => p.id === assigneeId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (!selectedConvId) {
      setError("A conversation must be selected to create a task.");
      return;
    }

    if (readOnly) {
      setError(scopedConvBlocked ?? "Task creation is not allowed in this conversation.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Send real API request
      const res = await fetch(`/api/messaging/conversations/${selectedConvId}/tasks`, {
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

        {(error || scopedConvBlocked) && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-[#DC2626]">
            {scopedConvBlocked ?? error}
          </div>
        )}

        <div className="space-y-4">
          {/* Conversation Selector (only in global creation mode) */}
          {!conversationId && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>
                Select Conversation <span className="text-[#DC2626]">*</span>
              </label>
              <select
                data-testid="task-create-conversation-select"
                value={selectedConvId}
                disabled={submitting}
                onChange={(e) => {
                  setSelectedConvId(e.target.value);
                  setAssigneeId(""); // Reset assignee when conversation changes
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: selectedConvId ? "#1C1B1F" : "#79747E" }}
              >
                <option value="">Choose a channel, DM or group...</option>
                {validConversations.map((c) => {
                  const displayLabel = c.type === "CHANNEL"
                    ? `#${c.name}`
                    : c.type === "DM"
                    ? `DM: ${c.dmPeerName ?? c.name ?? "Unknown"}`
                    : `Group: ${c.name}`;
                  return (
                    <option key={c.id} value={c.id}>
                      {displayLabel}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

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
            disabled={!title.trim() || submitting || readOnly}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
              title.trim() && !submitting && !readOnly
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
