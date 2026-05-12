import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MessageMentionRecord, ConversationReadStateRecord } from "./domain-types";
import {
  mentionOrgSafeWhere,
  readStateOrgSafeWhere,
} from "./org-safe-helpers";
import { toMentionRecord, toReadStateRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import type {
  AcknowledgeMentionInput,
  UpdateReadStateInput,
  MarkConversationReadInput,
} from "./service-contracts";
import { assertActiveParticipant } from "./service-helpers";

// ─── Mentions ───────────────────────────────────────────────────────────────────

/**
 * Acknowledge a mention.
 */
export async function acknowledgeMention(
  input: AcknowledgeMentionInput,
): Promise<MessageMentionRecord> {
  const result = await db.$transaction(async (tx) => {
    const mention = await tx.messageMention.findFirst({
      where: {
        id: input.mentionId,
        orgId: input.orgId,
        mentionedUserId: input.userId,
      },
    });

    if (!mention) {
      throw new Error("acknowledgeMention: mention not found or access denied");
    }

    const updated = await tx.messageMention.update({
      where: { id: mention.id },
      data: {
        acknowledged: true,
        acknowledgedAt: new Date(),
      },
    });

    return toMentionRecord(updated);
  });

  return result;
}

/**
 * List unacknowledged mentions for a user.
 */
export async function listUnacknowledgedMentions(
  orgId: string,
  userId: string,
): Promise<MessageMentionRecord[]> {
  const rows = await db.messageMention.findMany({
    where: {
      ...mentionOrgSafeWhere(orgId, userId),
      acknowledged: false,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toMentionRecord);
}

// ─── Read State ─────────────────────────────────────────────────────────────────

/**
 * Update the read state for a participant in a conversation.
 */
export async function updateReadState(
  input: UpdateReadStateInput,
): Promise<ConversationReadStateRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "updateReadState",
    );

    const message = await tx.conversationMessage.findFirst({
      where: {
        id: input.lastReadMessageId,
        orgId: input.orgId,
        conversationId: input.conversationId,
      },
    });

    if (!message) {
      throw new Error("updateReadState: message does not belong to conversation");
    }

    const readState = await tx.conversationReadState.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      create: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.userId,
        lastReadMessageId: input.lastReadMessageId,
        lastReadAt: input.lastReadAt,
        unreadCount: 0,
      },
      update: {
        lastReadMessageId: input.lastReadMessageId,
        lastReadAt: input.lastReadAt,
        unreadCount: 0,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.userId,
      action: "READ_STATE_UPDATED",
      summary: `Updated read state`,
      conversationId: input.conversationId,
    });

    return toReadStateRecord(readState);
  });

  return result;
}

/**
 * Mark a conversation as read for a user.
 * Finds the latest message in the conversation and updates read state.
 */
export async function markConversationRead(
  input: MarkConversationReadInput,
): Promise<ConversationReadStateRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "markConversationRead",
    );

    const latestMessage = await tx.conversationMessage.findFirst({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        status: { not: "DELETED" },
      },
      orderBy: { createdAt: "desc" },
    });

    const readState = await tx.conversationReadState.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      create: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        userId: input.userId,
        lastReadMessageId: latestMessage?.id ?? null,
        lastReadAt: input.readAt,
        unreadCount: 0,
      },
      update: {
        lastReadMessageId: latestMessage?.id ?? null,
        lastReadAt: input.readAt,
        unreadCount: 0,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.userId,
      action: "READ_STATE_UPDATED",
      summary: `Marked conversation as read`,
      conversationId: input.conversationId,
    });

    return toReadStateRecord(readState);
  });

  return result;
}

/**
 * Get the read state for a specific user+conversation.
 */
export async function getReadState(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationReadStateRecord | null> {
  const row = await db.conversationReadState.findFirst({
    where: readStateOrgSafeWhere(orgId, conversationId, userId),
  });
  return row ? toReadStateRecord(row) : null;
}
