import "server-only";

import { db } from "@/lib/db";
import type { MeetingReminderRecord } from "./domain-types";
import { toMeetingReminderRecord } from "./mappers";
import type { MeetingReminderWindow } from "./domain-types";
import { createNotification } from "@/lib/notifications";
import { logMessagingAudit } from "./audit";
import { getMessagingPreferences, isCurrentlyInQuietHours } from "./notification-service";

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

// ─── Notification Delivery ─────────────────────────────────────────────────────

async function sendMeetingReminderNotifications(
  orgId: string,
  meeting: { id: string; title: string; conversationId: string },
  window: MeetingReminderWindow,
): Promise<void> {
  const participants = await db.conversationParticipant.findMany({
    where: { orgId, conversationId: meeting.conversationId, leftAt: null },
    select: { userId: true },
  });
  if (!participants || participants.length === 0) return;

  const declined = await db.meetingAttendee.findMany({
    where: { meetingId: meeting.id, orgId, rsvpStatus: "DECLINED" },
    select: { userId: true },
  });
  const declinedUserIds = new Set(declined?.map((d) => d.userId) ?? []);

  const eligibleUserIds = participants
    .map((p) => p.userId)
    .filter((userId) => !declinedUserIds.has(userId));

  if (eligibleUserIds.length === 0) return;

  const members = await db.member.findMany({
    where: { organizationId: orgId, userId: { in: eligibleUserIds } },
    include: { user: { select: { email: true } } },
  });
  const emailByUserId = new Map(members?.map((m) => [m.userId, m.user?.email ?? null]) ?? []);

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app";
  const link = `${base}/app/messaging/conversations/${meeting.conversationId}`;
  const minutes = window === "SIXTY_MINUTES" ? "60" : "15";

  for (const userId of eligibleUserIds) {
    const email = emailByUserId.get(userId) ?? null;
    try {
      await createNotification({
        userId,
        orgId,
        type: "MEETING_REMINDER",
        title: `Meeting Reminder: ${meeting.title}`,
        body: `Meeting "${meeting.title}" starts in ${minutes} minutes.`,
        link,
        emailRequested: Boolean(email),
        recipientEmail: email ?? undefined,
        sourceModule: "messaging",
        sourceRef: meeting.id,
        dedupeKey: `meeting_reminder:${meeting.id}:${window}`,
      });
    } catch (err) {
      console.error(`[meeting-reminder] Failed to send notification to ${userId}:`, err);
    }
  }
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

    await sendMeetingReminderNotifications(orgId, meeting, window).catch((err) => {
      console.error("[meeting-reminder-service] Failed to send notifications:", err);
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

// ─── Bounded Server-Owned sweep ────────────────────────────────────────────────

/**
 * Main global entry point for the meeting reminder cron sweep.
 * Scans upcoming meetings across all orgs in the next 70 minutes and dispatches pending windows.
 * Idempotent, bounded, and server-owned.
 */
export async function dispatchDueMeetingReminders(now = new Date(), limit = 100): Promise<{ dispatched: number; evaluated: number }> {
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);

  // Structured operational signal
  const startAudit = db.messagingAuditEvent.create({
    data: {
      orgId: "__system__",
      actorId: "00000000-0000-0000-0000-000000000000",
      action: "ADMIN_SUPPORT_ACTION",
      summary: "Meeting reminder sweep started",
      metadata: { sweepType: "meeting_reminder", limit },
    },
  });
  if (startAudit && typeof startAudit.catch === "function") {
    await startAudit.catch(() => {});
  }

  const upcomingMeetings = await db.conversationMeeting.findMany({
    where: {
      status: "UPCOMING",
      scheduledAt: { lte: windowEnd },
    },
    take: limit,
    select: {
      id: true,
      orgId: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      scheduledBy: true,
      conversationId: true,
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

  // Structured operational signal
  const endAudit = db.messagingAuditEvent.create({
    data: {
      orgId: "__system__",
      actorId: "00000000-0000-0000-0000-000000000000",
      action: "ADMIN_SUPPORT_ACTION",
      summary: "Meeting reminder sweep completed",
      metadata: { sweepType: "meeting_reminder", evaluated: upcomingMeetings.length, dispatched },
    },
  });
  if (endAudit && typeof endAudit.catch === "function") {
    await endAudit.catch(() => {});
  }

  return { dispatched, evaluated: upcomingMeetings.length };
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

export interface MeetingReminderDispatchResult {
  dispatched: number;
  skippedInactiveConversation: number;
  skippedNoParticipants: number;
  failed: number;
  evaluated: number;
}

/**
 * Sweeps and dispatches reminders for upcoming meetings (Sprint 9.3).
 * Bounded and idempotent, using reminderSentAt.
 */
export async function dispatchDueMeetingRemindersSprint93(
  limit = 50,
): Promise<MeetingReminderDispatchResult> {
  const now = new Date();
  const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const result: MeetingReminderDispatchResult = {
    dispatched: 0,
    skippedInactiveConversation: 0,
    skippedNoParticipants: 0,
    failed: 0,
    evaluated: 0,
  };

  logMessagingAudit({
    orgId: "__system__",
    actorId: "__sweep__",
    action: "ADMIN_SUPPORT_ACTION",
    summary: "Meeting reminder sweep started",
    metadata: { sweepType: "meeting_reminder_9_3", limit },
  }).catch(() => {});

  const candidates = await db.conversationMeeting.findMany({
    where: {
      status: "UPCOMING",
      scheduledAt: {
        lte: fifteenMinutesFromNow,
        gt: thirtyMinutesAgo,
      },
      reminderSentAt: null,
    },
    include: {
      conversation: {
        select: {
          id: true,
          name: true,
          archivedAt: true,
          lockedAt: true,
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  result.evaluated = candidates.length;

  if (candidates.length === 0) {
    logMessagingAudit({
      orgId: "__system__",
      actorId: "__sweep__",
      action: "ADMIN_SUPPORT_ACTION",
      summary: "Meeting reminder sweep completed — no candidates",
      metadata: { sweepType: "meeting_reminder_9_3", evaluated: 0 },
    }).catch(() => {});
    return result;
  }

  for (const candidate of candidates) {
    if (candidate.conversation.archivedAt || candidate.conversation.lockedAt) {
      result.skippedInactiveConversation++;
      await db.conversationMeeting.update({
        where: { id: candidate.id },
        data: { reminderSentAt: now },
      }).catch(() => {});
      continue;
    }

    const claimed = await db.conversationMeeting.updateMany({
      where: {
        id: candidate.id,
        reminderSentAt: null,
        status: "UPCOMING",
      },
      data: { reminderSentAt: now },
    });

    if (claimed.count === 0) {
      continue;
    }

    const participants = await db.conversationParticipant.findMany({
      where: {
        orgId: candidate.orgId,
        conversationId: candidate.conversationId,
        leftAt: null,
      },
      select: { userId: true },
    });

    if (participants.length === 0) {
      result.skippedNoParticipants++;
      continue;
    }

    for (const p of participants) {
      try {
        const pref = await getMessagingPreferences({ userId: p.userId, orgId: candidate.orgId });
        const readState = await db.conversationReadState.findFirst({
          where: {
            conversationId: candidate.conversationId,
            userId: p.userId,
          },
          select: { isMuted: true },
        });
        const isMuted = readState?.isMuted ?? false;

        // If the category is explicitly disabled, or the conversation is muted, skip notifications entirely.
        if (!pref.allNotificationsEnabled || !pref.meetingRemindersEnabled || isMuted) {
          continue;
        }

        // Otherwise, create the in-app notification.
        // If in quiet hours, DND suppresses active email delivery, but we still create the in-app notification.
        const inQuietHours = isCurrentlyInQuietHours(pref);

        const profile = await db.profile.findUnique({
          where: { id: p.userId },
          select: { email: true },
        });

        const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app"}/app/messaging/conversations/${candidate.conversationId}`;

        await createNotification({
          userId: p.userId,
          orgId: candidate.orgId,
          type: "MEETING_REMINDER",
          title: `Upcoming Meeting: ${candidate.title}`,
          body: `Meeting "${candidate.title}" starts in 15 minutes.`,
          link,
          emailRequested: !inQuietHours && Boolean(profile?.email),
          recipientEmail: !inQuietHours ? (profile?.email ?? undefined) : undefined,
          sourceModule: "messaging",
          sourceRef: candidate.id,
          dedupeKey: `meeting_reminder:${candidate.id}:FIFTEEN_MINUTES`,
        });
      } catch (err) {
        console.error(`[meeting-reminders-9-3] Failed to notify user ${p.userId}:`, err);
      }
    }

    result.dispatched++;
  }

  logMessagingAudit({
    orgId: "__system__",
    actorId: "__sweep__",
    action: "ADMIN_SUPPORT_ACTION",
    summary: "Meeting reminder sweep completed",
    metadata: {
      sweepType: "meeting_reminder_9_3",
      evaluated: result.evaluated,
      dispatched: result.dispatched,
      skippedInactiveConversation: result.skippedInactiveConversation,
      skippedNoParticipants: result.skippedNoParticipants,
    },
  }).catch(() => {});

  return result;
}

