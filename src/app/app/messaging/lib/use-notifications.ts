"use client";
import { useState, useCallback, useEffect } from "react";
import type { MessagingNotification } from "../types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<MessagingNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messaging/notifications");
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load notifications");
        return;
      }

      const raw = payload.data.notifications || [];
      const mapped: MessagingNotification[] = raw.map((n: any) => {
        let actorName = "System";
        let actorInitials = "SW";
        let body = n.body;

        if (n.type === "MENTION" || n.type === "REPLY") {
          const idx = n.body.indexOf(":");
          if (idx > 0) {
            actorName = n.body.slice(0, idx).trim();
            actorInitials = actorName
              .split(" ")
              .map((word: string) => word[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            body = n.body.slice(idx + 1).trim();
          } else {
            actorName = "Someone";
            actorInitials = "SO";
          }
        }

        let kind = "mention";
        if (n.type === "REPLY") kind = "reply";
        else if (n.type === "TASK_REMINDER") kind = "task_reminder";
        else if (n.type === "TASK_ASSIGNED") kind = "task_assigned";
        else if (n.type === "MEETING_REMINDER") kind = "meeting_reminder";

        return {
          id: n.id,
          kind,
          actorName,
          actorInitials,
          body,
          conversationRef: n.link ? n.link.split("/").pop() || null : null,
          occurredAt: n.createdAt,
          read: n.isRead,
        };
      });

      setNotifications(mapped);
      setUnreadCount(payload.data.unreadCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const markToggle = useCallback(async (id: string, currentRead: boolean) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !currentRead } : n))
    );
    setUnreadCount((prev) => (currentRead ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const res = await fetch("/api/messaging/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id, isRead: !currentRead }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: currentRead } : n))
        );
        setUnreadCount((prev) => (currentRead ? Math.max(0, prev - 1) : prev + 1));
      }
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: currentRead } : n))
      );
      setUnreadCount((prev) => (currentRead ? Math.max(0, prev - 1) : prev + 1));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/messaging/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        fetchNotifications();
      }
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markToggle,
    markAllRead,
  };
}
