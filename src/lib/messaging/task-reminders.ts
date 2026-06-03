import "server-only";

/**
 * Task reminder dispatch service (Sprint 7.2).
 *
 * Idempotency model:
 * - `reminderSentAt` is the durable success marker — written only after the
 *   notification is confirmed created.
 * - Concurrency safety uses an atomic compare-and-swap claim: we attempt to
 *   write a non-null sentinel into `reminderSentAt` WHERE it IS NULL. Only
 *   the winning concurrent run succeeds. On notification failure we release
 *   the claim by resetting `reminderSentAt` back to NULL so the next sweep
 *   can retry.
 *
 * Eligibility rules (all must hold at the moment of dispatch):
 * 1. Task status is open-family (OPEN, IN_PROGRESS, OVERDUE)
 * 2. `reminderAt` is set and <= now
 * 3. `reminderSentAt` IS NULL
 * 4. Task has a current valid assignee who is an active conversation participant
 * 5. Task conversation is accessible (not archived/locked) — enforced via participant check
 */

import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logMessagingAudit } from "./audit";
import type { MessagingTaskRecord } from "./domain-types";
import { getMessagingPreferences, isCurrentlyInQuietHours } from "./notification-service";

// ─── Constants ────────────────────────────────────────────────────────────────

const OPEN_FAMILY_STATUSES = ["OPEN", "IN_PROGRESS", "OVERDUE"] as const;

/**
 * Maximum number of tasks to process per cron invocation.
 * Keeps the sweep bounded and prevents runaway execution.
 */
const DEFAULT_SWEEP_LIMIT = 50;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ReminderDispatchResult {
  /** Number of reminders successfully dispatched in this sweep. */
  dispatched: number;
  /** Number of tasks skipped due to missing/ineligible assignee. */
  skippedNoAssignee: number;
  /** Number of tasks skipped due to assignee not being an active participant. */
  skippedIneligibleAssignee: number;
  /** Number of tasks that failed during notification send. */
  failed: number;
  /** Total tasks evaluated in this sweep. */
  evaluated: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build a deep-link URL for a task notification.
 * Safely degrades when originating message context is unavailable.
 */
function buildTaskLink(
  conversationId: string,
  taskId: string,
  _originatingMessageId: string | null,
): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app";
  // Primary link goes to the task within the conversation
  const taskUrl = `${base}/app/messaging/conversations/${conversationId}/tasks/${taskId}`;
  return taskUrl;
}

/**
 * Check if a raw task row is eligible for reminder dispatch.
 * This is a pure function over the persisted state — no DB calls.
 */
export function isReminderEligible(task: {
  status: string;
  reminderAt: Date | null;
  reminderSentAt: Date | null;
  assigneeId: string | null;
}): boolean {
  if (!OPEN_FAMILY_STATUSES.includes(task.status as typeof OPEN_FAMILY_STATUSES[number])) {
    return false;
  }
  if (!task.reminderAt) return false;
  if (task.reminderAt > new Date()) return false;
  if (task.reminderSentAt !== null) return false;
  if (!task.assigneeId) return false;
  return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a reminder notification for a single task to its current assignee.
 * Returns true if the notification was created successfully.
 *
 * Audit logging is fire-and-forget after notification success — a transient
 * audit failure must not cause a duplicate reminder send.
 */
async function sendReminderNotification(
  task: MessagingTaskRecord,
  assigneeEmail: string | null,
): Promise<boolean> {
  const link = buildTaskLink(task.conversationId, task.id, task.originatingMessageId);

  try {
    await createNotification({
      userId: task.assigneeId!,
      orgId: task.orgId,
      type: "TASK_REMINDER",
      title: `Reminder: ${task.title}`,
      body: task.description
        ? `Task reminder: ${task.title} — ${task.description.length > 120 ? task.description.slice(0, 120) + "..." : task.description}`
        : `Task reminder: ${task.title}`,
      link,
      emailRequested: Boolean(assigneeEmail),
      recipientEmail: assigneeEmail ?? undefined,
      sourceModule: "messaging",
      sourceRef: task.id,
    });

    // Audit is best-effort — must not turn a delivered reminder into a retryable failure
    // The timeline mapper uses reminderType: "scheduled" metadata to correctly label this event
    logMessagingAudit({
      orgId: task.orgId,
      actorId: task.assigneeId!,
      action: "TASK_UPDATED",
      summary: `Reminder dispatched for task: ${task.title}`,
      conversationId: task.conversationId,
      taskId: task.id,
      metadata: { reminderType: "scheduled", assigneeId: task.assigneeId },
    }).catch(() => {});

    return true;
  } catch (error) {
    console.error(`[task-reminders] Failed to send reminder for task ${task.id}:`, error);
    return false;
  }
}

/**
 * Send a task assignment notification to the newly assigned user.
 * Called from assignTask when a non-null assignee is set.
 */
export async function sendTaskAssignmentNotification(
  task: { id: string; orgId: string; conversationId: string; title: string; description: string | null; originatingMessageId: string | null },
  assigneeId: string,
  actorId: string,
): Promise<void> {
  const link = buildTaskLink(task.conversationId, task.id, task.originatingMessageId);

  // Resolve assignee email for optional email delivery
  let assigneeEmail: string | null = null;
  try {
    const member = await db.member.findFirst({
      where: { organizationId: task.orgId, userId: assigneeId },
      include: { user: { select: { email: true } } },
    });
    assigneeEmail = member?.user?.email ?? null;
  } catch {
    // Non-fatal — notification still created without email
  }

  try {
    await createNotification({
      userId: assigneeId,
      orgId: task.orgId,
      type: "TASK_ASSIGNED",
      title: `Task assigned: ${task.title}`,
      body: task.description
        ? `You have been assigned a task: ${task.title} — ${task.description.slice(0, 120)}`
        : `You have been assigned a task: ${task.title}`,
      link,
      emailRequested: Boolean(assigneeEmail),
      recipientEmail: assigneeEmail ?? undefined,
      sourceModule: "messaging",
      sourceRef: task.id,
    });

    await logMessagingAudit({
      orgId: task.orgId,
      actorId,
      action: "TASK_ASSIGNED",
      summary: `Task assigned to ${assigneeId}: ${task.title}`,
      conversationId: task.conversationId,
      taskId: task.id,
      metadata: { assigneeId },
    });
  } catch (error) {
    // Assignment notification failure is non-fatal — task is already updated
    console.error(`[task-reminders] Failed to send assignment notification for task ${task.id}:`, error);
  }
}

/**
 * Release a claim on a task reminder so the next sweep can retry.
 * Only clears `reminderSentAt` if it still holds our claim sentinel (the provided `claimedAt`).
 */
async function releaseReminderClaim(taskId: string, claimedAt: Date): Promise<void> {
  await db.messagingTask.updateMany({
    where: {
      id: taskId,
      reminderSentAt: claimedAt,
    },
    data: { reminderSentAt: null },
  });
}

/**
 * Main entry point for the task reminder sweep.
 *
 * Claim-release pattern (Sprint 7.2 fix):
 * 1. Find eligible tasks (open-family, reminderAt <= now, reminderSentAt IS NULL, has assignee)
 * 2. For each task, atomically write `reminderSentAt = now` WHERE `reminderSentAt IS NULL`
 * 3. If the write affects 0 rows, another run already claimed it — skip.
 * 4. Attempt to send the notification.
 * 5. On success: leave `reminderSentAt` as-is (durable success marker).
 * 6. On failure: release the claim (`reminderSentAt = NULL`) so the next sweep retries.
 *
 * This guarantees:
 * - Concurrent sweeps never double-send (atomic claim blocks duplicates)
 * - Transient notification failures are retried on the next sweep
 * - Completed/cancelled tasks are excluded by the status filter
 */
export async function dispatchDueTaskReminders(
  limit = DEFAULT_SWEEP_LIMIT,
): Promise<ReminderDispatchResult> {
  const now = new Date();
  const result: ReminderDispatchResult = {
    dispatched: 0,
    skippedNoAssignee: 0,
    skippedIneligibleAssignee: 0,
    failed: 0,
    evaluated: 0,
  };

  // Structured operational signal: sweep started
  logMessagingAudit({
    orgId: "__system__",
    actorId: "__sweep__",
    action: "ADMIN_SUPPORT_ACTION",
    summary: "Reminder sweep started",
    metadata: { sweepType: "task_reminder", limit },
  }).catch(() => {});

  // Step 1: Find candidate tasks — bounded scan with all eligibility pre-filtered at DB level
  const candidates = await db.messagingTask.findMany({
    where: {
      status: { in: [...OPEN_FAMILY_STATUSES] },
      reminderAt: { not: null, lte: now },
      reminderSentAt: null,
      assigneeId: { not: null },
    },
    orderBy: [{ reminderAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  result.evaluated = candidates.length;

  if (candidates.length === 0) {
    // Sweep completed with no candidates
    logMessagingAudit({
      orgId: "__system__",
      actorId: "__sweep__",
      action: "ADMIN_SUPPORT_ACTION",
      summary: "Reminder sweep completed — no candidates",
      metadata: { sweepType: "task_reminder", evaluated: 0 },
    }).catch(() => {});
    return result;
  }

  // Step 2: Validate assignee participation, claim, send, and release-on-failure
  for (const candidate of candidates) {
    // Re-check assignee is still an active participant in the conversation
    const participant = await db.conversationParticipant.findFirst({
      where: {
        orgId: candidate.orgId,
        conversationId: candidate.conversationId,
        userId: candidate.assigneeId!,
        leftAt: null,
      },
    });

    if (!participant) {
      result.skippedIneligibleAssignee++;
      continue;
    }

    // Atomic claim: write reminderSentAt WHERE it IS NULL
    const claimed = await db.messagingTask.updateMany({
      where: {
        id: candidate.id,
        reminderSentAt: null,
        status: { in: [...OPEN_FAMILY_STATUSES] },
      },
      data: { reminderSentAt: now },
    });

    if (claimed.count === 0) {
      // Already claimed by another concurrent run — skip
      continue;
    }

    // Re-read the task to get the full record for notification
    const task = await db.messagingTask.findUnique({ where: { id: candidate.id } });
    if (!task) {
      // Task was deleted between claim and read — release claim and skip
      await releaseReminderClaim(candidate.id, now);
      continue;
    }

    // Resolve preferences and mute state
    const pref = await getMessagingPreferences({ userId: task.assigneeId!, orgId: task.orgId });
    const readState = await db.conversationReadState.findFirst({
      where: { conversationId: task.conversationId, userId: task.assigneeId! },
    });
    const isMuted = readState?.isMuted ?? false;

    // If the category is explicitly disabled, treat as intentionally suppressed and mark processed.
    if (!pref.allNotificationsEnabled || !pref.taskRemindersEnabled) {
      result.dispatched++;
      continue;
    }

    const inQuietHours = isCurrentlyInQuietHours(pref);
    const suppressActiveDelivery = inQuietHours || isMuted;

    // Resolve assignee email for optional email delivery (only if not suppressed)
    let assigneeEmail: string | null = null;
    if (!suppressActiveDelivery) {
      try {
        const member = await db.member.findFirst({
          where: { organizationId: task.orgId, userId: task.assigneeId! },
          include: { user: { select: { email: true } } },
        });
        assigneeEmail = member?.user?.email ?? null;
      } catch {
        // Non-fatal
      }
    }

    const sent = await sendReminderNotification(
      task,
      assigneeEmail,
    );

    if (sent) {
      // reminderSentAt is already set — durable success marker
      result.dispatched++;
    } else {
      // Notification failed — release claim so next sweep can retry
      await releaseReminderClaim(candidate.id, now);
      result.failed++;
    }
  }

  // Structured operational signal: sweep completed
  logMessagingAudit({
    orgId: "__system__",
    actorId: "__sweep__",
    action: "ADMIN_SUPPORT_ACTION",
    summary: "Reminder sweep completed",
    metadata: {
      sweepType: "task_reminder",
      evaluated: result.evaluated,
      dispatched: result.dispatched,
      failed: result.failed,
      skippedIneligibleAssignee: result.skippedIneligibleAssignee,
    },
  }).catch(() => {});

  return result;
}
