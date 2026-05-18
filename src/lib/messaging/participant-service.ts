import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ConversationParticipantRecord } from "./domain-types";
import {
  participantOrgSafeWhere,
} from "./org-safe-helpers";
import { toParticipantRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import {
  assertConversationAction,
  assertGovernanceAction,
} from "./service-helpers";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";
import { appendConversationEvent } from "./realtime/event-log-service";
import type {
  AddParticipantInput,
  RemoveParticipantInput,
  UpdateParticipantRoleInput,
} from "./service-contracts";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function countActiveOwners(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
): Promise<number> {
  return tx.conversationParticipant.count({
    where: {
      orgId,
      conversationId,
      role: "OWNER",
      leftAt: null,
    },
  });
}

// ─── Queries ────────────────────────────────────────────────────────────────────

/**
 * List active participants for a conversation.
 * Requires active participant status.
 */
export async function listParticipantsForConversation(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationParticipantRecord[]> {
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });
  if (!membership) {
    throw new Error("listParticipantsForConversation: active participant access required");
  }

  const rows = await db.conversationParticipant.findMany({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId),
      leftAt: null,
    },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map(toParticipantRecord);
}

/**
 * Get a specific participant by userId.
 */
export async function getParticipantByUserId(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationParticipantRecord | null> {
  const row = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
    },
  });
  return row ? toParticipantRecord(row) : null;
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a participant to a conversation.
 * If the user previously left, reactivates the membership record.
 * If the user is already active, returns the existing record.
 */
export async function addParticipant(
  input: AddParticipantInput,
): Promise<ConversationParticipantRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.addedBy,
      "ADD_PARTICIPANT",
      "addParticipant",
    );

    const existing = await tx.conversationParticipant.findFirst({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.userId,
      },
    });

    let participant: Prisma.ConversationParticipantGetPayload<Record<string, never>>;

    if (existing) {
      if (existing.leftAt !== null) {
        // Reactivate previously-removed participant.
        participant = await tx.conversationParticipant.update({
          where: { id: existing.id },
          data: {
            leftAt: null,
            role: input.role,
            joinedAt: new Date(),
          },
        });
      } else {
        // Already active: do NOT silently change role.
        // Role changes must go through updateParticipantRole for invariant enforcement.
        if (existing.role !== input.role) {
          throw new Error(
            "addParticipant: participant already active with different role; use updateParticipantRole instead",
          );
        }
        participant = existing;
      }
    } else {
      participant = await tx.conversationParticipant.create({
        data: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          userId: input.userId,
          role: input.role,
        },
      });
    }

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.addedBy,
      action: "PARTICIPANT_ADDED",
      summary: `Added participant ${input.userId} as ${input.role}`,
      conversationId: input.conversationId,
    });

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.membership.updated",
      actorId: input.addedBy,
      payload: { change: "added", userId: input.userId, role: input.role, conversationId: input.conversationId },
    });

    return toParticipantRecord(participant);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.membership.updated",
    input.addedBy,
    { change: "added", userId: input.userId, role: input.role, conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Remove a participant by setting leftAt.
 */
export async function removeParticipant(
  input: RemoveParticipantInput,
): Promise<ConversationParticipantRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

  const result = await db.$transaction(async (tx) => {
    if (input.actorOrgRole || input.isPlatformAdmin) {
      await assertGovernanceAction(
        tx,
        input.orgId,
        input.conversationId,
        input.removedBy,
        "REMOVE_PARTICIPANT",
        {
          participant: null,
          orgRole: input.actorOrgRole ?? "member",
          isPlatformAdmin: input.isPlatformAdmin ?? false,
        },
        "removeParticipant",
      );
    } else {
      await assertConversationAction(
        tx,
        input.orgId,
        input.conversationId,
        input.removedBy,
        "REMOVE_PARTICIPANT",
        "removeParticipant",
      );
    }

    const existing = await tx.conversationParticipant.findFirst({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.userId,
      },
    });

    if (!existing) {
      throw new Error("removeParticipant: participant not found");
    }
    if (existing.leftAt !== null) {
      throw new Error("removeParticipant: participant already inactive");
    }

    // Sole-owner invariant: a conversation must never be left without an OWNER.
    if (existing.role === "OWNER") {
      const ownerCount = await countActiveOwners(tx, input.orgId, input.conversationId);
      if (ownerCount <= 1) {
        throw new Error("removeParticipant: cannot remove the sole owner");
      }
    }

    const updated = await tx.conversationParticipant.update({
      where: { id: existing.id },
      data: { leftAt: new Date() },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.removedBy,
      action: "PARTICIPANT_REMOVED",
      summary: `Removed participant ${input.userId}`,
      conversationId: input.conversationId,
    });

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.membership.updated",
      actorId: input.removedBy,
      payload: { change: "removed", userId: input.userId, conversationId: input.conversationId },
    });

    return toParticipantRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.membership.updated",
    input.removedBy,
    { change: "removed", userId: input.userId, conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  // Revoke live delivery for the removed participant immediately.
  getRealtimePublisherOrNoop().pruneConversationSubscriptions(
    input.orgId,
    input.conversationId,
    input.userId,
  );

  return result;
}

/**
 * Update a participant's role.
 */
export async function updateParticipantRole(
  input: UpdateParticipantRoleInput,
): Promise<ConversationParticipantRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.updatedBy,
      "CHANGE_PARTICIPANT_ROLE",
      "updateParticipantRole",
    );

    const existing = await tx.conversationParticipant.findFirst({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.userId,
      },
    });

    if (!existing) {
      throw new Error("updateParticipantRole: participant not found");
    }
    if (existing.leftAt !== null) {
      throw new Error("updateParticipantRole: participant is inactive");
    }

    // Sole-owner invariant: cannot demote the only remaining OWNER.
    if (existing.role === "OWNER" && input.role !== "OWNER") {
      const ownerCount = await countActiveOwners(tx, input.orgId, input.conversationId);
      if (ownerCount <= 1) {
        throw new Error("updateParticipantRole: cannot demote the sole owner");
      }
    }

    const updated = await tx.conversationParticipant.update({
      where: { id: existing.id },
      data: { role: input.role },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.updatedBy,
      action: "PARTICIPANT_ROLE_CHANGED",
      summary: `Changed role of ${input.userId} to ${input.role}`,
      conversationId: input.conversationId,
    });

    return toParticipantRecord(updated);
  });

  return result;
}
