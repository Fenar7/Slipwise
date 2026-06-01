"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import type { CalendarConnection } from "./types";

interface MessagingMeetingScheduleProps {
  conversationId?: string | null;
  onClose: () => void;
  onSuccess?: (meeting: any) => void;
  calendarConnection: CalendarConnection;
}

const DURATION_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

export function MessagingMeetingSchedule({
  conversationId,
  onClose,
  onSuccess,
  calendarConnection,
}: MessagingMeetingScheduleProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isConnected = calendarConnection.status === "connected";

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setError(null);
    setSubmitting(true);

    try {
      if (!conversationId) {
        // Fallback mock behavior for testing
        const scheduledTime = date && time ? new Date(`${date}T${time}`) : new Date();
        const mockNew = {
          id: `meet-new-${Date.now()}`,
          title: title.trim(),
          scheduledAt: scheduledTime.toISOString(),
          durationMinutes: parseInt(duration, 10) || 30,
          status: "UPCOMING",
          participantCount: 6,
        };
        if (onSuccess) {
          onSuccess(mockNew);
        }
        onClose();
        return;
      }

      const dateStr = date || new Date().toISOString().split("T")[0];
      const timeStr = time || "12:00";
      const scheduledAt = new Date(`${dateStr}T${timeStr}`).toISOString();

      const res = await fetch(`/api/messaging/conversations/${conversationId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: "Conversation-bound meeting.",
          scheduledAt,
          durationMinutes: parseInt(duration, 10) || 30,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to schedule meeting");
      }

      if (onSuccess) {
        onSuccess(data.data);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="meeting-schedule-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schedule meeting"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Schedule Meeting</h2>
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
          <div className="mb-4 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Calendar connection passive warning/info block */}
          {!isConnected && (
            <div
              data-testid="meeting-schedule-calendar-prompt"
              className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800"
            >
              Note: Calendar integration is not active. The meeting will be saved as an in-app native meeting only.
            </div>
          )}

          {/* Calendar passive status indicator */}
          <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold" style={{ color: "#4285F4", borderColor: "#E0E0E0" }}>G</span>
            <span className="text-xs" style={{ color: "#49454F" }}>
              {isConnected ? (
                <>Saving to Google Calendar via <span className="font-semibold">{calendarConnection.connectedEmail}</span></>
              ) : (
                <>Saving as a native in-app conversation meeting</>
              )}
            </span>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>
              Meeting title <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              data-testid="meeting-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this meeting about?"
              className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Date</label>
              <input
                type="date"
                data-testid="meeting-date-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Time</label>
              <input
                type="time"
                data-testid="meeting-time-input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#1C1B1F" }}>Duration</label>
            <RadioPill
              name="meeting-duration"
              options={DURATION_OPTIONS}
              value={duration}
              onChange={setDuration}
            />
          </div>

          {/* Passive Participant derivation info */}
          <div className="rounded-lg bg-gray-50 border p-3 text-xs text-gray-600" data-testid="meeting-participants-info" style={{ borderColor: "#E0E0E0" }}>
            All active conversation participants are automatically invited to this meeting.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              data-testid="meeting-schedule-cancel"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#49454F" }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="meeting-schedule-submit"
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                title.trim() && !submitting
                  ? "bg-[#DC2626] text-white hover:bg-red-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              {submitting ? "Scheduling..." : "Schedule meeting"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
