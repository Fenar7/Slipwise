"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ToggleSwitch } from "./messaging-ui-primitives";

interface MessagingNotificationPreferencesProps {
  onClose: () => void;
}

export function MessagingNotificationPreferences({
  onClose,
}: MessagingNotificationPreferencesProps) {
  // Preferences states
  const [allNotifs, setAllNotifs] = React.useState(true);
  const [mentions, setMentions] = React.useState(true);
  const [replies, setReplies] = React.useState(true);
  const [tasks, setTasks] = React.useState(true);
  const [meetings, setMeetings] = React.useState(true);
  const [dnd, setDnd] = React.useState(false);

  // UI state
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- conversation list shape from API
  const [conversations, setConversations] = React.useState<any[]>([]);

  // Keyboard navigation
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Load preferences and active channels/groups
  React.useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [prefRes, convRes] = await Promise.all([
          fetch("/api/messaging/notification-preferences"),
          fetch("/api/messaging/conversations"),
        ]);

        if (prefRes.ok) {
          const prefPayload = await prefRes.json();
          if (prefPayload.success && prefPayload.data) {
            const data = prefPayload.data;
            setAllNotifs(data.allNotificationsEnabled);
            setMentions(data.mentionsEnabled);
            setReplies(data.repliesEnabled);
            setTasks(data.taskRemindersEnabled);
            setMeetings(data.meetingRemindersEnabled);
            setDnd(data.dndEnabled);
          }
        }

        if (convRes.ok) {
          const convPayload = await convRes.json();
          if (convPayload.success && convPayload.data?.conversations) {
            // Keep only Channels and Groups (no DMs)
            const list = convPayload.data.conversations.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape
              (c: any) => c.type === "CHANNEL" || c.type === "GROUP",
            );
            setConversations(list);
          }
        }
      } catch (err) {
        console.error("Failed to load notification settings:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Save preferences
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/messaging/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allNotificationsEnabled: allNotifs,
          mentionsEnabled: mentions,
          repliesEnabled: replies,
          taskRemindersEnabled: tasks,
          meetingRemindersEnabled: meetings,
          dndEnabled: dnd,
        }),
      });

      if (res.ok) {
        onClose();
      } else {
        console.error("Failed to save notification preferences");
      }
    } catch (err) {
      console.error("Error saving preferences:", err);
    } finally {
      setSaving(false);
    }
  }

  // Toggle Mute on a conversation
  async function handleToggleMute(conversationId: string, currentMuted: boolean) {
    // Optimistic UI update
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, isMuted: !currentMuted } : c)),
    );

    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMuted: !currentMuted }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        // Rollback
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, isMuted: currentMuted } : c)),
        );
      }
    } catch {
      // Rollback
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, isMuted: currentMuted } : c)),
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Notification preferences"
      data-testid="notif-preferences-modal"
    >
      <div className="mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-bold" style={{ color: "#1C1B1F" }}>
          Notification preferences
        </h2>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Loading preferences...
          </div>
        ) : (
          <>
            {/* Main toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  All notifications
                </span>
                <ToggleSwitch
                  checked={allNotifs}
                  onChange={setAllNotifs}
                  label="All notifications"
                  testId="notif-pref-all"
                  disabled={saving}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Mention notifications
                </span>
                <ToggleSwitch
                  checked={mentions}
                  onChange={setMentions}
                  label="Mention notifications"
                  testId="notif-pref-mentions"
                  disabled={saving || !allNotifs}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Reply notifications
                </span>
                <ToggleSwitch
                  checked={replies}
                  onChange={setReplies}
                  label="Reply notifications"
                  testId="notif-pref-replies"
                  disabled={saving || !allNotifs}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Task reminders
                </span>
                <ToggleSwitch
                  checked={tasks}
                  onChange={setTasks}
                  label="Task reminders"
                  testId="notif-pref-tasks"
                  disabled={saving || !allNotifs}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Meeting reminders
                </span>
                <ToggleSwitch
                  checked={meetings}
                  onChange={setMeetings}
                  label="Meeting reminders"
                  testId="notif-pref-meetings"
                  disabled={saving || !allNotifs}
                />
              </div>
            </div>

            {/* DND section */}
            <div
              className="mt-5 space-y-2 rounded-lg border p-3"
              style={{ borderColor: "#F0F0F0" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Enable DND
                </span>
                <ToggleSwitch
                  checked={dnd}
                  onChange={setDnd}
                  label="Enable Do Not Disturb"
                  testId="notif-pref-dnd"
                  disabled={saving}
                />
              </div>
              {dnd && (
                <p className="text-[11px]" style={{ color: "#79747E" }}>
                  Quiet hours active from 10:00 PM to 8:00 AM (Fixed window)
                </p>
              )}
            </div>

            {/* Channel / Group Mute settings */}
            <div className="mt-5 space-y-2">
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#79747E" }}
              >
                Mute settings
              </p>
              {conversations.length === 0 ? (
                <p className="text-xs italic text-gray-400">No active channels or groups</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {conversations.map((c) => {
                    const isMuted = c.isMuted ?? false;
                    const displayName = c.type === "CHANNEL" ? `#${c.name}` : c.name;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                        style={{ borderColor: "#F0F0F0" }}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <span
                            className="block truncate text-sm font-medium"
                            style={{ color: "#1C1B1F" }}
                          >
                            {displayName}
                          </span>
                        </div>
                        <ToggleSwitch
                          checked={isMuted}
                          onChange={() => handleToggleMute(c.id, isMuted)}
                          label={`Mute ${displayName}`}
                          testId={`notif-pref-mute-${c.id}`}
                          disabled={saving}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#49454F" }}
                onClick={onClose}
                data-testid="notif-pref-cancel"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
                onClick={handleSave}
                data-testid="notif-pref-save"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save preferences"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
