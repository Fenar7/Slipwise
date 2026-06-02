import "server-only";

import { db } from "@/lib/db";
import type { MeetingReminderRecord } from "./domain-types";
import { toMeetingReminderRecord } from "./mappers";
import type { MeetingReminderWindow } from "./domain-types";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Window durations in milliseconds — matches MeetingReminderWindow enum. */
const WINDOW_MS: Record<MeetingReminderWindow, number> = {
  SIXTY_MINUTES: 60 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
};

// ─── Eligibility check ─────────────────────────────────────────────────────────

/**
 * Whether a meeting is eligible for reminder dispatch at a given urgency window.
 * Meeting must be UPCOMING, must not have ended, and the window must be active.
 */
function isEligibleForWindow(
  scheduledAt: Date,
  durationMinutes: number,
  status: string,
  window: MeetingReminderWindow,
  now: Date,
): boolean {
  if (status === "CANCELLED" || status === "ENDED") return false;

  const startMs = scheduledAt.getTime();
  const endMs = startMs + durationMinutes * 60 * 1000;
  const nowMs = now.getTime();

  // Meeting must not have already ended.
  if (nowMs > endMs) return false;

  // We're within the window if now is within windowMs before start (or meeting has started but not ended).
  const msUntilStart = startMs - nowMs;
  return msUntilStart <= WINDOW_MS[window];
}

// ─── Dispatch: bounded idempotent reminder ─────────────────────────────────────

/**
 * Attempt to dispatch a reminder for a single meeting at a given window.
 *
 * Idempotency contract:
 * - There is at most ONE MeetingReminder row per (meetingId, window).
 * - If sentAt is already set, dispatch is a no-op.
 * - If the meeting is cancelled/ended at dispatch time, the record is marked skipped.
 *
 * This function does NOT send external notifications — it records the dispatch
 * and returns the record for the caller to act on (e.g. send an in-app alert, email, push).
 * This separation keeps reminder orchestration testable and replay-safe.
 *
 * Returns the reminder record. Returns null if already dispatched or not yet eligible.
 */
export async function dispatchMeetingReminder(
  orgId: string,
  meetingId: string,
  window: MeetingReminderWindow,
  now = new Date(),
): Promise<MeetingReminderRecord | null> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) return null;

  // Check for existing reminder record for this window.
  const existing = await db.meetingReminder.findUnique({
    where: { meetingId_window: { meetingId, window } },
  });

  if (existing) {
    // Already dispatched or already skipped — idempotent no-op.
    return toMeetingReminderRecord(existing);
  }

  const eligible = isEligibleForWindow(
    meeting.scheduledAt,
    meeting.durationMinutes,
    meeting.status,
    window,
    now,
  );

  const shouldSkip =
    meeting.status === "CANCELLED" ||
    meeting.status === "ENDED" ||
    !eligible;

  const reminder = await db.meetingReminder.create({
    data: {
      orgId,
      meetingId,
      window,
      sentAt: shouldSkip ? null : now,
      skipped: shouldSkip,
    },
  });

  // Write audit only for real dispatches (not skips).
  if (!shouldSkip) {
    await db.messagingAuditEvent.create({
      data: {
        orgId,
        actorId: meeting.scheduledBy,
        action: "MEETING_REMINDER_DISPATCHED",
        summary: `Meeting reminder dispatched (${window}): ${meeting.title}`,
        conversationId: meeting.conversationId,
        meetingId,
        metadata: { window },
      },
    });
  }

  return toMeetingReminderRecord(reminder);
}

// ─── Batch: process all pending reminders for eligible upcoming meetings ───────

/**
 * Scan upcoming meetings and dispatch any pending reminder windows.
 * Called by a server-side job or on-demand from the alert API.
 *
 * Bounded: only processes meetings in the next 70 minutes (covers SIXTY_MINUTES window with buffer).
 * Safe to call repeatedly — idempotency is enforced by the unique (meetingId, window) constraint.
 *
 * Returns the count of new reminder records created.
 */
export async function processPendingReminders(orgId: string, now = new Date()): Promise<number> {
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);

  const upcomingMeetings = await db.conversationMeeting.findMany({
    where: {
      orgId,
      status: "UPCOMING",
      scheduledAt: { lte: windowEnd },
    },
    select: {
      id: true,
      orgId: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      reminders: {
        select: { window: true },
      },
    },
  });

  let dispatched = 0;

  for (const meeting of upcomingMeetings) {
    const dispatchedWindows = new Set(meeting.reminders.map((r) => r.window));

    for (const window of ["SIXTY_MINUTES", "FIFTEEN_MINUTES"] as MeetingReminderWindow[]) {
      if (dispatchedWindows.has(window)) continue;

      const eligible = isEligibleForWindow(
        meeting.scheduledAt,
        meeting.durationMinutes,
        meeting.status,
        window,
        now,
      );

      if (eligible) {
        await dispatchMeetingReminder(meeting.orgId, meeting.id, window, now);
        dispatched++;
      }
    }
  }

  return dispatched;
}

// ─── Read: reminder state for a meeting ───────────────────────────────────────

/**
 * Return all reminder records for a meeting. Used for diagnostics and test assertions.
 */
export async function listMeetingReminders(
  orgId: string,
  meetingId: string,
): Promise<MeetingReminderRecord[]> {
  const rows = await db.meetingReminder.findMany({
    where: { orgId, meetingId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMeetingReminderRecord);
}
