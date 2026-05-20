import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { assertCanMutateThread } from "./thread-action-service";
import { toMailboxThreadReadShape } from "./read-shapes";
import type { MailboxThreadReadShape } from "./read-shapes";
import type { MailboxThreadStatus } from "./domain-types";
import { logMailboxAuditTx } from "./audit";

export class AssignmentServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "AssignmentServiceError";
  }
}

export interface AssignmentResult {
  success: boolean;
  thread: MailboxThreadReadShape | null;
}

function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Assign a thread to a specific org member.
 * Validates org membership of the target assignee and preserves assignment history.
 */
export async function assignThread(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
  assigneeId: string;
}): Promise<AssignmentResult> {
  const { orgId, userId, role, threadId, assigneeId } = params;

  if (!assigneeId || typeof assigneeId !== "string" || !isValidUuid(assigneeId)) {
    throw new AssignmentServiceError("Invalid assignee ID", 400);
  }

  const { thread } = await assertCanMutateThread(orgId, userId, role, threadId);

  // Verify assignee is a member of the org
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId: assigneeId },
  });
  if (!member) {
    throw new AssignmentServiceError(
      "Assignee is not a member of this organization",
      400,
    );
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Resolve any existing active assignment to REASSIGNED
    await tx.mailboxAssignment.updateMany({
      where: { threadId, orgId, status: "ACTIVE" },
      data: { status: "REASSIGNED", updatedAt: new Date() },
    });

    // Create new assignment record
    await tx.mailboxAssignment.create({
      data: {
        orgId,
        threadId,
        assigneeId,
        assignedBy: userId,
        status: "ACTIVE",
      },
    });

    // Update thread assignee
    const after = await tx.mailboxThread.update({
      where: { id: threadId, orgId },
      data: { assigneeId },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_ASSIGNED",
      summary: `Assigned thread "${thread.subject}" to member`,
      mailboxConnectionId: thread.mailboxConnectionId,
      threadId: thread.id,
      metadata: {
        assigneeId,
        previousAssigneeId: thread.assigneeId,
      },
    });

    return after;
  });

  return {
    success: true,
    thread: toMailboxThreadReadShape(
      updated as unknown as import("./domain-types").MailboxThreadRecord,
    ),
  };
}

/**
 * Unassign a thread, clearing its assignee.
 */
export async function unassignThread(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
}): Promise<AssignmentResult> {
  const { orgId, userId, role, threadId } = params;

  const { thread } = await assertCanMutateThread(orgId, userId, role, threadId);

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.mailboxAssignment.updateMany({
      where: { threadId, orgId, status: "ACTIVE" },
      data: { status: "RESOLVED", updatedAt: new Date() },
    });

    const after = await tx.mailboxThread.update({
      where: { id: threadId, orgId },
      data: { assigneeId: null },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_UNASSIGNED",
      summary: `Unassigned thread "${thread.subject}"`,
      mailboxConnectionId: thread.mailboxConnectionId,
      threadId: thread.id,
      metadata: {
        previousAssigneeId: thread.assigneeId,
      },
    });

    return after;
  });

  return {
    success: true,
    thread: toMailboxThreadReadShape(
      updated as unknown as import("./domain-types").MailboxThreadRecord,
    ),
  };
}

/**
 * Update the workflow status of a thread.
 * Handles archive/unarchive preArchiveStatus semantics.
 */
export async function setThreadStatus(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
  status: MailboxThreadStatus;
}): Promise<AssignmentResult> {
  const { orgId, userId, role, threadId, status } = params;

  const VALID_STATUSES: MailboxThreadStatus[] = [
    "OPEN",
    "PENDING",
    "CLOSED",
    "ARCHIVED",
  ];
  if (!VALID_STATUSES.includes(status)) {
    throw new AssignmentServiceError(
      `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      400,
    );
  }

  const { thread } = await assertCanMutateThread(orgId, userId, role, threadId);

  if (thread.status === status) {
    throw new AssignmentServiceError(
      "Thread is already in the requested status",
      400,
    );
  }

  const updateData: Prisma.MailboxThreadUpdateInput = { status };
  if (status === "ARCHIVED") {
    if (thread.status !== "ARCHIVED") {
      updateData.preArchiveStatus = thread.status;
    }
  } else if (thread.status === "ARCHIVED") {
    updateData.preArchiveStatus = null;
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const after = await tx.mailboxThread.update({
      where: { id: threadId, orgId },
      data: updateData,
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_STATUS_CHANGED",
      summary: `Changed thread "${thread.subject}" status to ${status}`,
      mailboxConnectionId: thread.mailboxConnectionId,
      threadId: thread.id,
      metadata: {
        previousStatus: thread.status,
        newStatus: status,
      },
    });

    return after;
  });

  return {
    success: true,
    thread: toMailboxThreadReadShape(
      updated as unknown as import("./domain-types").MailboxThreadRecord,
    ),
  };
}
