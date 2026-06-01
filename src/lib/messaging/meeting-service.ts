import "server-only";

import { db } from "@/lib/db";
import type { ConversationMeetingRecord } from "./domain-types";
import { participantOrgSafeWhere } from "./org-safe-helpers";
import { toMeetingRecord, toConversationRecord, toParticipantRecord } from "./mappers";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";
import { requireConversationAccess } from "./authorization";
import { logMessagingAuditTx } from "./audit";
import type {
  ScheduleMeetingInput,
  UpdateMeetingInput,
  CancelMeetingInput,
} from "./service-contracts";
import { syncMeetingToProvider, reconcileProviderChangesForMeeting } from "./provider-sync-service";

/**
 * Validates a scheduled meeting date.
 */
function validateScheduledAt(scheduledAt: Date | null | undefined): void {
  if (scheduledAt === undefined || scheduledAt === null) {
    throw new InvalidInputError("Meeting scheduled time is required");
  }
  if (isNaN(scheduledAt.getTime())) {
    throw new InvalidInputError("Meeting scheduled time must be a valid date");
  }
}

/**
 * Schedule a meeting inside a conversation.
 */
export async function scheduleMeeting(input: ScheduleMeetingInput): Promise<ConversationMeetingRecord> {
  const { orgId, conversationId, title, description, scheduledAt, durationMinutes = 30, scheduledBy } = input;

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, scheduledBy),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("scheduleMeeting: active participant access required");
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, orgId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "scheduleMeeting",
  );

  if (!title || title.trim() === "") {
    throw new InvalidInputError("Meeting title is required");
  }

  const dateScheduled = new Date(scheduledAt);
  validateScheduledAt(dateScheduled);

  if (durationMinutes <= 0) {
    throw new InvalidInputError("Meeting duration must be positive");
  }

  const meeting = await db.$transaction(async (tx) => {
    const created = await tx.conversationMeeting.create({
      data: {
        orgId,
        conversationId,
        title: title.trim(),
        description: description ?? null,
        scheduledAt: dateScheduled,
        durationMinutes,
        status: "UPCOMING",
        scheduledBy,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: scheduledBy,
      action: "MEETING_SCHEDULED",
      summary: `Meeting scheduled: ${created.title}`,
      conversationId: created.conversationId,
      meetingId: created.id,
      metadata: null,
    });

    return created;
  });

  let finalMeeting = toMeetingRecord(meeting);
  if (db.calendarConnection) {
    const activeConns = await db.calendarConnection.count({
      where: { orgId, status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] } },
    }).catch(() => 0);

    if (activeConns > 0) {
      try {
        const synced = await syncMeetingToProvider(orgId, meeting.id);
        finalMeeting = synced;
      } catch (err) {
        console.error("[meeting-service] scheduleMeeting: provider sync failed:", err);
      }
    }
  }

  return finalMeeting;
}

/**
 * Update meeting details.
 */
export async function updateMeeting(input: UpdateMeetingInput): Promise<ConversationMeetingRecord> {
  const { orgId, conversationId, meetingId, title, description, scheduledAt, durationMinutes, updatedBy } = input;

  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  if (meeting.conversationId !== conversationId) {
    throw new NotFoundError("Meeting not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, updatedBy),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("updateMeeting: active participant access required");
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, orgId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "updateMeeting",
  );

  // Enforce mutation authority: must be organizer or conversation admin/owner
  const isOrganizer = meeting.scheduledBy === updatedBy;
  const isElevated = membership.role === "ADMIN" || membership.role === "OWNER";
  if (!isOrganizer && !isElevated) {
    throw new ConversationAccessError("updateMeeting: organizer or conversation admin/owner role required");
  }

  if (title !== undefined && title.trim() === "") {
    throw new InvalidInputError("Meeting title cannot be empty");
  }

  if (scheduledAt !== undefined && isNaN(new Date(scheduledAt).getTime())) {
    throw new InvalidInputError("Meeting scheduled time must be a valid date");
  }

  if (durationMinutes !== undefined && durationMinutes <= 0) {
    throw new InvalidInputError("Meeting duration must be positive");
  }

  const updatedData: any = {};
  if (title !== undefined) updatedData.title = title.trim();
  if (description !== undefined) updatedData.description = description;
  if (scheduledAt !== undefined) updatedData.scheduledAt = new Date(scheduledAt);
  if (durationMinutes !== undefined) updatedData.durationMinutes = durationMinutes;

  const updatedMeeting = await db.$transaction(async (tx) => {
    const updated = await tx.conversationMeeting.update({
      where: { id: meetingId },
      data: updatedData,
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: updatedBy,
      action: "MEETING_UPDATED",
      summary: `Meeting updated: ${updated.title}`,
      conversationId: updated.conversationId,
      meetingId: updated.id,
      metadata: { updatedFields: Object.keys(updatedData) },
    });

    return updated;
  });

  let finalMeeting = toMeetingRecord(updatedMeeting);
  if (db.calendarConnection) {
    const activeConns = await db.calendarConnection.count({
      where: { orgId, status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] } },
    }).catch(() => 0);

    if (activeConns > 0) {
      try {
        const synced = await syncMeetingToProvider(orgId, meetingId);
        finalMeeting = synced;
      } catch (err) {
        console.error("[meeting-service] updateMeeting: provider sync failed:", err);
      }
    }
  }

  return finalMeeting;
}

/**
 * Cancel a meeting.
 */
export async function cancelMeeting(input: CancelMeetingInput): Promise<ConversationMeetingRecord> {
  const { orgId, conversationId, meetingId, cancelledBy, cancelReason } = input;

  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  if (meeting.conversationId !== conversationId) {
    throw new NotFoundError("Meeting not found");
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, cancelledBy),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("cancelMeeting: active participant access required");
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, orgId },
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(membership),
    "SEND_MESSAGE",
    "cancelMeeting",
  );

  // Enforce mutation authority: must be organizer or conversation admin/owner
  const isOrganizer = meeting.scheduledBy === cancelledBy;
  const isElevated = membership.role === "ADMIN" || membership.role === "OWNER";
  if (!isOrganizer && !isElevated) {
    throw new ConversationAccessError("cancelMeeting: organizer or conversation admin/owner role required");
  }

  if (meeting.status === "CANCELLED") {
    throw new InvalidInputError("Meeting is already cancelled");
  }

  const cancelled = await db.$transaction(async (tx) => {
    const updated = await tx.conversationMeeting.update({
      where: { id: meetingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: cancelReason ?? null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: cancelledBy,
      action: "MEETING_CANCELLED",
      summary: `Meeting cancelled: ${updated.title}`,
      conversationId: updated.conversationId,
      meetingId: updated.id,
      metadata: { cancelReason: cancelReason ?? null },
    });

    return updated;
  });

  let finalMeeting = toMeetingRecord(cancelled);
  if (db.calendarConnection) {
    const activeConns = await db.calendarConnection.count({
      where: { orgId, status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] } },
    }).catch(() => 0);

    if (activeConns > 0) {
      try {
        const synced = await syncMeetingToProvider(orgId, meetingId);
        finalMeeting = synced;
      } catch (err) {
        console.error("[meeting-service] cancelMeeting: provider sync failed:", err);
      }
    }
  }

  return finalMeeting;
}

/**
 * List meetings for a conversation.
 */
export async function listMeetingsForConversation(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationMeetingRecord[]> {
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new ConversationAccessError("listMeetingsForConversation: active participant access required");
  }

  const rows = await db.conversationMeeting.findMany({
    where: { orgId, conversationId },
    orderBy: { scheduledAt: "asc" },
  });

  const reconciledRows = await Promise.all(
    rows.map(async (row) => {
      if (row.providerEventId && row.status !== "CANCELLED") {
        try {
          return await reconcileProviderChangesForMeeting(orgId, row.id, userId);
        } catch (err) {
          console.error(`Failed to reconcile meeting ${row.id} during list:`, err);
        }
      }
      return toMeetingRecord(row);
    })
  );

  return reconciledRows;
}
