import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ConversationRecord } from "./domain-types";
import {
  conversationOrgSafeWhere,
  participantOrgSafeWhere,
} from "./org-safe-helpers";
import { toConversationRecord, toParticipantRecord } from "./mappers";
import { logMessagingAuditTx } from "./audit";
import {
  assertConversationAction,
  assertGovernanceAction,
} from "./service-helpers";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";
import type {
  CreateConversationInput,
  CreateConversationResult,
  ArchiveConversationInput,
  UnarchiveConversationInput,
  LockConversationInput,
  UnlockConversationInput,
  RenameConversationInput,
  ChangeConversationVisibilityInput,
} from "./service-contracts";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function assertConversationExists(
  row: { id: string } | null,
  context: string,
): asserts row is { id: string } {
  if (!row) {
    throw new Error(`${context}: conversation not found or access denied`);
  }
}

/**
 * Choose the correct assertion helper based on whether admin override
 * context is provided.  If actorOrgRole or isPlatformAdmin are present,
 * use the governance-aware path; otherwise fall back to the standard
 * conversation-role-only path.
 */
async function assertGovernanceOrConversationAction(
  tx: Prisma.TransactionClient,
  input: {
    orgId: string;
    conversationId: string;
    actorId: string;
    actorOrgRole?: string;
    isPlatformAdmin?: boolean;
  },
  action: "ARCHIVE" | "UNARCHIVE" | "LOCK" | "UNLOCK",
  context: string,
): Promise<{
  conversation: Prisma.ConversationGetPayload<Record<string, never>>;
  participant: Prisma.ConversationParticipantGetPayload<Record<string, never>> | null;
}> {
  if (input.actorOrgRole || input.isPlatformAdmin) {
    return assertGovernanceAction(
      tx,
      input.orgId,
      input.conversationId,
      input.actorId,
      action,
      {
        participant: null, // filled inside assertGovernanceAction
        orgRole: input.actorOrgRole ?? "member",
        isPlatformAdmin: input.isPlatformAdmin ?? false,
      },
      context,
    );
  }

  return assertConversationAction(
    tx,
    input.orgId,
    input.conversationId,
    input.actorId,
    action,
    context,
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch a single conversation by id, org-scoped.
 */
export async function getConversationById(
  orgId: string,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const row = await db.conversation.findFirst({
    where: conversationOrgSafeWhere(orgId, conversationId),
  });
  return row ? toConversationRecord(row) : null;
}

/**
 * List conversations for a user within an org.
 * Returns only conversations where the user is an active participant.
 */
export async function listConversationsForUser(
  orgId: string,
  userId: string,
): Promise<ConversationRecord[]> {
  const rows = await db.conversation.findMany({
    where: {
      orgId,
      participants: {
        some: {
          userId,
          leftAt: null,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toConversationRecord);
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a new conversation and add the creator as OWNER.
 * For DMs, enforces exactly two participants (creator + dmPeerId) and null visibility.
 */
export async function createConversation(
  input: CreateConversationInput,
): Promise<CreateConversationResult> {
  const result = await db.$transaction(async (tx) => {
    // DM validation
    if (input.type === "DM") {
      if (!input.dmPeerId) {
        throw new Error("DM conversations require dmPeerId");
      }
      if (input.visibility !== null && input.visibility !== undefined) {
        throw new Error("DM conversations must not have visibility set");
      }
    }

    // Create conversation
    const conversationRow = await tx.conversation.create({
      data: {
        orgId: input.orgId,
        type: input.type,
        name: input.type === "DM" ? null : input.name,
        description: input.description,
        visibility: input.type === "DM" ? null : input.visibility,
        dmPeerId: input.type === "DM" ? (input.dmPeerId ?? null) : null,
        createdBy: input.createdBy,
      },
    });

    // Build participant list: creator is always OWNER
    const participantData: Array<{
      orgId: string;
      userId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
    }> = [
      {
        orgId: input.orgId,
        userId: input.createdBy,
        role: "OWNER",
      },
    ];

    if (input.type === "DM") {
      if (input.dmPeerId === input.createdBy) {
        throw new Error("DM peer cannot be the creator");
      }
      participantData.push({
        orgId: input.orgId,
        userId: input.dmPeerId as string,
        role: "MEMBER",
      });
    } else if (input.initialParticipantIds && input.initialParticipantIds.length > 0) {
      const seenUserIds = new Set<string>([input.createdBy]);
      for (const userId of input.initialParticipantIds) {
        if (userId === input.createdBy) continue;
        if (seenUserIds.has(userId)) continue;
        seenUserIds.add(userId);
        participantData.push({
          orgId: input.orgId,
          userId,
          role: "MEMBER",
        });
      }
    }

    await tx.conversationParticipant.createMany({
      data: participantData.map((p) => ({
        ...p,
        conversationId: conversationRow.id,
      })),
    });

    const participants = await tx.conversationParticipant.findMany({
      where: participantOrgSafeWhere(input.orgId, conversationRow.id),
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.createdBy,
      action: "CONVERSATION_CREATED",
      summary: `Created ${input.type.toLowerCase()} "${conversationRow.name ?? "(untitled)"}"`,
      conversationId: conversationRow.id,
    });

    return {
      conversation: toConversationRecord(conversationRow),
      participants: participants.map(toParticipantRecord),
    };
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.unlockedBy,
    { change: "unlocked", conversationId: input.conversationId },
  );

  return result;
}

/**
 * Archive a conversation (soft-delete). Org-scoped.
 */
export async function archiveConversation(
  input: ArchiveConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation: existing } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.archivedBy,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "ARCHIVE",
      "archiveConversation",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        archivedAt: new Date(),
        archivedBy: input.archivedBy,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.archivedBy,
      action: "CONVERSATION_ARCHIVED",
      summary: `Archived conversation "${updated.name ?? "(untitled)"}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.archivedBy,
    { change: "archived", conversationId: input.conversationId },
  );

  return result;
}

/**
 * Rename a conversation. Not allowed on DMs.
 */
export async function renameConversation(
  input: RenameConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.actorId,
      "RENAME",
      "renameConversation",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: { name: input.name },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "CONVERSATION_RENAMED",
      summary: `Renamed conversation to "${updated.name ?? "(untitled)"}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.actorId,
    { change: "renamed", name: result.name, conversationId: input.conversationId },
  );

  return result;
}

/**
 * Change conversation visibility. Only allowed for channels and groups.
 */
export async function changeConversationVisibility(
  input: ChangeConversationVisibilityInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertConversationAction(
      tx,
      input.orgId,
      input.conversationId,
      input.actorId,
      "CHANGE_VISIBILITY",
      "changeConversationVisibility",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: { visibility: input.visibility },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "CONVERSATION_VISIBILITY_CHANGED",
      summary: `Changed visibility to ${input.visibility}`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.actorId,
    { change: "visibility_changed", visibility: result.visibility, conversationId: input.conversationId },
  );

  return result;
}

/**
 * Unarchive a conversation (restore from soft-delete). Org-scoped.
 */
export async function unarchiveConversation(
  input: UnarchiveConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation: existing } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.unarchivedBy,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "UNARCHIVE",
      "unarchiveConversation",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        archivedAt: null,
        archivedBy: null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.unarchivedBy,
      action: "CONVERSATION_UNARCHIVED",
      summary: `Unarchived conversation "${updated.name ?? "(untitled)"}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.unarchivedBy,
    { change: "unarchived", conversationId: input.conversationId },
  );

  return result;
}

/**
 * Lock a conversation. Blocks ordinary member mutations.
 * Org-scoped. Requires governance role.
 */
export async function lockConversation(
  input: LockConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation: existing } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.lockedBy,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "LOCK",
      "lockConversation",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        lockedAt: new Date(),
        lockedBy: input.lockedBy,
        lockReason: input.reason ?? null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.lockedBy,
      action: "CONVERSATION_LOCKED",
      summary: `Locked conversation "${updated.name ?? "(untitled)"}"`,
      conversationId: updated.id,
      metadata: {
        reason: input.reason ?? null,
      },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.lockedBy,
    { change: "locked", reason: input.reason ?? null, conversationId: input.conversationId },
  );

  return result;
}

/**
 * Unlock a conversation. Restores ordinary member mutations.
 * Org-scoped. Requires governance role.
 */
export async function unlockConversation(
  input: UnlockConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation: existing } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.unlockedBy,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "UNLOCK",
      "unlockConversation",
    );

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.unlockedBy,
      action: "CONVERSATION_UNLOCKED",
      summary: `Unlocked conversation "${updated.name ?? "(untitled)"}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  return result;
}
