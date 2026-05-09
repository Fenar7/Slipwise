"use client";

import React, { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingMeetingSchedule } from "./messaging-meeting-schedule";
import { MOCK_MEETINGS } from "./mock-data";
import type { CalendarConnection, MeetingTab } from "./types";

interface CalendarGridProps {
  meetings: typeof MOCK_MEETINGS;
  now?: Date;
}

interface MessagingMeetingPanelProps {
  calendarConnection: CalendarConnection;
  now?: Date;
}

const TAB_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "calendar", label: "Calendar" },
];

// ─── Calendar grid helpers ────────────────────────────────────────────────────

function buildCalendarGrid(year: number, month: number) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // Shift so Mon=0
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function CalendarGrid({ meetings, now = new Date() }: CalendarGridProps) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const cells = buildCalendarGrid(year, month);

  // Days that have meetings
  const meetingDays = new Set(
    meetings.map((m) => {
      const d = new Date(m.scheduledAt);
      if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
      return null;
    }).filter(Boolean) as number[]
  );

  const todayMeetings = meetings.filter((m) => {
    const d = new Date(m.scheduledAt);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === today;
  });

  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div data-testid="meeting-calendar-grid">
      <p className="text-sm font-semibold mb-3" style={{ color: "#1C1B1F" }}>{monthLabel}</p>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: "#79747E" }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => (
          <div key={i} className="flex flex-col items-center py-1">
            {day !== null && (
              <>
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs",
                    day === today ? "bg-[#DC2626] text-white font-bold" : "text-[#1C1B1F]"
                  )}
                  {...(day === today ? { "aria-current": "date" as const } : {})}
                >
                  {day}
                </span>
                {meetingDays.has(day) && (
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Today's events */}
      <div className="mt-4">
        <p className="text-xs font-semibold mb-2" style={{ color: "#79747E" }}>Today&apos;s events</p>
        {todayMeetings.length === 0 ? (
          <p className="text-xs" style={{ color: "#79747E" }}>No meetings today.</p>
        ) : (
          <div className="space-y-2">
            {todayMeetings.map((m) => (
              <div key={m.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "#E0E0E0" }}>
                <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{m.title}</p>
                <p className="text-xs" style={{ color: "#79747E" }}>{m.durationMinutes} min · {m.participantCount} participants</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessagingMeetingPanel({ calendarConnection, now = new Date() }: MessagingMeetingPanelProps) {
  const [tab, setTab] = useState<MeetingTab>("upcoming");
  const [showSchedule, setShowSchedule] = useState(false);

  const upcoming = MOCK_MEETINGS.filter((m) => m.status === "upcoming");
  const past = MOCK_MEETINGS.filter((m) => m.status === "ended");
  const isConnected = calendarConnection.status === "connected";

  return (
    <div data-testid="messaging-pane-meetings" className="flex flex-col h-full">
    <div className="flex flex-col h-full" data-testid="meeting-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#E0E0E0" }}>
        <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>Meetings</h2>
        <button
          type="button"
          data-testid="meeting-panel-schedule-btn"
          onClick={() => setShowSchedule(true)}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-[#DC2626] hover:border-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        >
          + Schedule
        </button>
      </div>

      {/* Tab switcher */}
      <div className="px-6 py-3 border-b" style={{ borderColor: "#E0E0E0" }}>
        <RadioPill
          name="meeting-tab"
          options={TAB_OPTIONS}
          value={tab}
          onChange={(v) => setTab(v as MeetingTab)}
        />
      </div>

      {/* Calendar connection banner */}
      <div className="px-6 pt-3">
        {isConnected ? (
          <div
            data-testid="meeting-calendar-connected-chip"
            className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold" style={{ color: "#4285F4", borderColor: "#E0E0E0" }}>G</span>
            <span className="flex-1 text-xs font-semibold" style={{ color: "#49454F" }}>
              Google Calendar · {calendarConnection.connectedEmail}
            </span>
            <button
              type="button"
              data-testid="meeting-disconnect-calendar"
              className="text-xs text-[#DC2626] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5" style={{ borderColor: "#E0E0E0" }}>
            <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
            <span className="flex-1 text-xs" style={{ color: "#79747E" }}>
              Connect Google Calendar to sync meetings automatically.
            </span>
            <button
              type="button"
              data-testid="meeting-connect-calendar-btn"
              className="text-xs font-semibold text-[#DC2626] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            >
              Connect
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === "upcoming" && (
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#79747E" }}>
                No upcoming meetings. Schedule one to get started.
              </p>
            ) : (
              upcoming.map((m) => (
                <div
                  key={m.id}
                  data-testid={`meeting-row-${m.id}`}
                  className="flex items-start gap-3 rounded-xl border p-4"
                  style={{ borderColor: "#F0F0F0" }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{m.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {m.participantCount} participants · {m.durationMinutes} min
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {new Date(m.scheduledAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`meeting-join-${m.id}`}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                  >
                    Join
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "past" && (
          <div className="space-y-2">
            {past.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#79747E" }}>No past meetings.</p>
            ) : (
              past.map((m) => (
                <div
                  key={m.id}
                  data-testid={`meeting-row-${m.id}`}
                  className="flex items-start gap-3 rounded-xl border p-4 opacity-60"
                  style={{ borderColor: "#F0F0F0" }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Calendar className="h-4 w-4" style={{ color: "#79747E" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{m.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {m.participantCount} participants · {m.durationMinutes} min
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                      {new Date(m.scheduledAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold" style={{ color: "#79747E" }}>
                    Ended
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "calendar" && (
          <CalendarGrid meetings={MOCK_MEETINGS} now={now} />
        )}
      </div>

      {showSchedule && (
        <MessagingMeetingSchedule
          onClose={() => setShowSchedule(false)}
          calendarConnection={calendarConnection}
        />
      )}
    </div>
    </div>
  );
}
