"use client";

import React, { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingMeetingSchedule } from "./messaging-meeting-schedule";
import { MOCK_MEETINGS } from "./mock-data";
import type { CalendarConnection, MeetingTab } from "./types";

interface CalendarGridProps {
  meetings: any[];
  now?: Date;
}

interface MessagingMeetingPanelProps {
  conversationId?: string | null;
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

  // Days that have meetings or calendar entries
  const meetingDays = new Set(
    meetings.map((m) => {
      const dateVal = m.scheduledAt || m.startAt;
      if (!dateVal) return null;
      const d = new Date(dateVal);
      if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
      return null;
    }).filter(Boolean) as number[]
  );

  const todayMeetings = meetings.filter((m) => {
    const dateVal = m.scheduledAt || m.startAt;
    if (!dateVal) return false;
    const d = new Date(dateVal);
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
                <p className="text-xs" style={{ color: "#79747E" }}>
                  {m.durationMinutes || 30} min · {m.type === "task_due_date" ? "Task deadline" : "Meeting"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessagingMeetingPanel({ conversationId, calendarConnection, now = new Date() }: MessagingMeetingPanelProps) {
  const [tab, setTab] = useState<MeetingTab>("upcoming");
  const [showSchedule, setShowSchedule] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [connection, setConnection] = useState<any>(calendarConnection);
  const isConnected = connection.status === "connected";

  // Hydrate connection status dynamically in Sprint 8.2
  useEffect(() => {
    if (!conversationId) {
      setConnection(calendarConnection);
      return;
    }
    fetch("/api/messaging/calendar/connections")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load connection status");
        return res.json();
      })
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          const activeConn = data.data.find(
            (c: any) => c.status === "ACTIVE" || c.status === "RECONNECT_REQUIRED"
          ) || data.data[0];

          if (activeConn) {
            let mappedStatus = "not_connected";
            if (activeConn.status === "ACTIVE") {
              mappedStatus = activeConn.lastSyncError ? "degraded" : "connected";
            } else if (activeConn.status === "RECONNECT_REQUIRED") {
              mappedStatus = "reconnect_required";
            } else if (activeConn.status === "DISCONNECTED") {
              mappedStatus = "not_connected";
            }

            setConnection({
              id: activeConn.id,
              provider: activeConn.provider.toLowerCase(),
              status: mappedStatus,
              connectedEmail: activeConn.emailAddress,
              connectedAt: activeConn.createdAt,
              lastSyncError: activeConn.lastSyncError,
            });
          } else {
            setConnection(calendarConnection);
          }
        } else {
          setConnection(calendarConnection);
        }
      })
      .catch((err) => {
        console.error("Failed to load calendar connection:", err);
        setConnection(calendarConnection);
      });
  }, [conversationId, calendarConnection]);

  // Hydrate meetings dynamically if conversationId is provided
  useEffect(() => {
    if (!conversationId) {
      setMeetings([]);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/messaging/conversations/${conversationId}/meetings`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) {
            throw new Error("Access denied or not found");
          }
          throw new Error("Failed to load meetings");
        }
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setMeetings(data.data || []);
        } else {
          throw new Error(data.error?.message || "Failed to load meetings");
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [conversationId]);

  // Hydrate unified calendar entries
  useEffect(() => {
    if (!conversationId) {
      setCalendarEntries([]);
      return;
    }
    setError(null);
    fetch(`/api/messaging/calendar`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load calendar entries");
        }
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setCalendarEntries(data.data || []);
        } else {
          throw new Error(data.error?.message || "Failed to load calendar");
        }
      })
      .catch((err) => {
        console.error("Calendar hydration error:", err);
      });
  }, [conversationId]);

  const nowTime = now.getTime();

  const upcoming = conversationId
    ? meetings.filter((m) => {
        const status = m.status.toUpperCase();
        if (status === "CANCELLED") return false;
        const endTime = new Date(m.scheduledAt).getTime() + (m.durationMinutes || 30) * 60 * 1000;
        return status === "UPCOMING" && endTime >= nowTime;
      })
    : MOCK_MEETINGS.filter((m) => {
        const status = m.status.toUpperCase();
        return status === "UPCOMING";
      });

  const past = conversationId
    ? meetings.filter((m) => {
        const status = m.status.toUpperCase();
        if (status === "CANCELLED" || status === "ENDED") return true;
        const endTime = new Date(m.scheduledAt).getTime() + (m.durationMinutes || 30) * 60 * 1000;
        return status === "UPCOMING" && endTime < nowTime;
      })
    : MOCK_MEETINGS.filter((m) => {
        const status = m.status.toUpperCase();
        return status === "ENDED" || status === "CANCELLED";
      });

  const gridMeetings = conversationId ? calendarEntries : MOCK_MEETINGS;

  const handleCancelMeeting = async (meetingId: string) => {
    if (!confirm("Are you sure you want to cancel this meeting?")) return;
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelReason: "Cancelled via Web UI" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to cancel meeting");
      }
      // Update local status
      setMeetings(meetings.map(m => m.id === meetingId ? { ...m, status: "CANCELLED" } : m));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDisconnect = async () => {
    if (!connection.id) return;
    if (!confirm("Are you sure you want to disconnect this calendar?")) return;
    try {
      const res = await fetch(`/api/messaging/calendar/connections/${connection.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to disconnect calendar");
      }
      setConnection({
        provider: null,
        status: "not_connected",
        connectedEmail: null,
        connectedAt: null,
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReconnect = () => {
    if (!connection.provider) return;
    window.location.href = `/api/messaging/calendar/connections/${connection.provider}/connect`;
  };

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

        {/* Error / Degraded State Banner */}
        {error && (
          <div data-testid="meeting-panel-error" className="bg-red-50 text-red-700 border-b border-red-100 px-6 py-2 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Calendar connection banner */}
        <div className="px-6 pt-3">
          {connection.status === "connected" && (
            <div
              data-testid="meeting-calendar-connected-chip"
              className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold shrink-0" style={{ color: "#4285F4", borderColor: "#E0E0E0" }}>
                {connection.provider === "google" ? "G" : "O"}
              </span>
              <span className="flex-1 text-xs font-semibold truncate" style={{ color: "#49454F" }}>
                {connection.provider === "google" ? "Google" : "Outlook"} Calendar · {connection.connectedEmail}
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                data-testid="meeting-disconnect-calendar"
                className="text-xs text-[#DC2626] hover:underline focus-visible:outline-none font-medium shrink-0"
              >
                Disconnect
              </button>
            </div>
          )}

          {connection.status === "degraded" && (
            <div
              data-testid="meeting-calendar-connected-chip"
              className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 animate-pulse"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold shrink-0 text-amber-600" style={{ borderColor: "#E0E0E0" }}>
                ⚠️
              </span>
              <span className="flex-1 text-xs font-semibold text-amber-800 truncate">
                Sync Degraded · {connection.lastSyncError || "connectivity failed"}
              </span>
              <button
                type="button"
                onClick={handleReconnect}
                className="text-xs text-amber-905 hover:underline font-semibold shrink-0"
              >
                Reconnect
              </button>
            </div>
          )}

          {connection.status === "reconnect_required" && (
            <div
              data-testid="meeting-calendar-connected-chip"
              className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border text-[10px] font-bold shrink-0 text-red-600" style={{ borderColor: "#E0E0E0" }}>
                ❌
              </span>
              <span className="flex-1 text-xs font-semibold text-red-800 truncate">
                Connection Expired · Reconnect Required
              </span>
              <button
                type="button"
                onClick={handleReconnect}
                className="text-xs text-[#DC2626] hover:underline font-bold shrink-0"
              >
                Reconnect
              </button>
            </div>
          )}

          {connection.status === "not_connected" && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 bg-gray-50/50" style={{ borderColor: "#E0E0E0" }}>
              <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: "#79747E" }} />
              <span className="flex-1 text-xs" style={{ color: "#79747E" }}>
                Connect Google Calendar or Outlook to Slipwise.
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="meeting-connect-calendar-btn"
                  onClick={() => window.location.href = "/api/messaging/calendar/connections/google/connect"}
                  className="text-xs font-semibold text-[#DC2626] hover:underline focus-visible:outline-none"
                >
                  Connect Google
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => window.location.href = "/api/messaging/calendar/connections/outlook/connect"}
                  className="text-xs font-semibold text-[#DC2626] hover:underline focus-visible:outline-none"
                >
                  Connect Outlook
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <span className="text-sm text-gray-500">Loading meetings...</span>
            </div>
          ) : error === "Access denied or not found" ? (
            <div data-testid="meeting-panel-restricted" className="text-center py-12 px-4 rounded-xl border border-red-100 bg-red-50/50">
              <p className="text-sm font-semibold text-red-800">Access Restricted</p>
              <p className="text-xs text-red-600 mt-1">You must be an active conversation participant to view meetings.</p>
            </div>
          ) : (
            <>
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
                            {m.participantCount || 6} participants · {m.durationMinutes} min
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                            {new Date(m.scheduledAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            data-testid={`meeting-join-${m.id}`}
                            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                          >
                            Join
                          </button>
                          {conversationId && (
                            <button
                              type="button"
                              onClick={() => handleCancelMeeting(m.id)}
                              className="shrink-0 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
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
                            {m.participantCount || 4} participants · {m.durationMinutes} min
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                            {new Date(m.scheduledAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold" style={{ color: "#79747E" }}>
                          {m.status.toUpperCase() === "CANCELLED" ? "Cancelled" : "Ended"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "calendar" && (
                <CalendarGrid meetings={gridMeetings} now={now} />
              )}
            </>
          )}
        </div>

        {showSchedule && (
          <MessagingMeetingSchedule
            conversationId={conversationId}
            onClose={() => setShowSchedule(false)}
            onSuccess={(newMeet) => setMeetings([newMeet, ...meetings])}
            calendarConnection={connection}
          />
        )}
      </div>
    </div>
  );
}
