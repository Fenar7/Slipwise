"use client";

import React, { useEffect, useState } from "react";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MOCK_PARTICIPANTS } from "./mock-data";
import type { CalendarConnection } from "./types";

interface MessagingMeetingScheduleProps {
  onClose: () => void;
  calendarConnection: CalendarConnection;
}

const DURATION_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

export function MessagingMeetingSchedule({ onClose, calendarConnection }: MessagingMeetingScheduleProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [participantId, setParticipantId] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isConnected = calendarConnection.status === "connected";

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

        {!isConnected ? (
          /* Calendar not connected state */
          <div data-testid="meeting-schedule-calendar-prompt" className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-8 px-4 text-center" style={{ borderColor: "#E0E0E0" }}>
              <Calendar className="h-8 w-8" style={{ color: "#79747E" }} />
              <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>Google Calendar not connected</p>
              <p className="text-xs" style={{ color: "#79747E" }}>
                Connect your Google Calendar to schedule and sync meetings automatically.
              </p>
              <button
                type="button"
                className="mt-1 rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              >
                Connect Google Calendar
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="meeting-schedule-cancel"
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#49454F" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Full schedule form */
          <div className="space-y-4">
            {/* Calendar indicator */}
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2">
              {/* Inline Google "G" icon */}
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold" style={{ color: "#4285F4", borderColor: "#E0E0E0" }}>G</span>
              <span className="text-xs" style={{ color: "#49454F" }}>
                Sending to <span className="font-semibold">{calendarConnection.connectedEmail}</span>
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

            {/* Participants */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#1C1B1F" }}>Add participant</label>
              <select
                data-testid="meeting-participant-picker"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: participantId ? "#1C1B1F" : "#79747E" }}
              >
                <option value="">Select participant…</option>
                {MOCK_PARTICIPANTS.slice(0, 4).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
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
                disabled={!title.trim()}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                  title.trim()
                    ? "bg-[#DC2626] text-white hover:bg-red-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                Schedule meeting
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
