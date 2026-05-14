import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MessagingAuditAction } from "./domain-types";

// ─── Audit action labels ──────────────────────────────────────────────────────

/**
 * Human-readable labels for messaging audit actions.
 */
export const MESSAGING_AUDIT_ACTION_LABELS: Record<MessagingAuditAction, string> = {
  CONVERSATION_CREATED: "Created conversation",
  CONVERSATION_ARCHIVED: "Archived conversation",
  CONVERSATION_UNARCHIVED: "Unarchived conversation",
  CONVERSATION_LOCKED: "Locked conversation",
  CONVERSATION_UNLOCKED: "Unlocked conversation",
  CONVERSATION_DELETED: "Deleted conversation",
  CONVERSATION_RENAMED: "Renamed conversation",
  CONVERSATION_VISIBILITY_CHANGED: "Changed conversation visibility",
  PARTICIPANT_ADDED: "Added participant",
  PARTICIPANT_REMOVED: "Removed participant",
  PARTICIPANT_ROLE_CHANGED: "Changed participant role",
  MESSAGE_SENT: "Sent message",
  MESSAGE_EDITED: "Edited message",
  MESSAGE_DELETED: "Deleted message",
  THREAD_CREATED: "Created thread",
  THREAD_REPLIED: "Replied to thread",
  THREAD_RESOLVED: "Resolved thread",
  REACTION_ADDED: "Added reaction",
  REACTION_REMOVED: "Removed reaction",
  MENTION_CREATED: "Created mention",
  READ_STATE_UPDATED: "Updated read state",
  TASK_CREATED: "Created task",
  TASK_UPDATED: "Updated task",
  TASK_ASSIGNED: "Assigned task",
  TASK_COMPLETED: "Completed task",
  MEETING_SCHEDULED: "Scheduled meeting",
  MEETING_UPDATED: "Updated meeting",
  MEETING_CANCELLED: "Cancelled meeting",
  ATTACHMENT_UPLOADED: "Uploaded attachment",
  ATTACHMENT_DELETED: "Deleted attachment",
  RETENTION_POLICY_CREATED: "Created retention policy",
  RETENTION_POLICY_UPDATED: "Updated retention policy",
  ADMIN_SUPPORT_ACTION: "Performed admin support action",
};

// ─── Safe metadata rules ──────────────────────────────────────────────────────

/**
 * Hardening (Sprint 3.4): normalize audit metadata so governance actions emit
 * consistent, safe shapes.
 *
 * Rules:
 * - No raw message body, attachment payloads, or content blobs.
 * - No secrets, tokens, or provider-internal details.
 * - Include actorRole and overrideUsed for governance-sensitive actions.
 * - Include limited reason/category where appropriate.
 * - Strip null/undefined keys to keep rows compact.
 */
export function normalizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata == null) return null;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    // Block unsafe keys by name heuristic
    if (
      key === "body" ||
      key === "content" ||
      key === "token" ||
      key === "secret" ||
      key === "password" ||
      key === "attachmentPayload" ||
      key === "providerInternal"
    ) {
      continue;
    }
    // Only allow primitive-ish safe values (string, number, boolean, Date)
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Date
    ) {
      safe[key] = value;
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

// ─── Audit event params ───────────────────────────────────────────────────────

interface MessagingAuditParams {
  orgId: string;
  actorId: string;
  action: MessagingAuditAction;
  summary: string;
  conversationId?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  taskId?: string | null;
  meetingId?: string | null;
  /**
   * Must not contain raw tokens, secrets, provider-internal details,
   * message bodies, attachment payloads, or unsafe content blobs.
   * Use normalizeAuditMetadata when constructing from user input.
   */
  metadata?: Record<string, unknown> | null;
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

/**
 * Log a messaging audit event. Fire-and-forget: never blocks the caller action.
 * Use for non-critical governance events where audit failure is acceptable.
 */
export async function logMessagingAudit(params: MessagingAuditParams): Promise<void> {
  try {
    await writeMessagingAuditEvent(db, params);
  } catch (error) {
    console.error("[MESSAGING_AUDIT] Failed to log:", error);
  }
}

/**
 * Log a messaging audit event inside a Prisma transaction.
 * The audit row commits atomically with the mutation.
 * Use for governance-critical events (create conversation, delete message, policy changes).
 */
export async function logMessagingAuditTx(
  tx: Prisma.TransactionClient,
  params: MessagingAuditParams,
): Promise<void> {
  await writeMessagingAuditEvent(tx, params);
}

async function writeMessagingAuditEvent(
  client: Prisma.TransactionClient | typeof db,
  params: MessagingAuditParams,
): Promise<void> {
  const safeMetadata = normalizeAuditMetadata(params.metadata);
  await client.messagingAuditEvent.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      summary: params.summary,
      conversationId: params.conversationId ?? null,
      messageId: params.messageId ?? null,
      threadId: params.threadId ?? null,
      taskId: params.taskId ?? null,
      meetingId: params.meetingId ?? null,
      metadata:
        safeMetadata != null
          ? (safeMetadata as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
  });
}

/**
 * Returns the human-readable label for a messaging audit action.
 */
export function getMessagingAuditActionLabel(action: MessagingAuditAction): string {
  return MESSAGING_AUDIT_ACTION_LABELS[action] ?? action;
}
