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
  /** Must not contain raw tokens, secrets, or provider-internal details. */
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
        params.metadata != null
          ? (params.metadata as Prisma.InputJsonValue)
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
