import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { toMailboxThreadReadShape } from "./read-shapes";
import type { MailboxThreadReadShape } from "./read-shapes";
import type { MailboxThreadStatus, MailboxAuditAction } from "./domain-types";
import { logMailboxAuditTx } from "./audit";

// ─── Valid thread actions ─────────────────────────────────────────────────────

export type ThreadAction =
  | "mark_read"
  | "mark_unread"
  | "archive"
  | "unarchive"
  | "flag"
  | "unflag";

const VALID_THREAD_ACTIONS: ThreadAction[] = [
  "mark_read",
  "mark_unread",
  "archive",
  "unarchive",
  "flag",
  "unflag",
];

export function isValidThreadAction(value: unknown): value is ThreadAction {
  return typeof value === "string" && (VALID_THREAD_ACTIONS as string[]).includes(value);
}

// ─── Action result shape ──────────────────────────────────────────────────────

export interface ThreadActionResult {
  success: boolean;
  thread: MailboxThreadReadShape | null;
  action: ThreadAction;
}

// ─── Internal action mapping ──────────────────────────────────────────────────

interface ActionPlan {
  auditAction: MailboxAuditAction;
  auditSummary: (subject: string) => string;
  updateData: (
    currentStatus: MailboxThreadStatus,
    currentUnreadCount: number,
    currentIsFlagged: boolean,
    preArchiveStatus: MailboxThreadStatus | null,
  ) => Prisma.MailboxThreadUpdateInput;
}

const ACTION_PLANS: Record<ThreadAction, ActionPlan> = {
  mark_read: {
    auditAction: "THREAD_READ",
    auditSummary: (subject) => `Marked thread "${subject}" as read`,
    updateData: (_status, _unreadCount, _isFlagged, _preArchiveStatus) => ({
      unreadCount: 0,
    }),
  },
  mark_unread: {
    auditAction: "THREAD_UNREAD",
    auditSummary: (subject) => `Marked thread "${subject}" as unread`,
    updateData: (_status, _unreadCount, _isFlagged, _preArchiveStatus) => ({
      // Product model uses thread-level unreadCount, not per-message state.
      // Setting to 1 indicates the thread has unread messages.
      unreadCount: 1,
    }),
  },
  archive: {
    auditAction: "THREAD_STATUS_CHANGED",
    auditSummary: (subject) => `Archived thread "${subject}"`,
    updateData: (currentStatus, _unreadCount, _isFlagged, _preArchiveStatus) => ({
      status: "ARCHIVED" as MailboxThreadStatus,
      // Only capture pre-archive status if we're not already archived.
      // Guards against double-archive overwriting the original value.
      ...(currentStatus !== "ARCHIVED" ? { preArchiveStatus: currentStatus } : {}),
    }),
  },
  unarchive: {
    auditAction: "THREAD_STATUS_CHANGED",
    auditSummary: (subject) => `Unarchived thread "${subject}"`,
    updateData: (_currentStatus, _unreadCount, _isFlagged, preArchiveStatus) => ({
      status: (preArchiveStatus ?? "OPEN") as MailboxThreadStatus,
      preArchiveStatus: null,
    }),
  },
  flag: {
    auditAction: "THREAD_FLAGGED",
    auditSummary: (subject) => `Flagged thread "${subject}"`,
    updateData: (_status, _unreadCount, _isFlagged, _preArchiveStatus) => ({
      isFlagged: true,
    }),
  },
  unflag: {
    auditAction: "THREAD_UNFLAGGED",
    auditSummary: (subject) => `Unflagged thread "${subject}"`,
    updateData: (_status, _unreadCount, _isFlagged, _preArchiveStatus) => ({
      isFlagged: false,
    }),
  },
};

// ─── Permission helper ──────────────────────────────────────────────────────────

export async function assertCanMutateThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<{ thread: Prisma.MailboxThreadGetPayload<{}>; connectionId: string }> {
  // Resolve accessible connections for this member
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleConnectionIds = accessible.map((c) => c.id);

  if (accessibleConnectionIds.length === 0) {
    throw new ThreadActionError("Thread not found", 404);
  }

  // Load the thread, org-scoped and connection-scoped
  const thread = await db.mailboxThread.findFirst({
    where: {
      id: threadId,
      orgId,
      mailboxConnectionId: { in: accessibleConnectionIds },
    },
  });

  if (!thread) {
    // Hidden-safe 404: do not leak cross-org existence
    throw new ThreadActionError("Thread not found", 404);
  }

  // Verify write access on this specific connection
  const connection = accessible.find((c) => c.id === thread.mailboxConnectionId);
  if (!connection) {
    throw new ThreadActionError("Thread not found", 404);
  }

  // The visibility service already resolved access level.
  // For members with org_shared policy, access is read_only.
  // Admins/owners get full. Restricted/admin_only get none (already filtered above).
  const isReadOnly = role === "member" && connection.visibilityPolicy === "org_shared";
  if (isReadOnly) {
    throw new ThreadActionError("You do not have permission to modify this thread", 403);
  }

  return { thread, connectionId: thread.mailboxConnectionId };
}

// ─── Core mutation ────────────────────────────────────────────────────────────

class ThreadActionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ThreadActionError";
  }
}

/**
 * Perform a core thread action with org-scoping, permission checks,
 * atomic mutation, and transactional audit logging.
 */
export async function performThreadAction(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
  action: ThreadAction,
): Promise<ThreadActionResult> {
  const plan = ACTION_PLANS[action];

  const { thread } = await assertCanMutateThread(orgId, userId, role, threadId);

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updateData = plan.updateData(
      thread.status,
      thread.unreadCount,
      thread.isFlagged,
      (thread as unknown as { preArchiveStatus: MailboxThreadStatus | null }).preArchiveStatus ?? null,
    );

    const after = await tx.mailboxThread.update({
      where: { id: threadId, orgId },
      data: updateData,
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: plan.auditAction,
      summary: plan.auditSummary(thread.subject),
      mailboxConnectionId: thread.mailboxConnectionId,
      threadId: thread.id,
      metadata: {
        action,
        previousStatus: thread.status,
        previousUnreadCount: thread.unreadCount,
        previousIsFlagged: thread.isFlagged,
      },
    });

    return after;
  });

  return {
    success: true,
    thread: toMailboxThreadReadShape(updated as unknown as import("./domain-types").MailboxThreadRecord),
    action,
  };
}

// ─── Convenience exports ──────────────────────────────────────────────────────

export async function markThreadRead(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "mark_read");
}

export async function markThreadUnread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "mark_unread");
}

export async function archiveThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "archive");
}

export async function unarchiveThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "unarchive");
}

export async function flagThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "flag");
}

export async function unflagThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<ThreadActionResult> {
  return performThreadAction(orgId, userId, role, threadId, "unflag");
}

export { ThreadActionError };
