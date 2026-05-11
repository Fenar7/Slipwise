import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MailboxAuditAction } from "./domain-types";

// ─── Audit action labels ──────────────────────────────────────────────────────

/**
 * Human-readable labels for mailbox audit actions.
 * Follows the same pattern as AUDIT_ACTION_LABELS in src/lib/audit.ts.
 */
export const MAILBOX_AUDIT_ACTION_LABELS: Record<MailboxAuditAction, string> = {
  CONNECTION_CREATED: "Connected mailbox",
  CONNECTION_DISCONNECTED: "Disconnected mailbox",
  CONNECTION_RECONNECTED: "Reconnected mailbox",
  CONNECTION_DEGRADED: "Mailbox connection degraded",
  CONNECTION_PERMISSION_CHANGED: "Changed mailbox permissions",
  CONNECTION_POLICY_UPDATED: "Updated mailbox visibility policy",
  THREAD_ASSIGNED: "Assigned thread",
  THREAD_UNASSIGNED: "Unassigned thread",
  THREAD_STATUS_CHANGED: "Changed thread status",
  THREAD_LINKED: "Linked thread to record",
  THREAD_UNLINKED: "Unlinked thread from record",
  MESSAGE_SENT: "Sent message",
  MESSAGE_REPLIED: "Replied to thread",
  MESSAGE_FORWARDED: "Forwarded message",
  DRAFT_CREATED: "Created draft",
  DRAFT_DISCARDED: "Discarded draft",
  SYNC_MANUAL_TRIGGERED: "Triggered manual sync",
  ADMIN_SUPPORT_ACTION: "Performed admin support action",
};

// ─── Audit event params ───────────────────────────────────────────────────────

interface MailboxAuditParams {
  orgId: string;
  actorId: string;
  action: MailboxAuditAction;
  summary: string;
  mailboxConnectionId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  /** Must not contain raw tokens, secrets, or provider-internal details. */
  metadata?: Record<string, unknown> | null;
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

/**
 * Log a mailbox audit event. Fire-and-forget: never blocks the caller action.
 * Use for non-critical governance events where audit failure is acceptable.
 */
export async function logMailboxAudit(params: MailboxAuditParams): Promise<void> {
  try {
    await writeMailboxAuditEvent(db, params);
  } catch (error) {
    console.error("[MAILBOX_AUDIT] Failed to log:", error);
  }
}

/**
 * Log a mailbox audit event inside a Prisma transaction.
 * The audit row commits atomically with the mutation.
 * Use for governance-critical events (connect, disconnect, permission changes).
 */
export async function logMailboxAuditTx(
  tx: Prisma.TransactionClient,
  params: MailboxAuditParams,
): Promise<void> {
  await writeMailboxAuditEvent(tx, params);
}

async function writeMailboxAuditEvent(
  client: Prisma.TransactionClient | typeof db,
  params: MailboxAuditParams,
): Promise<void> {
  await client.mailboxAuditEvent.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      summary: params.summary,
      mailboxConnectionId: params.mailboxConnectionId ?? null,
      threadId: params.threadId ?? null,
      messageId: params.messageId ?? null,
      metadata:
        params.metadata != null
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
  });
}

/**
 * Returns the human-readable label for a mailbox audit action.
 */
export function getMailboxAuditActionLabel(action: MailboxAuditAction): string {
  return MAILBOX_AUDIT_ACTION_LABELS[action] ?? action;
}
