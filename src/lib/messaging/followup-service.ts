import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "./errors";
import { toFollowUpRecord } from "./mappers";
import type { MessagingFollowUpRecord } from "./domain-types";
import { logMessagingAudit } from "./audit";

/**
 * Flag a message for follow-up.
 * Upserts: if a follow-up already exists for this (orgId, userId, messageId),
 * updates the note and resets resolvedAt/resolvedBy to null (re-opens it).
 */
export async function flagMessageForFollowUp(params: {
  orgId: string;
  userId: string;
  messageId: string;
  conversationId: string;
  note?: string;
}): Promise<MessagingFollowUpRecord> {
  const { orgId, userId, messageId, conversationId, note } = params;

  if (note && note.length > 500) {
    throw new InvalidInputError("Note must not exceed 500 characters");
  }

  // 1. Verify the user is an active participant in the conversation
  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId,
      leftAt: null,
    },
  });

  if (!participant) {
    throw new ConversationAccessError("User is not an active participant in this conversation");
  }

  // 2. Verify the message exists in the org and conversation (IDOR check)
  const message = await db.conversationMessage.findFirst({
    where: {
      id: messageId,
      orgId,
      conversationId,
    },
  });

  if (!message) {
    throw new NotFoundError("Message not found in the specified conversation and organization");
  }

  // 3. Upsert follow-up
  const row = await db.messagingFollowUp.upsert({
    where: {
      orgId_userId_messageId: {
        orgId,
        userId,
        messageId,
      },
    },
    create: {
      orgId,
      userId,
      conversationId,
      messageId,
      note: note ?? null,
      resolvedAt: null,
      resolvedBy: null,
    },
    update: {
      note: note ?? null,
      resolvedAt: null,
      resolvedBy: null,
    },
  });

  logMessagingAudit({
    orgId,
    actorId: userId,
    action: "ADMIN_SUPPORT_ACTION",
    summary: `Flagged message for follow-up`,
    conversationId,
    messageId,
    metadata: {
      noteLength: note?.length ?? 0,
    },
  }).catch(() => {});

  return toFollowUpRecord(row);
}

/**
 * Resolve a follow-up.
 * Ownership check: can only resolve their own follow-ups.
 */
export async function resolveFollowUp(params: {
  orgId: string;
  userId: string;
  followUpId: string;
}): Promise<MessagingFollowUpRecord> {
  const { orgId, userId, followUpId } = params;

  const followUp = await db.messagingFollowUp.findFirst({
    where: {
      id: followUpId,
      orgId,
      userId,
    },
  });

  if (!followUp) {
    throw new NotFoundError("Follow-up not found");
  }

  if (followUp.resolvedAt !== null) {
    return toFollowUpRecord(followUp);
  }

  const now = new Date();
  const updated = await db.messagingFollowUp.update({
    where: {
      id: followUpId,
    },
    data: {
      resolvedAt: now,
      resolvedBy: userId,
    },
  });

  logMessagingAudit({
    orgId,
    actorId: userId,
    action: "ADMIN_SUPPORT_ACTION",
    summary: `Resolved message follow-up`,
    conversationId: updated.conversationId,
    messageId: updated.messageId,
  }).catch(() => {});

  return toFollowUpRecord(updated);
}

/**
 * List follow-ups for a user in an organization.
 * Cursor-paginated by createdAt DESC + id.
 */
export async function listFollowUps(params: {
  orgId: string;
  userId: string;
  filter: "pending" | "resolved" | "all";
  limit?: number;
  cursor?: string;
}): Promise<{
  items: MessagingFollowUpRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const { orgId, userId, filter, limit, cursor } = params;

  let finalLimit = limit ?? 50;
  if (finalLimit < 1) finalLimit = 1;
  if (finalLimit > 100) finalLimit = 100;

  const where: Prisma.MessagingFollowUpWhereInput = {
    orgId,
    userId,
  };

  if (filter === "pending") {
    where.resolvedAt = null;
  } else if (filter === "resolved") {
    where.resolvedAt = { not: null };
  }

  const rows = await db.messagingFollowUp.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: finalLimit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  const hasMore = rows.length > finalLimit;
  const sliced = hasMore ? rows.slice(0, finalLimit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

  return {
    items: sliced.map(toFollowUpRecord),
    nextCursor,
    hasMore,
  };
}

/**
 * Hard delete a follow-up.
 * Ownership check: can only delete their own follow-up.
 * Return { deleted: true } if found and deleted, { deleted: false } if not found.
 */
export async function deleteFollowUp(params: {
  orgId: string;
  userId: string;
  followUpId: string;
}): Promise<{ deleted: boolean }> {
  const { orgId, userId, followUpId } = params;

  const existing = await db.messagingFollowUp.findFirst({
    where: {
      id: followUpId,
      orgId,
      userId,
    },
  });

  if (!existing) {
    return { deleted: false };
  }

  await db.messagingFollowUp.delete({
    where: {
      id: followUpId,
    },
  });

  return { deleted: true };
}
