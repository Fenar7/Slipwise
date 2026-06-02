import "server-only";

import { db } from "@/lib/db";
import type {
  ConversationRecord,
  ConversationMessageRecord,
  MessageReactionRecord,
} from "./domain-types";
import { conversationOrgSafeWhere, participantOrgSafeWhere } from "./org-safe-helpers";
import { toConversationRecord, toMessageRecord, toThreadRecord, toReadStateRecord, toParticipantRecord, toMeetingRecord } from "./mappers";
import {
  toConversationSummary,
  toConversationDetail,
  toMessageDetail,
  toTaskSummary,
  type ConversationSummary,
  type ConversationDetail,
  type MessageDetail,
  type TaskSummary,
  type CalendarEntry,
} from "./read-shapes";
import { getMessagingAuditActionLabel } from "./audit";
import {
  getConversationById,
  listConversationsForUser,
} from "./conversation-service";
import { reconcileProviderChangesForMeeting, reconcileProviderChangesForTask } from "./provider-sync-service";
import {
  getMessageById,
} from "./message-service";
import {
  listReactionsForMessage,
} from "./reaction-service";
import {
  getReadState,
} from "./mention-readstate-service";
import {
  listTasksForConversation,
  listAllTasksForUser,
} from "./task-service";
import type { TaskListFilterInput } from "./service-contracts";
import type { MessagingAuditAction } from "./domain-types";

// ─── Conversation list read model ───────────────────────────────────────────────

export interface ListConversationSummariesOptions {
  limit?: number;
  cursor?: string | null;
}

/**
 * List conversation summaries for a user with derived metadata.
 * Returns only conversations where the user is an active participant.
 */
export async function listConversationSummariesForUser(
  orgId: string,
  userId: string,
  options?: ListConversationSummariesOptions,
): Promise<ConversationSummary[]> {
  const conversations = await listConversationsForUser(orgId, userId);

  // Apply cursor pagination manually since listConversationsForUser returns all
  let paginated = conversations;
  if (options?.cursor) {
    const cursorIndex = conversations.findIndex((c) => c.id === options.cursor);
    if (cursorIndex !== -1) {
      paginated = conversations.slice(cursorIndex + 1);
    }
  }

  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  paginated = paginated.slice(0, limit);

  // Gather aggregates in parallel
  const results = await Promise.all(
    paginated.map(async (conversation) => {
      const [participantCount, latestMessage, readState] = await Promise.all([
        db.conversationParticipant.count({
          where: {
            orgId,
            conversationId: conversation.id,
            leftAt: null,
          },
        }),
        db.conversationMessage.findFirst({
          where: {
            orgId,
            conversationId: conversation.id,
            status: { not: "DELETED" },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        db.conversationReadState.findFirst({
          where: {
            orgId,
            conversationId: conversation.id,
            userId,
          },
          select: { unreadCount: true },
        }),
      ]);

      return toConversationSummary({
        record: conversation,
        participantCount,
        lastMessageAt: latestMessage?.createdAt ?? null,
        unreadCount: readState?.unreadCount ?? null,
      });
    }),
  );

  return results;
}

// ─── Conversation detail read model ───────────────────────────────────────────

export interface GetConversationDetailOptions {
  messageLimit?: number;
  messageCursor?: string | null;
}

/**
 * Fetch an enriched conversation detail for the workspace view.
 * Validates that the requesting user is an active participant.
 */
export async function getConversationDetail(
  orgId: string,
  conversationId: string,
  userId: string,
  options?: GetConversationDetailOptions,
): Promise<ConversationDetail | null> {
  // Verify membership first
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    return null;
  }

  const conversation = await getConversationById(orgId, conversationId);
  if (!conversation) {
    return null;
  }

  const [participants, messages, threads, readState] = await Promise.all([
    db.conversationParticipant.findMany({
      where: { orgId, conversationId, leftAt: null },
      orderBy: { joinedAt: "asc" },
    }).then((rows) => rows.map(toParticipantRecord)),
    db.conversationMessage.findMany({
      where: { orgId, conversationId, threadId: null },
      orderBy: { createdAt: "asc" },
      take: options?.messageLimit ?? 50,
      skip: options?.messageCursor ? 1 : 0,
      cursor: options?.messageCursor ? { id: options.messageCursor } : undefined,
    }).then((rows) => rows.map(toMessageRecord)),
    db.conversationThread.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: "desc" },
    }).then((rows) => rows.map(toThreadRecord)),
    getReadState(orgId, conversationId, userId),
  ]);

  // Fetch reactions and attachment counts for all messages in one batch
  const messageIds = messages.map((m) => m.id);
  const [reactionsRows, attachmentRows, mentionRows] = await Promise.all([
    messageIds.length > 0
      ? db.messageReaction.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
          },
        })
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.conversationAttachment.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
          },
          select: {
            id: true,
            messageId: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            scanStatus: true,
          },
        })
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.messageMention.findMany({
          where: {
            orgId,
            messageId: { in: messageIds },
            mentionedUserId: userId,
          },
          select: { messageId: true },
        })
      : Promise.resolve([]),
  ]);

  const reactionsByMessageId = new Map<string, MessageReactionRecord[]>();
  for (const row of reactionsRows) {
    const list = reactionsByMessageId.get(row.messageId) ?? [];
    list.push(row);
    reactionsByMessageId.set(row.messageId, list);
  }

  const attachmentsByMessageId = new Map<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; scanStatus: string }>>();
  for (const row of attachmentRows) {
    const list = attachmentsByMessageId.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      scanStatus: row.scanStatus,
    });
    attachmentsByMessageId.set(row.messageId, list);
  }
  const attachmentCountByMessageId = new Map<string, number>();
  for (const [msgId, atts] of attachmentsByMessageId.entries()) {
    attachmentCountByMessageId.set(msgId, atts.length);
  }

  const mentionCurrentUserByMessageId = new Map<string, boolean>();
  for (const row of mentionRows) {
    mentionCurrentUserByMessageId.set(row.messageId, true);
  }

  return toConversationDetail({
    record: conversation,
    participants,
    messages,
    messageReactions: reactionsByMessageId,
    mentionCurrentUserByMessageId,
    threads,
    readState,
    currentUserId: userId,
    attachmentCountByMessageId,
    attachmentsByMessageId,
  });
}

// ─── Message detail read model ──────────────────────────────────────────────────

/**
 * Fetch an enriched message detail with reactions and mentions.
 * Requires active participant status in the message's conversation.
 */
export async function getMessageDetail(
  orgId: string,
  messageId: string,
  userId: string,
): Promise<MessageDetail | null> {
  const message = await getMessageById(orgId, messageId);
  if (!message) {
    return null;
  }

  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId: message.conversationId,
      userId,
      leftAt: null,
    },
  });
  if (!participant) {
    return null;
  }

  const [reactions, mentions, attachments] = await Promise.all([
    listReactionsForMessage(orgId, messageId),
    db.messageMention.findMany({
      where: {
        orgId,
        messageId,
      },
    }),
    db.conversationAttachment.findMany({
      where: {
        orgId,
        messageId,
      },
    }),
  ]);

  return toMessageDetail({
    record: message,
    reactions,
    mentions,
    attachments,
  });
}


// ─── Task summaries read model ──────────────────────────────────────────────────

export async function getConversationTaskSummaries(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<TaskSummary[]> {
  const records = await listTasksForConversation(orgId, conversationId, userId);

  if (records.length === 0) {
    return [];
  }

  const assigneeIds = Array.from(
    new Set(records.map((r) => r.assigneeId).filter((id): id is string => id !== null)),
  );
  const creatorIds = Array.from(
    new Set(records.map((r) => r.createdBy)),
  );
  const allUserIds = Array.from(new Set([...assigneeIds, ...creatorIds]));

  const profiles =
    allUserIds.length > 0
      ? await db.profile.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true },
        })
      : [];

  const profileById = new Map<string, { name: string }>();
  for (const p of profiles) {
    profileById.set(p.id, p);
  }

  function getInitials(name: string | null): string | null {
    if (!name) return null;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return records.map((record) => {
    const assignee = record.assigneeId ? profileById.get(record.assigneeId) ?? null : null;
    const creator = profileById.get(record.createdBy) ?? null;
    return toTaskSummary({
      record,
      assigneeName: assignee?.name ?? null,
      assigneeAvatarInitials: getInitials(assignee?.name ?? null),
      createdByName: creator?.name ?? null,
    });
  });
}

export interface GetOrgTaskSummariesOptions {
  scope?: TaskListFilterInput["scope"];
  conversationId?: string;
  cursor?: string | null;
  limit?: number;
}

export async function getOrgTaskSummaries(
  orgId: string,
  userId: string,
  options?: GetOrgTaskSummariesOptions,
): Promise<{ tasks: TaskSummary[]; nextCursor: string | null; hasMore: boolean }> {
  const result = await listAllTasksForUser({
    orgId,
    userId,
    scope: options?.scope,
    conversationId: options?.conversationId,
    cursor: options?.cursor,
    limit: options?.limit,
  });

  if (result.tasks.length === 0) {
    return { tasks: [], nextCursor: null, hasMore: false };
  }

  const assigneeIds = Array.from(
    new Set(result.tasks.map((r) => r.assigneeId).filter((id): id is string => id !== null)),
  );
  const creatorIds = Array.from(
    new Set(result.tasks.map((r) => r.createdBy)),
  );
  const allUserIds = Array.from(new Set([...assigneeIds, ...creatorIds]));
  const conversationIds = Array.from(new Set(result.tasks.map((r) => r.conversationId)));

  const [profiles, conversations] = await Promise.all([
    allUserIds.length > 0
      ? db.profile.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    db.conversation.findMany({
      where: {
        id: { in: conversationIds },
        orgId,
      },
      select: {
        id: true,
        type: true,
        name: true,
      },
    }),
  ]);

  const profileById = new Map<string, { name: string }>();
  for (const p of profiles) {
    profileById.set(p.id, p);
  }

  const conversationById = new Map<string, { type: "CHANNEL" | "DM" | "GROUP"; name: string | null }>();
  for (const c of conversations) {
    conversationById.set(c.id, {
      type: c.type,
      name: c.name,
    });
  }

  function getInitials(name: string | null): string | null {
    if (!name) return null;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const tasks = result.tasks.map((record) => {
    const assignee = record.assigneeId ? profileById.get(record.assigneeId) ?? null : null;
    const creator = profileById.get(record.createdBy) ?? null;
    const conv = conversationById.get(record.conversationId) ?? null;
    
    const baseSummary = toTaskSummary({
      record,
      assigneeName: assignee?.name ?? null,
      assigneeAvatarInitials: getInitials(assignee?.name ?? null),
      createdByName: creator?.name ?? null,
    });

    return {
      ...baseSummary,
      conversationName: conv?.name ?? null,
      conversationType: conv?.type ?? undefined,
    };
  });

  return {
    tasks,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

// ─── Timeline event types ──────────────────────────────────────────────────

export interface TimelineEvent {
  action: MessagingAuditAction;
  label: string;
  summary: string;
  actorId: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  /** Mapped truthful event type for display logic. */
  eventType:
    | "task_created"
    | "task_completed"
    | "task_cancelled"
    | "task_reopened"
    | "task_assigned"
    | "task_assignee_cleared"
    | "task_due_date_changed"
    | "task_reminder_changed"
    | "task_reminder_sent"
    | "task_updated";
}

/**
 * Map a raw audit event to a truthful timeline event type.
 * Uses the action enum + metadata heuristics rather than relying on generic labels alone.
 */
export function mapToTimelineEvent(event: {
  action: MessagingAuditAction;
  summary: string;
  actorId: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}): TimelineEvent {
  const { action, summary, actorId, createdAt, metadata } = event;

  let eventType: TimelineEvent["eventType"];

  switch (action) {
    case "TASK_CREATED":
      eventType = "task_created";
      break;
    case "TASK_COMPLETED":
      eventType = "task_completed";
      break;
    case "TASK_ASSIGNED":
      eventType = "task_assigned";
      break;
    case "TASK_UPDATED": {
      const previousStatus = metadata?.previousStatus;
      const newStatus = metadata?.newStatus;
      const updatedFields = metadata?.updatedFields;
      const newAssigneeId = metadata?.newAssigneeId;
      const previousAssigneeId = metadata?.previousAssigneeId;

      if (
        typeof newStatus === "string" &&
        newStatus === "CANCELLED" &&
        typeof previousStatus === "string" &&
        previousStatus !== "CANCELLED"
      ) {
        eventType = "task_cancelled";
      } else if (
        typeof previousStatus === "string" &&
        previousStatus === "DONE" &&
        typeof newStatus === "string" &&
        newStatus !== "DONE"
      ) {
        eventType = "task_reopened";
      } else if (metadata?.reminderType === "scheduled") {
        eventType = "task_reminder_sent";
      } else if (newAssigneeId !== undefined || previousAssigneeId !== undefined) {
        eventType = newAssigneeId === null ? "task_assignee_cleared" : "task_assigned";
      } else if (Array.isArray(updatedFields) && updatedFields.includes("dueDate")) {
        eventType = "task_due_date_changed";
      } else if (Array.isArray(updatedFields) && (updatedFields.includes("reminderAt") || updatedFields.includes("reminderSentAt"))) {
        eventType = "task_reminder_changed";
      } else {
        eventType = "task_updated";
      }
      break;
    }
    default:
      eventType = "task_updated";
  }

  return {
    action,
    label: getMessagingAuditActionLabel(action),
    summary,
    actorId,
    createdAt,
    metadata,
    eventType,
  };
}

// ─── Task activity timeline (permission-gated) ─────────────────────────────

/**
 * Get the activity timeline for a task.
 * Requires the requesting user to be an active participant in the task's conversation.
 * Returns null if the user does not have access (no metadata leakage).
 */
export async function getTaskActivityTimeline(
  orgId: string,
  taskId: string,
  userId: string,
): Promise<TimelineEvent[] | null> {
  const task = await db.messagingTask.findUnique({
    where: { id: taskId, orgId },
    select: { conversationId: true },
  });

  if (!task) return null;

  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, task.conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) return null;

  const events = await db.messagingAuditEvent.findMany({
    where: { orgId, taskId },
    orderBy: { createdAt: "asc" },
    select: {
      action: true,
      summary: true,
      actorId: true,
      createdAt: true,
      metadata: true,
    },
  });

  return events.map(mapToTimelineEvent);
}

// ─── Diagnostics types ─────────────────────────────────────────────────────

export interface TaskHealthDiagnostics {
  statusCounts: Record<string, number>;
  overdueCount: number;
  reminderDispatchedCount: number;
  reminderPendingCount: number;
}

// ─── Admin/support task diagnostics (permission-gated) ─────────────────────

/**
 * Get task health diagnostics for an org.
 * Only accessible to org admin/support audience.
 * Returns null for non-admin callers (no info leakage).
 */
export async function getTaskHealthDiagnostics(
  orgId: string,
  userId: string,
): Promise<TaskHealthDiagnostics | null> {
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId },
    select: { role: true },
  });

  if (!member) return null;
  const orgRole = member.role?.toLowerCase() ?? "";
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  if (!isAdmin) return null;

  const [statusCounts, overdueCount, reminderDispatchedCount, reminderPendingCount] = await Promise.all([
    db.messagingTask.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
    }),
    db.messagingTask.count({
      where: {
        orgId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        dueDate: { lt: new Date() },
      },
    }),
    db.messagingTask.count({
      where: { orgId, reminderSentAt: { not: null } },
    }),
    db.messagingTask.count({
      where: {
        orgId,
        reminderAt: { not: null },
        reminderSentAt: null,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
      },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row._count._all;
  }

  return {
    statusCounts: statusMap,
    overdueCount,
    reminderDispatchedCount,
    reminderPendingCount,
  };
}

/**
 * Fetch unified calendar entries (meetings, task due dates, task reminders)
 * for a user in an organization.
 * Only returns entries from conversations where the user is an active participant.
 */
export async function getUnifiedCalendar(
  orgId: string,
  userId: string,
  startAt?: Date,
  endAt?: Date,
): Promise<CalendarEntry[]> {
  // 1. Get active conversations for the user
  const activeParticipants = await db.conversationParticipant.findMany({
    where: {
      orgId,
      userId,
      leftAt: null,
    },
    select: {
      conversationId: true,
    },
  });

  const accessibleConversationIds = activeParticipants.map((ap) => ap.conversationId);
  if (accessibleConversationIds.length === 0) {
    return [];
  }

  // 2. Build where filters
  const meetingWhere: any = {
    orgId,
    conversationId: { in: accessibleConversationIds },
  };
  if (startAt || endAt) {
    meetingWhere.scheduledAt = {};
    if (startAt) meetingWhere.scheduledAt.gte = startAt;
    if (endAt) meetingWhere.scheduledAt.lte = endAt;
  }

  const taskWhere: any = {
    orgId,
    conversationId: { in: accessibleConversationIds },
    dueDate: { not: null },
    status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
  };
  if (startAt || endAt) {
    taskWhere.dueDate = {};
    if (startAt) taskWhere.dueDate.gte = startAt;
    if (endAt) taskWhere.dueDate.lte = endAt;
  }

  const taskReminderWhere: any = {
    orgId,
    conversationId: { in: accessibleConversationIds },
    reminderAt: { not: null },
    status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
  };
  if (startAt || endAt) {
    taskReminderWhere.reminderAt = {};
    if (startAt) taskReminderWhere.reminderAt.gte = startAt;
    if (endAt) taskReminderWhere.reminderAt.lte = endAt;
  }

  // 3. Query DB
  const [meetings, tasks, tasksWithReminders, conversations] = await Promise.all([
    db.conversationMeeting.findMany({ where: meetingWhere }),
    db.messagingTask.findMany({ where: taskWhere }),
    db.messagingTask.findMany({ where: taskReminderWhere }),
    db.conversation.findMany({
      where: { id: { in: accessibleConversationIds }, orgId },
      select: { id: true, name: true },
    }),
  ]);

  const reconciledMeetings = await Promise.all(
    meetings.map(async (m) => {
      if (m.providerEventId && m.status !== "CANCELLED") {
        try {
          await reconcileProviderChangesForMeeting(orgId, m.id, userId);
          const fresh = await db.conversationMeeting.findUnique({ where: { id: m.id } });
          return fresh || m;
        } catch (err) {
          console.error(`Failed to reconcile meeting ${m.id} during calendar read:`, err);
        }
      }
      return m;
    })
  );

  const taskReconciliationCache = new Map<string, any>();

  async function getReconciledTask(t: any) {
    if (t.providerEventId && taskReconciliationCache.has(t.id)) {
      return taskReconciliationCache.get(t.id);
    }

    if (t.providerEventId && t.status !== "DONE" && t.status !== "CANCELLED") {
      try {
        await reconcileProviderChangesForTask(orgId, t.id, userId);
        const fresh = await db.messagingTask.findUnique({ where: { id: t.id } });
        const resolved = fresh || t;
        taskReconciliationCache.set(t.id, resolved);
        return resolved;
      } catch (err) {
        console.error(`Failed to reconcile task ${t.id} during calendar read:`, err);
      }
    }

    return t;
  }

  const reconciledTasks = await Promise.all(
    tasks.map((t) => getReconciledTask(t))
  );

  const reconciledTasksWithReminders = await Promise.all(
    tasksWithReminders.map((t) => getReconciledTask(t))
  );

  const conversationMap = new Map(conversations.map((c) => [c.id, c]));

  // Get unique profiles needed
  const scheduledByUserIds = Array.from(new Set(reconciledMeetings.map((m) => m.scheduledBy)));
  const assigneeUserIds = Array.from(
    new Set([
      ...reconciledTasks.map((t) => t.assigneeId).filter((id): id is string => id !== null),
      ...reconciledTasksWithReminders.map((t) => t.assigneeId).filter((id): id is string => id !== null),
    ]),
  );
  const allUserIds = Array.from(new Set([...scheduledByUserIds, ...assigneeUserIds]));

  const profiles =
    allUserIds.length > 0
      ? await db.profile.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true },
        })
      : [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const entries: CalendarEntry[] = [];

  // Load RSVP statuses for the current user for all resolved meetings
  const meetingIds = reconciledMeetings.map((m) => m.id);
  const attendees = meetingIds.length > 0
    ? await db.meetingAttendee.findMany({
        where: { meetingId: { in: meetingIds }, userId },
        select: { meetingId: true, rsvpStatus: true },
      })
    : [];
  const rsvpMap = new Map(attendees.map((a) => [a.meetingId, a.rsvpStatus]));

  // Map meetings
  for (const m of reconciledMeetings) {
    const convName = conversationMap.get(m.conversationId)?.name ?? null;
    const endAtTime = new Date(m.scheduledAt.getTime() + m.durationMinutes * 60 * 1000);
    const rsvpStatus = rsvpMap.get(m.id) ?? "PENDING";
    const canSeeJoin = rsvpStatus !== "DECLINED";
    const joinUrl = m.joinUrl && canSeeJoin ? m.joinUrl : null;
    entries.push({
      id: m.id,
      orgId: m.orgId,
      conversationId: m.conversationId,
      conversationName: convName,
      type: "meeting",
      title: m.title,
      description: m.description,
      startAt: m.scheduledAt.toISOString(),
      endAt: endAtTime.toISOString(),
      status: m.status,
      scheduledBy: m.scheduledBy,
      scheduledByName: profileMap.get(m.scheduledBy)?.name ?? null,
      joinUrl,
      rsvpStatus,
    });
  }

  // Map tasks
  for (const t of reconciledTasks) {
    const convName = conversationMap.get(t.conversationId)?.name ?? null;
    entries.push({
      id: t.id,
      orgId: t.orgId,
      conversationId: t.conversationId,
      conversationName: convName,
      type: "task_due_date",
      title: `Due: ${t.title}`,
      description: t.description,
      startAt: t.dueDate!.toISOString(),
      endAt: t.dueDate!.toISOString(),
      status: t.status,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeId ? profileMap.get(t.assigneeId)?.name ?? null : null,
      priority: t.priority === 3 ? "critical" : t.priority === 2 ? "high" : t.priority === 1 ? "medium" : "low",
    });
  }

  // Map task reminders
  for (const tr of reconciledTasksWithReminders) {
    const convName = conversationMap.get(tr.conversationId)?.name ?? null;
    entries.push({
      id: `${tr.id}-reminder`,
      orgId: tr.orgId,
      conversationId: tr.conversationId,
      conversationName: convName,
      type: "task_reminder",
      title: `Reminder: ${tr.title}`,
      description: tr.description,
      startAt: tr.reminderAt!.toISOString(),
      endAt: tr.reminderAt!.toISOString(),
      status: tr.status,
      assigneeId: tr.assigneeId,
      assigneeName: tr.assigneeId ? profileMap.get(tr.assigneeId)?.name ?? null : null,
      priority: tr.priority === 3 ? "critical" : tr.priority === 2 ? "high" : tr.priority === 1 ? "medium" : "low",
    });
  }

  // Sort chronologically
  return entries.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

/**
 * Get detailed record for a single meeting.
 * Ensures the requesting user is an active participant in the conversation.
 */
export async function getMeetingDetail(
  orgId: string,
  meetingId: string,
  userId: string,
): Promise<ConversationMeetingRecord | null> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    return null;
  }

  const membership = await db.conversationParticipant.findFirst({
    where: {
      orgId,
      conversationId: meeting.conversationId,
      userId,
      leftAt: null,
    },
  });

  if (!membership) {
    return null;
  }

  if (meeting.providerEventId && meeting.status !== "CANCELLED") {
    try {
      const reconciled = await reconcileProviderChangesForMeeting(orgId, meetingId, userId);
      return reconciled;
    } catch (err) {
      console.error(`Failed to reconcile meeting ${meetingId} during detail read:`, err);
    }
  }

  return toMeetingRecord(meeting);
}



