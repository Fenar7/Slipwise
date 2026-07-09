"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Bell,
  MessageSquare,
  CheckSquare,
  Calendar,
  Hash,
} from "lucide-react";
import type { MessagingNotification, NotificationFilterKind } from "./types";
import { RadioPill } from "./messaging-ui-primitives";
import { MessagingNotificationPreferences } from "./messaging-notification-preferences";

interface MessagingNotificationsPanelProps {
  onClose: () => void;
  notifications: MessagingNotification[];
  onMarkAllRead: () => void;
  onToggleRead: (id: string) => void;
}

const FILTER_OPTIONS: { value: NotificationFilterKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mentions", label: "Mentions" },
  { value: "unread", label: "Unread" },
];

function kindIcon(kind: MessagingNotification["kind"]) {
  switch (kind) {
    case "mention":
      return <Bell className="h-3.5 w-3.5" />;
    case "reply":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "task_reminder":
    case "task_assigned":
      return <CheckSquare className="h-3.5 w-3.5" />;
    case "meeting_reminder":
      return <Calendar className="h-3.5 w-3.5" />;
    case "channel_invite":
      return <Hash className="h-3.5 w-3.5" />;
  }
}

function timeAgoLabel(occurredAt: string): string {
  const diffMs = Date.now() - new Date(occurredAt).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MessagingNotificationsPanel({
  onClose,
  notifications,
  onMarkAllRead,
  onToggleRead,
}: MessagingNotificationsPanelProps) {
  const [filter, setFilter] = React.useState<NotificationFilterKind>("all");
  const [prefsOpen, setPrefsOpen] = React.useState(false);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filtered = React.useMemo(() => {
    if (filter === "mentions") {
      return notifications.filter((n) => n.kind === "mention");
    }
    if (filter === "unread") {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [notifications, filter]);

  function markAllRead() {
    onMarkAllRead();
  }

  function toggleRead(id: string) {
    onToggleRead(id);
  }

  return (
    <>
      <div
        className="fixed top-12 right-0 z-40 flex h-[calc(100vh-3rem)] w-80 flex-col border-l bg-white shadow-lg"
        style={{ borderColor: "#E0E0E0" }}
        data-testid="notifications-panel"
        role="region"
        aria-label="Notifications"
      >
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b px-4"
          style={{ borderColor: "#E0E0E0" }}
        >
          <span className="text-sm font-bold" style={{ color: "#1C1B1F" }}>
            Notifications
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              style={{ color: "#49454F" }}
              onClick={markAllRead}
              data-testid="notif-mark-all-read"
            >
              Mark all read
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              aria-label="Close notifications panel"
              onClick={onClose}
              data-testid="notif-panel-close"
            >
              <X className="h-4 w-4" style={{ color: "#79747E" }} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: "#F0F0F0" }}>
          <RadioPill
            name="notif-filter"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={(v) => setFilter(v as NotificationFilterKind)}
          />
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {filtered.length === 0 ? (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "#79747E" }}
              data-testid="notif-list-empty"
            >
              No notifications here.
            </div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleRead(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                  !n.read
                    ? "border-l-2 border-[#DC2626] bg-red-50/30"
                    : "hover:bg-gray-50"
                )}
                data-testid={`notif-row-${n.id}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold" style={{ color: "#49454F" }}>
                  {n.actorInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug" style={{ color: "#1C1B1F" }}>
                    {n.body}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#79747E" }}>
                      {kindIcon(n.kind)}
                      {timeAgoLabel(n.occurredAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-4 py-2"
          style={{ borderColor: "#F0F0F0" }}
        >
          <button
            type="button"
            className="text-xs font-semibold transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ color: "#49454F" }}
            onClick={() => setPrefsOpen(true)}
            data-testid="notif-preferences-link"
          >
            Notification preferences
          </button>
        </div>
      </div>

      {prefsOpen && (
        <MessagingNotificationPreferences onClose={() => setPrefsOpen(false)} />
      )}
    </>
  );
}
