import "server-only";

import { db } from "@/lib/db";
import type { MeetingAttendeeRecord } from "./domain-types";
import { toMeetingAttendeeRecord } from "./mappers";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";
import { requireConversationAccess } from "./authorization";
import { toConversationRecord, toParticipantRecord } from "./mappers";
import { participantOrgSafeWhere } from "./org-safe-helpers";
import { logMessagingAuditTx } from "./audit";
import type { MeetingRsvpStatus } from "./domain-types";

// ─── RSVP mutation ──────────────────────────────────────────────────────────────

export interface UpdateRsvpInput {
  orgId: string;
  meetingId: string;
  userId: string;
  rsvpStatus: MeetingRsvpStatus;
}

/**
 * Update a user's RSVP status for a meeting.
 *
 * Rules enforced:
 * - User must be an active participant in the conversation that owns the meeting.
 * - Conversation must not be archived or locked (mutations blocked on frozen conversations).
 * - The meeting must exist in the org, must not be CANCELLED.
 * - RSVP is idempotent: setting the same status twice is safe (no duplicate audit events).
 * - PENDING is not a valid caller-supplied status — callers set ACCEPTED/TENTATIVE/DECLINED.
 */
export async function updateRsvp(input: UpdateRsvpInput): Promise<MeetingAttendeeRecord> {
  const { orgId, meetingId, userId, rsvpStatus } = input;

  if (rsvpStatus === "PENDING") {
    throw new InvalidInputError("RSVP status PENDING cannot be set explicitly; use ACCEPTED, TENTATIVE, or DECLINED");
  }

  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  if (meeting.status === "CANCELLED") {
    throw new InvalidInputError("Cannot RSVP to a cancelled meeting");
  }

  // Verify active conversation membership (org-scoped).
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, meeting.conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("updateRsvp: active participant access required");
  }

  const conversation = await db.conversation.findFirst({
    where: { id: meeting.conversationId, orgId },
  });

  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  // Archived and locked conversations block RSVP mutations.
  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "updateRsvp",
  );

  const now = new Date();

  // Load existing attendee record to detect no-op.
  const existing = await db.meetingAttendee.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });

  if (existing && existing.rsvpStatus === rsvpStatus) {
    // Idempotent: status unchanged, return current record without side effects.
    return toMeetingAttendeeRecord(existing);
  }

  const attendee = await db.$transaction(async (tx) => {
    const upserted = await tx.meetingAttendee.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: {
        orgId,
        meetingId,
        userId,
        rsvpStatus,
        respondedAt: now,
      },
      update: {
        rsvpStatus,
        respondedAt: now,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "MEETING_ATTENDEE_RSVP",
      summary: `RSVP ${rsvpStatus.toLowerCase()} for meeting: ${meeting.title}`,
      conversationId: meeting.conversationId,
      meetingId,
      metadata: { rsvpStatus },
    });

    return upserted;
  });

  return toMeetingAttendeeRecord(attendee);
}

// ─── Attendee seeding ──────────────────────────────────────────────────────────

/**
 * Seed attendee records for all active participants in the meeting's conversation.
 * Called after a meeting is scheduled to populate the RSVP table with PENDING status.
 * Idempotent: participants already present are skipped.
 */
export async function seedMeetingAttendees(
  orgId: string,
  meetingId: string,
): Promise<void> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) return;

  const participants = await db.conversationParticipant.findMany({
    where: {
      orgId,
      conversationId: meeting.conversationId,
      leftAt: null,
    },
    select: { userId: true },
  });

  if (participants.length === 0) return;

  // Batch createMany with skipDuplicates for idempotency.
  await db.meetingAttendee.createMany({
    data: participants.map((p) => ({
      orgId,
      meetingId,
      userId: p.userId,
      rsvpStatus: "PENDING" as const,
    })),
    skipDuplicates: true,
  });
}

// ─── Read: attendee list for organizer view ────────────────────────────────────

/**
 * Return all attendee RSVP records for a meeting.
 * Access-gated: caller must be an active participant in the meeting's conversation.
 * Returns only the safe domain record — providerStatus is internal and not forwarded to read shapes.
 */
export async function listMeetingAttendees(
  orgId: string,
  meetingId: string,
  userId: string,
): Promise<MeetingAttendeeRecord[]> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, meeting.conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("listMeetingAttendees: active participant access required");
  }

  const rows = await db.meetingAttendee.findMany({
    where: { meetingId, orgId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(toMeetingAttendeeRecord);
}

// ─── Provider attendee reconciliation ─────────────────────────────────────────

/**
 * Fold provider-side attendee status back into the local attendee record.
 * Called during inbound reconciliation from Sprint 8.3 provider sync.
 *
 * Rules:
 * - Only updates providerAttendeeId and providerStatus (internal fields).
 * - Does NOT overwrite a user's explicit local rsvpStatus with provider status
 *   unless the provider reports DECLINED (which is authoritative).
 * - Safe to call multiple times (idempotent per attendee).
 */
export async function reconcileAttendeeFromProvider(
  orgId: string,
  meetingId: string,
  providerAttendeeId: string,
  providerStatus: string,
  userId: string,
): Promise<void> {
  const existing = await db.meetingAttendee.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });

  if (!existing) return;

  // Provider DECLINED is authoritative — fold it back if user hasn't explicitly responded yet.
  const shouldFoldDeclined =
    providerStatus.toUpperCase() === "DECLINED" &&
    existing.rsvpStatus === "PENDING";

  await db.meetingAttendee.update({
    where: { meetingId_userId: { meetingId, userId } },
    data: {
      providerAttendeeId,
      providerStatus,
      ...(shouldFoldDeclined
        ? { rsvpStatus: "DECLINED", respondedAt: new Date() }
        : {}),
    },
  });
}
