import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ConversationRecord, ConversationPortalState, LinkedRecordType } from "./domain-types";
import {
  conversationOrgSafeWhere,
  participantOrgSafeWhere,
} from "./org-safe-helpers";
import { toConversationRecord, toParticipantRecord } from "./mappers";
import { logMessagingAudit, logMessagingAuditTx } from "./audit";
import {
  assertConversationAction,
  assertGovernanceAction,
} from "./service-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { getRealtimePublisherOrNoop } from "./realtime/publisher";
import { appendConversationEvent } from "./realtime/event-log-service";
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
 * Find an existing one-to-one DM between two users in an org.
 * Returns the conversation record if found, null otherwise.
 */
async function findExistingDM(
  tx: Prisma.TransactionClient,
  orgId: string,
  userA: string,
  userB: string,
): Promise<Prisma.ConversationGetPayload<Record<string, never>> | null> {
  const candidates = await tx.conversation.findMany({
    where: {
      orgId,
      type: "DM",
      participants: {
        some: {
          userId: userA,
          leftAt: null,
        },
      },
    },
  });

  for (const conv of candidates) {
    const activeParticipants = await tx.conversationParticipant.findMany({
      where: {
        conversationId: conv.id,
        orgId,
        leftAt: null,
      },
    });
    if (
      activeParticipants.length === 2 &&
      activeParticipants.some((p) => p.userId === userA) &&
      activeParticipants.some((p) => p.userId === userB)
    ) {
      return conv;
    }
  }

  return null;
}

/**
 * Validate that all provided userIds are active members of the org.
 */
export async function assertValidOrgMembers(
  tx: Prisma.TransactionClient,
  orgId: string,
  userIds: string[],
  context: string,
): Promise<void> {
  if (userIds.length === 0) return;

  const members = await tx.member.findMany({
    where: {
      organizationId: orgId,
      userId: { in: userIds },
    },
    select: { userId: true },
  });

  const validIds = new Set(members.map((m) => m.userId));
  const invalid = userIds.filter((id) => !validIds.has(id));

  if (invalid.length > 0) {
    throw new Error(
      `${context}: invalid or unauthorized participants: ${invalid.join(", ")}`,
    );
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
 * Duplicate DMs for the same pair are prevented server-side.
 */

export async function createConversation(
  input: CreateConversationInput,
): Promise<CreateConversationResult> {
  // Rate limit check for portal conversations
  if (input.type === "PORTAL") {
    const limitResult = await rateLimit(`portal-create:${input.customerId}`, { maxRequests: 5, window: "60 s" });
    if (!limitResult.success) {
      await logMessagingAudit({
        orgId: input.orgId,
        actorId: input.createdBy,
        action: "PORTAL_CONVERSATION_RATE_LIMITED",
        summary: "Portal conversation creation blocked: Rate limit exceeded",
        metadata: { customerId: input.customerId, reason: "rate_limit_exceeded" }
      });
      throw new Error("Rate limit exceeded. Please try again later.");
    }
  }

  const result = await db.$transaction(async (tx) => {
    // Portal validation and scoping
    if (input.type === "PORTAL") {
      if (!input.customerId) {
        throw new Error("Portal conversations require customerId");
      }

      if (input.linkedRecordType) {
        const allowedTypes = ["CUSTOMER", "INVOICE", "QUOTE", "PAYMENT", "STATEMENT", "TICKET", "GENERAL_SUPPORT"];
        if (!allowedTypes.includes(input.linkedRecordType)) {
          throw new Error(`Invalid linkedRecordType: ${input.linkedRecordType}`);
        }
      }

      // Check customer eligibility
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, organizationId: input.orgId },
        include: { organization: { include: { defaults: true } } },
      });

      if (!customer) {
        await logMessagingAuditTx(tx, {
          orgId: input.orgId,
          actorId: input.createdBy,
          action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
          summary: "Portal conversation creation blocked: Customer not found",
          metadata: { customerId: input.customerId, reason: "customer_not_found" }
        });
        throw new Error("Customer not found in this organization");
      }

      if (customer.lifecycleStage === "CHURNED") {
        await logMessagingAuditTx(tx, {
          orgId: input.orgId,
          actorId: input.createdBy,
          action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
          summary: "Portal conversation creation blocked: Customer is churned",
          metadata: { customerId: input.customerId, reason: "customer_churned" }
        });
        throw new Error("Customer is churned and ineligible for portal access");
      }

      if (!customer.organization.defaults?.portalEnabled) {
        await logMessagingAuditTx(tx, {
          orgId: input.orgId,
          actorId: input.createdBy,
          action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
          summary: "Portal conversation creation blocked: Portal access disabled",
          metadata: { customerId: input.customerId, reason: "portal_disabled" }
        });
        throw new Error("Portal access is disabled for this organization");
      }
    }

    // DM validation
    if (input.type === "DM") {
      if (!input.dmPeerId) {
        throw new Error("DM conversations require dmPeerId");
      }
      if (input.visibility !== null && input.visibility !== undefined) {
        throw new Error("DM conversations must not have visibility set");
      }
      if (input.dmPeerId === input.createdBy) {
        throw new Error("DM peer cannot be the creator");
      }

      // Validate peer is an org member
      await assertValidOrgMembers(tx, input.orgId, [input.dmPeerId], "createConversation");

      // Prevent duplicate DMs
      const existing = await findExistingDM(tx, input.orgId, input.createdBy, input.dmPeerId);
      if (existing) {
        const existingParticipants = await tx.conversationParticipant.findMany({
          where: participantOrgSafeWhere(input.orgId, existing.id),
        });
        return {
          conversation: toConversationRecord(existing),
          participants: existingParticipants.map(toParticipantRecord),
        };
      }
    }

    // For channels/groups, validate initial participants are org members
    if (input.type !== "DM" && input.type !== "PORTAL" && input.initialParticipantIds && input.initialParticipantIds.length > 0) {
      await assertValidOrgMembers(tx, input.orgId, input.initialParticipantIds, "createConversation");
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
        portalState: input.type === "PORTAL" ? (input.portalState ?? "OPEN") : null,
        linkedRecordType: input.type === "PORTAL" ? (input.linkedRecordType ?? null) : null,
        linkedRecordId: input.type === "PORTAL" ? (input.linkedRecordId ?? null) : null,
        customerId: input.type === "PORTAL" ? (input.customerId ?? null) : null,
      },
    });

    // Build participant list
    const participantData: Array<{
      orgId: string;
      userId: string | null;
      customerId: string | null;
      kind: "INTERNAL_MEMBER" | "PORTAL_CLIENT";
      role: "OWNER" | "ADMIN" | "MEMBER";
    }> = [];

    if (input.type === "PORTAL") {
      const isCreatedByClient = input.createdBy === input.customerId;
      if (isCreatedByClient) {
        participantData.push({
          orgId: input.orgId,
          userId: null,
          customerId: input.customerId,
          kind: "PORTAL_CLIENT",
          role: "OWNER",
        });
      } else {
        // Created by internal user
        participantData.push({
          orgId: input.orgId,
          userId: input.createdBy,
          customerId: null,
          kind: "INTERNAL_MEMBER",
          role: "OWNER",
        });
        participantData.push({
          orgId: input.orgId,
          userId: null,
          customerId: input.customerId,
          kind: "PORTAL_CLIENT",
          role: "MEMBER",
        });
      }
    } else {
      participantData.push({
        orgId: input.orgId,
        userId: input.createdBy,
        customerId: null,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
      });

      if (input.type === "DM") {
        participantData.push({
          orgId: input.orgId,
          userId: input.dmPeerId as string,
          customerId: null,
          kind: "INTERNAL_MEMBER",
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
            customerId: null,
            kind: "INTERNAL_MEMBER",
            role: "MEMBER",
          });
        }
      }
    }

    await tx.conversationParticipant.createMany({
      data: participantData.map((p) => ({
        orgId: p.orgId,
        conversationId: conversationRow.id,
        userId: p.userId,
        customerId: p.customerId,
        kind: p.kind,
        role: p.role,
      })),
    });

    const participants = await tx.conversationParticipant.findMany({
      where: participantOrgSafeWhere(input.orgId, conversationRow.id),
    });

    const isPortal = input.type === "PORTAL";
    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.createdBy,
      action: isPortal ? "PORTAL_CONVERSATION_CREATED" : "CONVERSATION_CREATED",
      summary: isPortal
        ? `Created portal conversation for customer "${input.customerId}"`
        : `Created ${input.type.toLowerCase()} "${conversationRow.name ?? "(untitled)"}"`,
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
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

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

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.governance.updated",
      actorId: input.archivedBy,
      payload: { change: "archived", conversationId: input.conversationId },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.archivedBy,
    { change: "archived", conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Rename a conversation. Not allowed on DMs.
 */
export async function renameConversation(
  input: RenameConversationInput,
): Promise<ConversationRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

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

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.governance.updated",
      actorId: input.actorId,
      payload: { change: "renamed", name: updated.name, conversationId: input.conversationId },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.actorId,
    { change: "renamed", name: result.name, conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Change conversation visibility. Only allowed for channels and groups.
 */
export async function changeConversationVisibility(
  input: ChangeConversationVisibilityInput,
): Promise<ConversationRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

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

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.governance.updated",
      actorId: input.actorId,
      payload: { change: "visibility_changed", visibility: updated.visibility, conversationId: input.conversationId },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.actorId,
    { change: "visibility_changed", visibility: result.visibility, conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
  );

  return result;
}

/**
 * Unarchive a conversation (restore from soft-delete). Org-scoped.
 */
export async function unarchiveConversation(
  input: UnarchiveConversationInput,
): Promise<ConversationRecord> {
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

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

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.governance.updated",
      actorId: input.unarchivedBy,
      payload: { change: "unarchived", conversationId: input.conversationId },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.unarchivedBy,
    { change: "unarchived", conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
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
  let eventMeta: { eventId: string; cursor: bigint } | undefined;

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

    eventMeta = await appendConversationEvent(tx, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.governance.updated",
      actorId: input.lockedBy,
      payload: { change: "locked", reason: input.reason ?? null, conversationId: input.conversationId },
    });

    return toConversationRecord(updated);
  });

  getRealtimePublisherOrNoop().publishConversationEvent(
    input.orgId,
    input.conversationId,
    "conversation.governance.updated",
    input.lockedBy,
    { change: "locked", reason: input.reason ?? null, conversationId: input.conversationId },
    { eventId: eventMeta!.eventId, cursor: eventMeta!.cursor.toString() },
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

/**
 * Close a portal conversation. Lifecycle state becomes CLOSED.
 * Only internal users may close portal conversations.
 */
export async function closePortalConversation(
  input: {
    orgId: string;
    conversationId: string;
    actorId: string;
    actorOrgRole?: string;
    isPlatformAdmin?: boolean;
  }
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.actorId,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "ARCHIVE",
      "closePortalConversation",
    );

    if (conversation.type !== "PORTAL") {
      throw new Error("closePortalConversation: conversation is not a portal conversation");
    }

    if (conversation.portalState === "CLOSED") {
      throw new Error("closePortalConversation: conversation is already closed");
    }

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        portalState: "CLOSED",
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "PORTAL_CONVERSATION_CLOSED",
      summary: `Closed portal conversation for customer "${conversation.customerId}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  return result;
}

/**
 * Reopen a closed portal conversation. Lifecycle state becomes OPEN.
 * Only internal users may reopen portal conversations.
 */
export async function reopenPortalConversation(
  input: {
    orgId: string;
    conversationId: string;
    actorId: string;
    actorOrgRole?: string;
    isPlatformAdmin?: boolean;
  }
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    const { conversation } = await assertGovernanceOrConversationAction(
      tx,
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        actorId: input.actorId,
        actorOrgRole: input.actorOrgRole,
        isPlatformAdmin: input.isPlatformAdmin,
      },
      "UNARCHIVE",
      "reopenPortalConversation",
    );

    if (conversation.type !== "PORTAL") {
      throw new Error("reopenPortalConversation: conversation is not a portal conversation");
    }

    if (conversation.portalState !== "CLOSED") {
      throw new Error("reopenPortalConversation: conversation is not closed");
    }

    const customer = await tx.customer.findFirst({
      where: { id: conversation.customerId as string, organizationId: input.orgId },
      include: { organization: { include: { defaults: true } } },
    });

    if (!customer || customer.lifecycleStage === "CHURNED" || !customer.organization.defaults?.portalEnabled) {
      await logMessagingAuditTx(tx, {
        orgId: input.orgId,
        actorId: input.actorId,
        action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
        summary: "Portal conversation reopening blocked: Customer ineligible",
        metadata: { customerId: conversation.customerId, reason: "customer_ineligible" }
      });
      throw new Error("Customer is ineligible for portal access");
    }

    const updated = await tx.conversation.update({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        portalState: "OPEN",
      },
    });

    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "PORTAL_CONVERSATION_REOPENED",
      summary: `Reopened portal conversation for customer "${conversation.customerId}"`,
      conversationId: updated.id,
    });

    return toConversationRecord(updated);
  });

  return result;
}

/**
 * Update the owner/assignee of a portal conversation.
 * If assigneeId is null, demotes all owners to MEMBER.
 * If assigneeId is provided, adds them as OWNER and demotes other owners to MEMBER.
 */
export async function updatePortalConversationAssignment(
  input: {
    orgId: string;
    conversationId: string;
    assigneeId: string | null;
    actorId: string;
  }
): Promise<ConversationRecord> {
  const result = await db.$transaction(async (tx) => {
    // Assert conversation access
    const conversation = await tx.conversation.findFirst({
      where: { id: input.conversationId, orgId: input.orgId },
    });
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.type !== "PORTAL") {
      throw new Error("Assignment can only be updated for portal conversations");
    }

    // Find current owners
    const currentOwners = await tx.conversationParticipant.findMany({
      where: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
        leftAt: null,
      },
    });

    if (input.assigneeId) {
      // Check if target assignee is valid org member
      await assertValidOrgMembers(tx, input.orgId, [input.assigneeId], "updatePortalConversationAssignment");

      // Check if target is already a participant
      const existingPart = await tx.conversationParticipant.findFirst({
        where: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          userId: input.assigneeId,
        },
      });

      if (existingPart) {
        await tx.conversationParticipant.update({
          where: { id: existingPart.id },
          data: { role: "OWNER", leftAt: null },
        });
      } else {
        await tx.conversationParticipant.create({
          data: {
            orgId: input.orgId,
            conversationId: input.conversationId,
            userId: input.assigneeId,
            kind: "INTERNAL_MEMBER",
            role: "OWNER",
          },
        });
      }

      // Demote all other owners to MEMBER
      for (const owner of currentOwners) {
        if (owner.userId !== input.assigneeId) {
          await tx.conversationParticipant.update({
            where: { id: owner.id },
            data: { role: "MEMBER" },
          });
        }
      }
    } else {
      // Unassign: Demote all owners to MEMBER
      for (const owner of currentOwners) {
        await tx.conversationParticipant.update({
          where: { id: owner.id },
          data: { role: "MEMBER" },
        });
      }
    }

    // Log audit event
    await logMessagingAuditTx(tx, {
      orgId: input.orgId,
      actorId: input.actorId,
      action: "PORTAL_CONVERSATION_ASSIGNED",
      summary: input.assigneeId
        ? `Assigned portal conversation to user ${input.assigneeId}`
        : "Unassigned portal conversation",
      conversationId: input.conversationId,
    });

    return toConversationRecord(conversation);
  });

  return result;
}

/**
 * Update the portalState of a portal conversation.
 * Handles closed/reopen transitions through their respective functions,
 * and directly updates other state transitions.
 */
export async function updatePortalConversationState(
  input: {
    orgId: string;
    conversationId: string;
    portalState: ConversationPortalState;
    actorId: string;
  }
): Promise<ConversationRecord> {
  if (input.portalState === "CLOSED") {
    return closePortalConversation({
      orgId: input.orgId,
      conversationId: input.conversationId,
      actorId: input.actorId,
    });
  }

  // If reopening from CLOSED, call reopenPortalConversation
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId, orgId: input.orgId },
  });
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (conversation.type !== "PORTAL") {
    throw new Error("State updates can only be performed on portal conversations");
  }

  if (conversation.portalState === "CLOSED" && input.portalState !== "CLOSED") {
    return reopenPortalConversation({
      orgId: input.orgId,
      conversationId: input.conversationId,
      actorId: input.actorId,
    });
  }

  // Otherwise direct state update (e.g. OPEN <-> WAITING_ON_INTERNAL <-> WAITING_ON_CLIENT)
  const updated = await db.conversation.update({
    where: { id: input.conversationId, orgId: input.orgId },
    data: {
      portalState: input.portalState,
    },
  });

  await logMessagingAuditTx(db, {
    orgId: input.orgId,
    actorId: input.actorId,
    action: "PORTAL_CONVERSATION_REOPENED",
    summary: `Updated portal conversation state to ${input.portalState}`,
    conversationId: updated.id,
  });

  return toConversationRecord(updated);
}
