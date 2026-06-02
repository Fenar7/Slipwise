"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Video, AlertCircle, Clock, ExternalLink } from "lucide-react";

export interface ImminentAlertData {
  meetingId: string;
  conversationId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  urgency: "SIXTY_MINUTES" | "FIFTEEN_MINUTES";
  msUntilStart: number;
  joinUrl: string | null;
  hasMore: boolean;
  totalCount: number;
}

interface ImminentMeetingBannerProps {
  /** Poll interval in ms. Default 60 000 (1 min). Shorter for tests. */
  pollIntervalMs?: number;
}

/**
 * Global imminent-meeting alert rendered inside the authenticated app shell.
 * Fetches authoritative state from /api/messaging/meetings/imminent-alert every minute.
 * Countdown is client-rendered for UX; eligibility comes from server.
 *
 * Disappears when no imminent meeting exists (server returns null).
 * Join button only renders when server provides a valid authorized join URL.
 */
export function ImminentMeetingBanner({ pollIntervalMs = 60_000 }: ImminentMeetingBannerProps) {
  const [alert, setAlert] = useState<ImminentAlertData | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [dismissed, setDismissed] = useState<string | null>(null); // meetingId that was dismissed

  const fetchAlert = useCallback(async () => {
    try {
      const res = await fetch("/api/messaging/meetings/imminent-alert", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json() as { alert: ImminentAlertData | null };
      const newAlert = data.alert ?? null;

      setAlert((prev) => {
        // Reset dismiss if the meeting changed.
        if (newAlert && newAlert.meetingId !== dismissed) {
          return newAlert;
        }
        if (!newAlert) {
          setDismissed(null);
          return null;
        }
        return prev;
      });
    } catch {
      // Network errors must not crash the shell.
    }
  }, [dismissed]);

  // Poll server for authoritative state.
  useEffect(() => {
    fetchAlert();
    const id = setInterval(fetchAlert, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchAlert, pollIntervalMs]);

  // Client-side countdown ticker — UX only; urgency classification comes from server.
  useEffect(() => {
    if (!alert) return;

    const tick = () => {
      const serverMs = alert.msUntilStart;
      const fetchedAt = new Date(alert.scheduledAt).getTime() - serverMs;
      const remaining = new Date(alert.scheduledAt).getTime() - Date.now();

      if (remaining <= -alert.durationMinutes * 60 * 1000) {
        // Meeting has ended on client — next poll will clear the alert.
        setCountdown("Ended");
        return;
      }

      if (remaining <= 0) {
        setCountdown("Starting now");
        return;
      }

      const totalSec = Math.ceil(remaining / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      setCountdown(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [alert]);

  if (!alert || dismissed === alert.meetingId) return null;

  const isElevated = alert.urgency === "FIFTEEN_MINUTES";

  const bannerBase =
    "fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5 shadow-md transition-colors";
  const bannerColor = isElevated
    ? "bg-red-600 text-white"
    : "bg-blue-700 text-white";

  return (
    <div
      data-testid="imminent-meeting-banner"
      data-meeting-id={alert.meetingId}
      data-urgency={alert.urgency}
      className={`${bannerBase} ${bannerColor}`}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <div className="shrink-0">
        {isElevated ? (
          <AlertCircle className="h-4 w-4" data-testid="urgency-elevated-icon" />
        ) : (
          <Video className="h-4 w-4" data-testid="urgency-normal-icon" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className="text-sm font-semibold truncate" data-testid="banner-meeting-title">
          {alert.title}
        </span>
        <span className="text-xs opacity-80 shrink-0 flex items-center gap-1" data-testid="banner-countdown">
          <Clock className="h-3 w-3" />
          {countdown}
        </span>
        {alert.hasMore && (
          <span className="text-xs opacity-70 shrink-0" data-testid="banner-has-more">
            +{alert.totalCount - 1} more
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {alert.joinUrl ? (
          <a
            href={alert.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="banner-join-btn"
            className="flex items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Join Meeting
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span
            data-testid="banner-no-join"
            className="text-xs opacity-60 italic"
          >
            No join link
          </span>
        )}

        <a
          href={`/app/messaging?conversation=${alert.conversationId}`}
          data-testid="banner-view-meeting"
          className="text-xs underline opacity-80 hover:opacity-100 focus-visible:outline-none"
        >
          View
        </a>

        <button
          type="button"
          data-testid="banner-dismiss"
          onClick={() => setDismissed(alert.meetingId)}
          aria-label="Dismiss meeting alert"
          className="rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
