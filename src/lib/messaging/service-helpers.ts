import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ConversationRecord } from "./domain-types";
import { conversationIsAccessible, conversationIsDM } from "./domain-types";
import { toParticipantRecord, toConversationRecord } from "./mappers";
import {
  roleCanGovern,
  requireConversationAccess,
  type ConversationAction,
} from "./authorization";

export async function getConversationInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  context = "conversation",
): Promise<Prisma.ConversationGetPayload<Record<string, never>>> {
  const conversation = await tx.conversation.findFirst({
    where: { id: conversationId, orgId },
  });

  if (!conversation) {
    throw new Error(`${context}: conversation not found or access denied`);
  }

  return conversation;
}

export async function assertActiveParticipant(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  context: string,
): Promise<Prisma.ConversationParticipantGetPayload<Record<string, never>>> {
  const participant = await tx.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId,
      leftAt: null,
    },
  });

  if (!participant) {
    throw new Error(`${context}: active participant access required`);
  }

  return participant;
}

export function assertConversationAccessible(
  conversation: ConversationRecord,
  context: string,
): void {
  if (!conversationIsAccessible(conversation)) {
    throw new Error(`${context}: conversation is archived or locked`);
  }
}

export function assertNotDMConversation(
  conversation: ConversationRecord,
  context: string,
): void {
  if (conversationIsDM(conversation)) {
    throw new Error(`${context}: not allowed on DM conversations`);
  }
}

/**
 * Fetch the conversation and active participant, map them to domain records,
 * and delegate the access decision to the centralized authorization policy.
 *
 * This is the primary bridge from Prisma rows → domain records → policy layer.
 * Use this instead of scattering getConversationInOrg + assertConversationAccessible
 * + assertActiveParticipant across services.
 */
export async function assertConversationAction(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  action: ConversationAction,
  context: string,
): Promise<{
  conversation: Prisma.ConversationGetPayload<Record<string, never>>;
  participant: Prisma.ConversationParticipantGetPayload<Record<string, never>>;
}> {
  const conversation = await getConversationInOrg(tx, orgId, conversationId, context);
  const participant = await assertActiveParticipant(tx, orgId, conversationId, userId, context);

  requireConversationAccess(
    toConversationRecord(conversation),
    toParticipantRecord(participant),
    action,
    context,
  );

  return { conversation, participant };
}

/**
 * Assert that the active participant may perform a governance action.
 * Delegates to assertConversationAction with the given governance action,
 * so the policy layer remains the single source of truth.
 */
export async function assertGovernanceParticipant(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  context: string,
): Promise<Prisma.ConversationParticipantGetPayload<Record<string, never>>> {
  const { participant } = await assertConversationAction(
    tx,
    orgId,
    conversationId,
    userId,
    "ARCHIVE", // any governance action works for role-only assertion
    context,
  );

  if (!roleCanGovern(participant.role)) {
    throw new Error(`${context}: governance action requires OWNER or ADMIN role`);
  }

  return participant;
}
