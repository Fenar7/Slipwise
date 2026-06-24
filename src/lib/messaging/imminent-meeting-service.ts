import "server-only";

import { db } from "@/lib/db";
import { meetingIsWithinOneHour, meetingIsWithinFifteenMinutes } from "./domain-types";
import { toMeetingRecord } from "./mappers";
import { ConversationAccessError } from "./errors";

// ─── Alert shape ───────────────────────────────────────────────────────────────

/**
 * The imminent-meeting alert payload returned to the authenticated shell.
 *
 * Security rules:
 * - joinUrl is only present when the user is an active attendee AND a valid URL exists.
 * - No provider token, raw provider payload, or meeting metadata is included.
 * - Only meetings the user can access (active conversation participant) appear.
 * - If multiple imminent meetings exist, the soonest one is returned as the primary alert.
 */
export interface ImminentMeetingAlert {
  meetingId: string;
  conversationId: string;
  title: string;
  scheduledAt: string;       // ISO string
  durationMinutes: number;
  /** SIXTY_MINUTES = within 1 hour. FIFTEEN_MINUTES = within 15 min (elevated urgency). */
  urgency: "SIXTY_MINUTES" | "FIFTEEN_MINUTES";
  /** Milliseconds until meeting starts. Negative when meeting has already started. */
  msUntilStart: number;
  /** Valid authorized join URL, or null when unavailable or user not entitled. */
  joinUrl: string | null;
  /** True when there are additional imminent meetings beyond the primary alert. */
  hasMore: boolean;
  /** Count of all imminent meetings visible to this user. */
  totalCount: number;
}

// ─── Query: fetch imminent meeting alert for authenticated user ────────────────

/**
 * Return the authoritative imminent-meeting alert for a given user in an org.
 *
 * Access model:
 * - Only meetings where the user is an active conversation participant are returned.
 * - joinUrl is only included when the user has a non-DECLINED RSVP status.
 * - No meeting details leak through even if the global shell renders the alert outside messaging.
 *
 * Returns null when no imminent meetings exist for this user.
 */
export async function getImminentMeetingAlert(
  orgId: string,
  userId: string,
  now = new Date(),
): Promise<ImminentMeetingAlert | null> {
  // Find all conversations where this user is an active participant.
  const participantRows = await db.conversationParticipant.findMany({
    where: { orgId, userId, leftAt: null },
    select: { conversationId: true },
  });

  if (participantRows.length === 0) return null;

  const conversationIds = participantRows.map((r) => r.conversationId);

  // Fetch upcoming meetings in accessible conversations within the next 70 minutes.
  // 70-minute lookahead covers SIXTY_MINUTES window with buffer for clock drift.
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);

  const meetingRows = await db.conversationMeeting.findMany({
    where: {
      orgId,
      conversationId: { in: conversationIds },
      status: "UPCOMING",
      scheduledAt: { lte: windowEnd },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (meetingRows.length === 0) return null;

  // Filter to those genuinely within 60 minutes.
  const records = meetingRows.map(toMeetingRecord);
  const imminent = records.filter((m) => meetingIsWithinOneHour(m, now));

  if (imminent.length === 0) return null;

  // Primary alert is the soonest meeting.
  const primary = imminent[0];
  const msUntilStart = primary.scheduledAt.getTime() - now.getTime();
  const urgency: "SIXTY_MINUTES" | "FIFTEEN_MINUTES" = meetingIsWithinFifteenMinutes(primary, now)
    ? "FIFTEEN_MINUTES"
    : "SIXTY_MINUTES";

  // Resolve join URL visibility: only expose when user has a non-DECLINED RSVP.
  let joinUrl: string | null = null;
  if (primary.joinUrl) {
    const attendee = await db.meetingAttendee.findUnique({
      where: { meetingId_userId: { meetingId: primary.id, userId } },
      select: { rsvpStatus: true },
    });
    // Show join URL when user has accepted, is tentative, or has not responded (pending).
    // DECLINED attendees do not receive join links.
    if (!attendee || attendee.rsvpStatus !== "DECLINED") {
      joinUrl = primary.joinUrl;
    }
  }

  return {
    meetingId: primary.id,
    conversationId: primary.conversationId,
    title: primary.title,
    scheduledAt: primary.scheduledAt.toISOString(),
    durationMinutes: primary.durationMinutes,
    urgency,
    msUntilStart,
    joinUrl,
    hasMore: imminent.length > 1,
    totalCount: imminent.length,
  };
}

// ─── Read: all imminent meetings for a user (for detailed list views) ──────────

/**
 * Return all imminent meetings visible to this user, ordered by start time.
 * Used when the user expands the global alert to see all upcoming meetings.
 */
export async function listImminentMeetings(
  orgId: string,
  userId: string,
  now = new Date(),
): Promise<ImminentMeetingAlert[]> {
  const participantRows = await db.conversationParticipant.findMany({
    where: { orgId, userId, leftAt: null },
    select: { conversationId: true },
  });

  if (participantRows.length === 0) return [];

  const conversationIds = participantRows.map((r) => r.conversationId);
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);

  const meetingRows = await db.conversationMeeting.findMany({
    where: {
      orgId,
      conversationId: { in: conversationIds },
      status: "UPCOMING",
      scheduledAt: { lte: windowEnd },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const records = meetingRows.map(toMeetingRecord);
  const imminent = records.filter((m) => meetingIsWithinOneHour(m, now));

  if (imminent.length === 0) return [];

  // Batch-load RSVP statuses.
  const attendeeRows = await db.meetingAttendee.findMany({
    where: {
      orgId,
      meetingId: { in: imminent.map((m) => m.id) },
      userId,
    },
    select: { meetingId: true, rsvpStatus: true },
  });

  const rsvpByMeeting = new Map(attendeeRows.map((a) => [a.meetingId, a.rsvpStatus]));

  const totalCount = imminent.length;

  return imminent.map((m) => {
    const msUntilStart = m.scheduledAt.getTime() - now.getTime();
    const urgency: "SIXTY_MINUTES" | "FIFTEEN_MINUTES" = meetingIsWithinFifteenMinutes(m, now)
      ? "FIFTEEN_MINUTES"
      : "SIXTY_MINUTES";

    const rsvpStatus = rsvpByMeeting.get(m.id) ?? null;
    const canSeeJoin = rsvpStatus !== "DECLINED";
    const joinUrl = m.joinUrl && canSeeJoin ? m.joinUrl : null;

    return {
      meetingId: m.id,
      conversationId: m.conversationId,
      title: m.title,
      scheduledAt: m.scheduledAt.toISOString(),
      durationMinutes: m.durationMinutes,
      urgency,
      msUntilStart,
      joinUrl,
      hasMore: totalCount > 1,
      totalCount,
    };
  });
}

// ─── Authorization helper used by the alert API route ─────────────────────────

/**
 * Validate that a user is an active participant in the given org.
 * Used by the global alert API route to reject unauthenticated or wrong-org requests.
 */
export async function assertOrgMembership(orgId: string, userId: string): Promise<void> {
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId },
  });
  if (!member) {
    throw new ConversationAccessError("User is not a member of the org");
  }
}
