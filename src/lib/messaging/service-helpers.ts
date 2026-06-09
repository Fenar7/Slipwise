import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ConversationRecord } from "./domain-types";
import { conversationIsAccessible, conversationIsDM } from "./domain-types";
import { toParticipantRecord, toConversationRecord } from "./mappers";
import {
  roleCanGovern,
  requireConversationAccess,
  requireGovernanceAccess,
  type ConversationAction,
  type GovernanceActor,
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

export async function requireActiveOrgMember(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  context: string,
): Promise<void> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) return;

  const member = await tx.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId,
      },
    },
    select: { role: true },
  });

  if (!member || member.role === "deactivated") {
    throw new Error(`${context}: active membership required`);
  }
}

export async function assertActiveParticipant(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  context: string,
): Promise<Prisma.ConversationParticipantGetPayload<Record<string, never>>> {
  await requireActiveOrgMember(tx, orgId, userId, context);

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  const participant = await tx.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId: isUuid ? userId : undefined,
      customerId: !isUuid ? userId : undefined,
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

/**
 * Fetch the conversation and active participant, then evaluate governance
 * access including org admin / platform admin override.
 *
 * Use this for operational routes that may allow admin intervention.
 */
export async function assertGovernanceAction(
  tx: Prisma.TransactionClient,
  orgId: string,
  conversationId: string,
  userId: string,
  action: ConversationAction,
  actor: GovernanceActor,
  context: string,
): Promise<{
  conversation: Prisma.ConversationGetPayload<Record<string, never>>;
  participant: Prisma.ConversationParticipantGetPayload<Record<string, never>> | null;
}> {
  const conversation = await getConversationInOrg(tx, orgId, conversationId, context);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  const participant = await tx.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId,
      userId: isUuid ? userId : undefined,
      customerId: !isUuid ? userId : undefined,
      leftAt: null,
    },
  });

  requireGovernanceAccess(
    toConversationRecord(conversation),
    {
      participant: participant ? toParticipantRecord(participant) : null,
      orgRole: actor.orgRole,
      isPlatformAdmin: actor.isPlatformAdmin,
    },
    action,
    context,
  );

  return { conversation, participant };
}
// ─── Attachment upload token helpers (Sprint 5.5 hardening) ────────────────────

import crypto from "node:crypto";

const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function getUploadTokenSecret(): string {
  return process.env.UPLOAD_TOKEN_SECRET ?? process.env.MESSAGING_SIGNING_KEY ?? "upload-token-dev-secret";
}

export interface UploadTokenPayload {
  orgId: string;
  userId: string;
  storageRef: string;
  exp: number; // unix ms
}

export function mintUploadToken(orgId: string, userId: string, storageRef: string): string {
  const payload: UploadTokenPayload = {
    orgId,
    userId,
    storageRef,
    exp: Date.now() + UPLOAD_TOKEN_TTL_MS,
  };
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", getUploadTokenSecret()).update(data).digest("hex");
  const token = Buffer.from(JSON.stringify({ data, hmac })).toString("base64url");
  return token;
}

export function verifyUploadToken(
  orgId: string,
  userId: string,
  storageRef: string,
  token: string,
): boolean {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const { data, hmac } = JSON.parse(raw) as { data: string; hmac: string };

    const expectedHmac = crypto.createHmac("sha256", getUploadTokenSecret()).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return false;
    }

    const payload = JSON.parse(data) as UploadTokenPayload;
    if (payload.orgId !== orgId) return false;
    if (payload.userId !== userId) return false;
    if (payload.storageRef !== storageRef) return false;
    if (payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}
