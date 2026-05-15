import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PresenceSessionRecord, TypingSessionRecord } from "./domain-types";
import {
  presenceOrgSafeWhere,
  typingOrgSafeWhere,
  conversationOrgSafeWhere,
} from "./org-safe-helpers";
import { toConversationRecord, toPresenceRecord, toTypingRecord } from "./mappers";
import type {
  UpdatePresenceInput,
  StartTypingInput,
  StopTypingInput,
} from "./service-contracts";
import {
  assertActiveParticipant,
  assertConversationAccessible,
  getConversationInOrg,
} from "./service-helpers";

// ─── Presence ───────────────────────────────────────────────────────────────────

/**
 * Upsert a presence session for a user in an org.
 */
export async function upsertPresence(
  input: UpdatePresenceInput,
): Promise<PresenceSessionRecord> {
  if (input.activeConversationId) {
    const conversation = await db.conversation.findFirst({
      where: conversationOrgSafeWhere(input.orgId, input.activeConversationId),
    });

    if (!conversation) {
      throw new Error("upsertPresence: active conversation not found or access denied");
    }

    assertConversationAccessible(
      toConversationRecord(conversation),
      "upsertPresence",
    );

    const activeParticipant = await db.conversationParticipant.findFirst({
      where: {
        orgId: input.orgId,
        conversationId: input.activeConversationId,
        userId: input.userId,
        leftAt: null,
      },
    });

    if (!activeParticipant) {
      throw new Error("upsertPresence: active participant access required");
    }
  }

  const row = await db.presenceSession.upsert({
    where: {
      orgId_userId: {
        orgId: input.orgId,
        userId: input.userId,
      },
    },
    create: {
      orgId: input.orgId,
      userId: input.userId,
      status: input.status,
      lastActivityAt: new Date(),
      expiresAt: input.expiresAt ?? null,
      activeConversationId: input.activeConversationId ?? null,
    },
    update: {
      status: input.status,
      lastActivityAt: new Date(),
      expiresAt: input.expiresAt ?? null,
      activeConversationId: input.activeConversationId ?? null,
    },
  });

  return toPresenceRecord(row);
}

/**
 * Get presence for a user.
 */
export async function getPresenceByUserId(
  orgId: string,
  userId: string,
): Promise<PresenceSessionRecord | null> {
  const row = await db.presenceSession.findFirst({
    where: presenceOrgSafeWhere(orgId, userId),
  });
  return row ? toPresenceRecord(row) : null;
}

// ─── Typing ─────────────────────────────────────────────────────────────────────

/**
 * Start or refresh a typing session for a user in a conversation.
 */
export async function startTyping(
  input: StartTypingInput,
): Promise<TypingSessionRecord> {
  const row = await db.$transaction(async (tx) => {
    const conversation = await getConversationInOrg(
      tx,
      input.orgId,
      input.conversationId,
      "startTyping",
    );
    assertConversationAccessible(toConversationRecord(conversation), "startTyping");
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "startTyping",
    );

    const typing = await tx.typingSession.upsert({
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
        status: "TYPING",
        expiresAt: input.expiresAt,
      },
      update: {
        status: "TYPING",
        expiresAt: input.expiresAt,
      },
    });

    return typing;
  });

  return toTypingRecord(row);
}

/**
 * Stop typing by deleting the typing session.
 */
export async function stopTyping(
  input: StopTypingInput,
): Promise<TypingSessionRecord | null> {
  const row = await db.$transaction(async (tx) => {
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "stopTyping",
    );

    const typing = await tx.typingSession.findFirst({
      where: typingOrgSafeWhere(input.orgId, input.conversationId, input.userId),
    });

    if (!typing) {
      return null;
    }

    await tx.typingSession.delete({
      where: { id: typing.id },
    });

    return typing;
  });

  return row ? toTypingRecord(row) : null;
}

/**
 * System-driven typing teardown. Deletes typing sessions without requiring
 * active participant access. Used by gateway disconnect/expiry cleanup.
 */
export async function clearTypingForUser(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  const typing = await db.typingSession.findFirst({
    where: typingOrgSafeWhere(orgId, conversationId, userId),
  });

  if (typing) {
    await db.typingSession.delete({
      where: { id: typing.id },
    });
  }
}

/**
 * List active typing sessions for a conversation.
 * Callers should filter out expired rows client-side or via a scheduled job.
 */
export async function listTypingForConversation(
  orgId: string,
  conversationId: string,
): Promise<TypingSessionRecord[]> {
  const rows = await db.typingSession.findMany({
    where: {
      ...typingOrgSafeWhere(orgId, conversationId),
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toTypingRecord);
}
