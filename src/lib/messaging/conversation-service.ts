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
  assertConversationAccessible,
  assertNotDMConversation,
  assertGovernanceParticipant,
} from "./service-helpers";
import type {
  CreateConversationInput,
  CreateConversationResult,
  ArchiveConversationInput,
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

  return result;
}

/**
 * Archive a conversation (soft-delete). Org-scoped.
 */
export async function archiveConversation(
  input: ArchiveConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: conversationOrgSafeWhere(input.orgId, input.conversationId),
    });
    assertConversationExists(existing, "archiveConversation");
    assertConversationAccessible(toConversationRecord(existing), "archiveConversation");
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.archivedBy,
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

  return result;
}

/**
 * Rename a conversation. Not allowed on DMs.
 */
export async function renameConversation(
  input: RenameConversationInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: conversationOrgSafeWhere(input.orgId, input.conversationId),
    });
    assertConversationExists(existing, "renameConversation");
    assertConversationAccessible(toConversationRecord(existing), "renameConversation");
    assertNotDMConversation(toConversationRecord(existing), "renameConversation");
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.actorId,
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

  return result;
}

/**
 * Change conversation visibility. Only allowed for channels and groups.
 */
export async function changeConversationVisibility(
  input: ChangeConversationVisibilityInput,
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: conversationOrgSafeWhere(input.orgId, input.conversationId),
    });
    assertConversationExists(existing, "changeConversationVisibility");
    assertConversationAccessible(toConversationRecord(existing), "changeConversationVisibility");
    assertNotDMConversation(
      toConversationRecord(existing),
      "changeConversationVisibility",
    );
    await assertGovernanceParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.actorId,
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

  return result;
}
