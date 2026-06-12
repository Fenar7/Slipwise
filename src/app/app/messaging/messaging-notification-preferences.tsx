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
  const [allNotifs, setAllNotifs] = React.useState(true);
  const [mentions, setMentions] = React.useState(true);
  const [replies, setReplies] = React.useState(true);
  const [tasks, setTasks] = React.useState(true);
  const [meetings, setMeetings] = React.useState(true);
  const [dnd, setDnd] = React.useState(false);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Notification preferences"
      data-testid="notif-preferences-modal"
    >
      <div className="mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border bg-white p-5 shadow-xl">
        <h2
          className="mb-4 text-base font-bold"
          style={{ color: "#1C1B1F" }}
        >
          Notification preferences
        </h2>

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
            />
          </div>
          {dnd && (
            <p className="text-xs" style={{ color: "#79747E" }}>
              Active from 10:00 PM to 8:00 AM
            </p>
          )}
        </div>

        {/* Channel settings */}
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
            Channel settings
          </p>
          {["payroll", "compliance"].map((ch) => (
            <div
              key={ch}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: "#F0F0F0" }}
            >
              <div>
                <span className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  #{ch}
                </span>
                <span className="ml-2 text-[10px]" style={{ color: "#79747E" }}>
                  Mentions only
                </span>
              </div>
              <ToggleSwitch
                checked={false}
                onChange={() => {}}
                label={`Mute ${ch}`}
                testId={`notif-pref-mute-${ch}`}
              />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
            onClick={onClose}
            data-testid="notif-pref-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            onClick={onClose}
            data-testid="notif-pref-save"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
