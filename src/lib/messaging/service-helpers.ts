import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ConversationRecord } from "./domain-types";
import { conversationIsAccessible, conversationIsDM } from "./domain-types";
import { roleCanGovern } from "./authorization";

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
 * Assert that the active participant has a governance role (OWNER or ADMIN).
 * Throws if the participant is not found or lacks governance privileges.
 */
export async function assertGovernanceParticipant(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  context: string,
): Promise<Prisma.ConversationParticipantGetPayload<Record<string, never>>> {
  const participant = await assertActiveParticipant(
    tx,
    orgId,
    conversationId,
    userId,
    context,
  );

  if (!roleCanGovern(participant.role)) {
    throw new Error(`${context}: governance action requires OWNER or ADMIN role`);
  }

  return participant;
}
