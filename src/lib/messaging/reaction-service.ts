import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MessageReactionRecord } from "./domain-types";
import { reactionOrgSafeWhere, messageOrgSafeWhere } from "./org-safe-helpers";
import { toReactionRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import type { AddReactionInput, RemoveReactionInput } from "./service-contracts";
import {
  assertActiveParticipant,
  assertConversationAccessible,
  getConversationInOrg,
} from "./service-helpers";
import { toConversationRecord } from "./mappers";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function assertMessageInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  messageId: string,
): Promise<Prisma.ConversationMessageGetPayload<Record<string, never>>> {
  const existing = await tx.conversationMessage.findFirst({
    where: messageOrgSafeWhere(orgId, messageId),
  });
  if (!existing) {
    throw new Error("Reaction action: message not found or access denied");
  }
  return existing;
}

// ─── Queries ────────────────────────────────────────────────────────────────────

/**
 * List reactions for a message.
 */
export async function listReactionsForMessage(
  orgId: string,
  messageId: string,
): Promise<MessageReactionRecord[]> {
  const rows = await db.messageReaction.findMany({
    where: reactionOrgSafeWhere(orgId, messageId),
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toReactionRecord);
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a reaction to a message idempotently.
 * If the user already reacted with the same value, returns the existing record.
 */
export async function addReaction(
  input: AddReactionInput,
): Promise<MessageReactionRecord> {
  const result = await db.$transaction(async (tx) => {
    const message = await assertMessageInOrg(tx, input.orgId, input.messageId);
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      message.conversationId,
      "addReaction",
    );
    assertConversationAccessible(toConversationRecord(conversation), "addReaction");
    await assertActiveParticipant(
      tx,
      input.orgId,
      message.conversationId,
      input.userId,
      "addReaction",
    );

    const existing = await tx.messageReaction.findFirst({
      where: {
        orgId: input.orgId,
        messageId: input.messageId,
        userId: input.userId,
        value: input.value,
      },
    });

    if (existing) {
      return toReactionRecord(existing);
    }

    const reaction = await tx.messageReaction.create({
      data: {
        orgId: input.orgId,
        messageId: input.messageId,
        userId: input.userId,
        type: "EMOJI",
        value: input.value,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.userId,
      action: "REACTION_ADDED",
      summary: `Added reaction ${input.value}`,
      messageId: input.messageId,
    });

    return toReactionRecord(reaction);
  });

  return result;
}

/**
 * Remove a reaction from a message.
 * Safe to call when the reaction does not exist; returns null in that case.
 */
export async function removeReaction(
  input: RemoveReactionInput,
): Promise<MessageReactionRecord | null> {
  const result = await db.$transaction(async (tx) => {
    const message = await assertMessageInOrg(tx, input.orgId, input.messageId);
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      message.conversationId,
      "removeReaction",
    );
    assertConversationAccessible(toConversationRecord(conversation), "removeReaction");
    await assertActiveParticipant(
      tx,
      input.orgId,
      message.conversationId,
      input.userId,
      "removeReaction",
    );

    const existing = await tx.messageReaction.findFirst({
      where: {
        orgId: input.orgId,
        messageId: input.messageId,
        userId: input.userId,
        value: input.value,
      },
    });

    if (!existing) {
      return null;
    }

    await tx.messageReaction.delete({
      where: { id: existing.id },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.userId,
      action: "REACTION_REMOVED",
      summary: `Removed reaction ${input.value}`,
      messageId: input.messageId,
    });

    return toReactionRecord(existing);
  });

  return result;
}
