import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ConversationParticipantRecord } from "./domain-types";
import {
  conversationOrgSafeWhere,
  participantOrgSafeWhere,
} from "./org-safe-helpers";
import { toParticipantRecord, toConversationRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import {
  assertConversationAccessible,
  assertNotDMConversation,
  assertGovernanceParticipant,
} from "./service-helpers";
import type {
  AddParticipantInput,
  RemoveParticipantInput,
  UpdateParticipantRoleInput,
} from "./service-contracts";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function assertConversationInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
): Promise<Prisma.ConversationGetPayload<Record<string, never>>> {
  const existing = await tx.conversation.findFirst({
    where: conversationOrgSafeWhere(orgId, conversationId),
  });
  if (!existing) {
    throw new Error("Participant action: conversation not found or access denied");
  }
  return existing;
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
  const result = await db.$transaction(async (tx) => {
    const conversation = await assertConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
    );
    assertConversationAccessible(toConversationRecord(conversation), "addParticipant");
    assertNotDMConversation(toConversationRecord(conversation), "addParticipant");
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.addedBy,
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
        participant = await tx.conversationParticipant.update({
          where: { id: existing.id },
          data: {
            leftAt: null,
            role: input.role,
            joinedAt: new Date(),
          },
        });
      } else {
        // Already active: just update role if different
        if (existing.role !== input.role) {
          participant = await tx.conversationParticipant.update({
            where: { id: existing.id },
            data: { role: input.role },
          });
        } else {
          participant = existing;
        }
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

    return toParticipantRecord(participant);
  });

  return result;
}

/**
 * Remove a participant by setting leftAt.
 */
export async function removeParticipant(
  input: RemoveParticipantInput,
): Promise<ConversationParticipantRecord> {
  const result = await db.$transaction(async (tx) => {
    const conversation = await assertConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
    );
    assertConversationAccessible(
      toConversationRecord(conversation),
      "removeParticipant",
    );
    assertNotDMConversation(toConversationRecord(conversation), "removeParticipant");
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.removedBy,
      "removeParticipant",
    );

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

    return toParticipantRecord(updated);
  });

  return result;
}

/**
 * Update a participant's role.
 */
export async function updateParticipantRole(
  input: UpdateParticipantRoleInput,
): Promise<ConversationParticipantRecord> {
  const result = await db.$transaction(async (tx) => {
    const conversation = await assertConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
    );
    assertConversationAccessible(
      toConversationRecord(conversation),
      "updateParticipantRole",
    );
    assertNotDMConversation(
      toConversationRecord(conversation),
      "updateParticipantRole",
    );
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.updatedBy,
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
