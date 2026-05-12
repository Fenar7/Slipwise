import "server-only";

/**
 * Org-safe query helpers for messaging.
 *
 * These helpers encode the Prisma query patterns that enforce org isolation.
 * They are used by service implementations (future sprints) to ensure no
 * cross-org lookup or mutation paths exist.
 *
 * Rules:
 * - Every query must include orgId in the where clause.
 * - Composite FK relations (Conversation, ConversationMessage, ConversationThread)
 *   use [id, orgId] for child lookups.
 * - Single-id lookups for models without composite FK still require orgId.
 */

// ─── Conversation helpers ─────────────────────────────────────────────────────

export function conversationOrgSafeWhere(orgId: string, conversationId: string) {
  return { id: conversationId, orgId };
}

export function conversationListOrgSafeWhere(orgId: string) {
  return { orgId };
}

// ─── Participant helpers ──────────────────────────────────────────────────────

export function participantOrgSafeWhere(
  orgId: string,
  conversationId: string,
  userId?: string,
) {
  const where: { orgId: string; conversationId: string; userId?: string } = {
    orgId,
    conversationId,
  };
  if (userId !== undefined) {
    where.userId = userId;
  }
  return where;
}

// ─── Message helpers ──────────────────────────────────────────────────────────

export function messageOrgSafeWhere(orgId: string, messageId: string) {
  return { id: messageId, orgId };
}

export function messageListOrgSafeWhere(orgId: string, conversationId: string) {
  return { orgId, conversationId };
}

// ─── Thread helpers ───────────────────────────────────────────────────────────

export function threadOrgSafeWhere(orgId: string, threadId: string) {
  return { id: threadId, orgId };
}

// ─── Reaction / Mention helpers ───────────────────────────────────────────────

export function reactionOrgSafeWhere(orgId: string, messageId: string) {
  return { orgId, messageId };
}

export function mentionOrgSafeWhere(orgId: string, mentionedUserId?: string) {
  const where: { orgId: string; mentionedUserId?: string } = { orgId };
  if (mentionedUserId !== undefined) {
    where.mentionedUserId = mentionedUserId;
  }
  return where;
}

// ─── Read state helpers ───────────────────────────────────────────────────────

export function readStateOrgSafeWhere(
  orgId: string,
  conversationId: string,
  userId: string,
) {
  return { orgId, conversationId, userId };
}

// ─── Presence / Typing helpers ────────────────────────────────────────────────

export function presenceOrgSafeWhere(orgId: string, userId: string) {
  return { orgId, userId };
}

export function typingOrgSafeWhere(orgId: string, conversationId: string, userId?: string) {
  const where: { orgId: string; conversationId: string; userId?: string } = {
    orgId,
    conversationId,
  };
  if (userId !== undefined) {
    where.userId = userId;
  }
  return where;
}

// ─── Task / Meeting helpers ───────────────────────────────────────────────────

export function taskOrgSafeWhere(orgId: string, taskId: string) {
  return { id: taskId, orgId };
}

export function meetingOrgSafeWhere(orgId: string, meetingId: string) {
  return { id: meetingId, orgId };
}

// ─── Calendar connection helpers ──────────────────────────────────────────────

export function calendarConnectionOrgSafeWhere(orgId: string, connectionId: string) {
  return { id: connectionId, orgId };
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

export function auditEventOrgSafeWhere(orgId: string, conversationId?: string) {
  const where: { orgId: string; conversationId?: string } = { orgId };
  if (conversationId !== undefined) {
    where.conversationId = conversationId;
  }
  return where;
}

// ─── Retention policy helpers ─────────────────────────────────────────────────

export function retentionPolicyOrgSafeWhere(orgId: string, policyId: string) {
  return { id: policyId, orgId };
}
