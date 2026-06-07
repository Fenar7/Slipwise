import "server-only";

import { db } from "@/lib/db";
import { AttachmentIndexingStatus, AttachmentScanStatus } from "@/generated/prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessagingDiagnostics {
  generatedAt: string;
  searchIndexHealth: SearchIndexHealth;
  notificationHealth: NotificationHealth;
  reminderHealth: ReminderHealth;
  digestHealth: DigestHealth;
  followUpHealth: FollowUpHealth;
}

export interface SearchIndexHealth {
  totalAttachments: number;
  indexedCount: number;
  pendingCount: number;
  failedCount: number;
  unindexedCount: number;
  indexingCoveragePercent: number;
  pendingScanCount: number;
  blockedCount: number;
  degraded: boolean;
}

export interface NotificationHealth {
  totalNotifications: number;
  unreadCount: number;
  recentFailureEstimate: number;
  notificationsWithDedupe: number;
}

export interface ReminderHealth {
  taskReminders: {
    total: number;
    dispatched: number;
    pendingDispatch: number;
    overdueWithoutReminder: number;
  };
  meetingReminders: {
    totalUpcoming: number;
    remindersDispatched: number;
    pendingReminders: number;
  };
}

export interface DigestHealth {
  digestEnabledUsers: number;
  dailyUsers: number;
  weeklyUsers: number;
  recentlyDispatched: number;
}

export interface FollowUpHealth {
  totalFollowUps: number;
  pendingFollowUps: number;
  resolvedFollowUps: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Build comprehensive Phase 9 diagnostics for an org.
 * Only callable by org admins — returns null for non-admins.
 *
 * Hardened (Sprint 9.5):
 * - All queries are org-scoped and bounded
 * - No sensitive message content is exposed
 * - Truthful state representation (degraded vs healthy empty)
 * - Batch parallel queries where possible
 */
export async function getMessagingDiagnostics(
  orgId: string,
  userId: string,
): Promise<MessagingDiagnostics | null> {
  // Defense-in-depth: verify admin role at DB level
  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId },
    select: { role: true },
  });

  if (!member) return null;
  const orgRole = member.role?.toLowerCase() ?? "";
  const isAdmin = orgRole === "owner" || orgRole === "admin" || orgRole === "co_owner";
  if (!isAdmin) return null;

  const now = new Date();

  // Batch all independent queries in parallel
  const [
    searchIndexHealth,
    notificationHealth,
    reminderHealth,
    digestHealth,
    followUpHealth,
  ] = await Promise.all([
    getSearchIndexHealth(orgId),
    getNotificationHealth(orgId),
    getReminderHealth(orgId),
    getDigestHealth(orgId),
    getFollowUpHealth(orgId),
  ]);

  return {
    generatedAt: now.toISOString(),
    searchIndexHealth,
    notificationHealth,
    reminderHealth,
    digestHealth,
    followUpHealth,
  };
}

// ─── Sub-query functions ──────────────────────────────────────────────────────

async function getSearchIndexHealth(orgId: string): Promise<SearchIndexHealth> {
  const [
    totalAttachments,
    indexedCount,
    pendingCount,
    failedCount,
    unindexedCount,
    pendingScanCount,
    blockedCount,
  ] = await Promise.all([
    db.conversationAttachment.count({
      where: { orgId },
    }),
    db.messagingAttachmentIndex.count({
      where: { orgId, indexingStatus: AttachmentIndexingStatus.INDEXED },
    }),
    db.messagingAttachmentIndex.count({
      where: { orgId, indexingStatus: AttachmentIndexingStatus.PENDING },
    }),
    db.messagingAttachmentIndex.count({
      where: { orgId, indexingStatus: AttachmentIndexingStatus.FAILED },
    }),
    db.messagingAttachmentIndex.count({
      where: { orgId, indexingStatus: AttachmentIndexingStatus.UNINDEXED },
    }),
    db.conversationAttachment.count({
      where: { orgId, scanStatus: AttachmentScanStatus.PENDING },
    }),
    db.conversationAttachment.count({
      where: { orgId, scanStatus: AttachmentScanStatus.BLOCKED },
    }),
  ]);

  const indexedPlusPending = indexedCount + pendingCount;
  const indexingCoveragePercent = totalAttachments > 0
    ? Math.round((indexedPlusPending / totalAttachments) * 100)
    : 100;

  // Degraded if >10% of attachments are in failed state or pending scan
  const degraded = totalAttachments > 0 && (
    (failedCount / totalAttachments) > 0.1 ||
    (pendingScanCount / totalAttachments) > 0.5
  );

  return {
    totalAttachments,
    indexedCount,
    pendingCount,
    failedCount,
    unindexedCount,
    indexingCoveragePercent,
    pendingScanCount,
    blockedCount,
    degraded,
  };
}

async function getNotificationHealth(orgId: string): Promise<NotificationHealth> {
  const [totalNotifications, unreadCount, notificationsWithDedupe] = await Promise.all([
    db.notification.count({
      where: { orgId, sourceModule: "messaging" },
    }),
    db.notification.count({
      where: { orgId, sourceModule: "messaging", isRead: false },
    }),
    db.notification.count({
      where: { orgId, sourceModule: "messaging", dedupeKey: { not: null } },
    }),
  ]);

  // Estimate recent failures by checking for notifications that may indicate delivery issues
  // This is a heuristic — we look at notifications created in the last hour that haven't been read
  // as a proxy for potential delivery problems
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFailureEstimate = await db.notificationDelivery.count({
    where: {
      orgId,
      status: "FAILED",
      queuedAt: { gte: oneHourAgo },
    },
  }).catch(() => 0);

  return {
    totalNotifications,
    unreadCount,
    recentFailureEstimate,
    notificationsWithDedupe,
  };
}

async function getReminderHealth(orgId: string): Promise<ReminderHealth> {
  const now = new Date();

  const [taskTotal, taskDispatched, taskPending, taskOverdueWithoutReminder] = await Promise.all([
    db.messagingTask.count({
      where: {
        orgId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
      },
    }),
    db.messagingTask.count({
      where: {
        orgId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        reminderSentAt: { not: null },
      },
    }),
    db.messagingTask.count({
      where: {
        orgId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        reminderAt: { not: null, lte: now },
        reminderSentAt: null,
      },
    }),
    db.messagingTask.count({
      where: {
        orgId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        reminderAt: null,
        dueDate: { lt: now },
      },
    }),
  ]);

  const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

  const [meetingTotalUpcoming, meetingDispatched, meetingPending] = await Promise.all([
    db.conversationMeeting.count({
      where: {
        orgId,
        status: "UPCOMING",
        scheduledAt: { gte: now, lte: fifteenMinutesFromNow },
      },
    }),
    db.conversationMeeting.count({
      where: {
        orgId,
        status: "UPCOMING",
        scheduledAt: { gte: now, lte: fifteenMinutesFromNow },
        reminderSentAt: { not: null },
      },
    }),
    db.conversationMeeting.count({
      where: {
        orgId,
        status: "UPCOMING",
        scheduledAt: { gte: now, lte: fifteenMinutesFromNow },
        reminderSentAt: null,
      },
    }),
  ]);

  return {
    taskReminders: {
      total: taskTotal,
      dispatched: taskDispatched,
      pendingDispatch: taskPending,
      overdueWithoutReminder: taskOverdueWithoutReminder,
    },
    meetingReminders: {
      totalUpcoming: meetingTotalUpcoming,
      remindersDispatched: meetingDispatched,
      pendingReminders: meetingPending,
    },
  };
}

async function getDigestHealth(orgId: string): Promise<DigestHealth> {
  const [digestEnabledUsers, dailyUsers, weeklyUsers, recentlyDispatched] = await Promise.all([
    db.messagingNotificationPreference.count({
      where: { orgId, digestEnabled: true },
    }),
    db.messagingNotificationPreference.count({
      where: { orgId, digestEnabled: true, digestFrequency: "DAILY" },
    }),
    db.messagingNotificationPreference.count({
      where: { orgId, digestEnabled: true, digestFrequency: "WEEKLY" },
    }),
    db.messagingNotificationPreference.count({
      where: {
        orgId,
        digestEnabled: true,
        lastDigestSentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    digestEnabledUsers,
    dailyUsers,
    weeklyUsers,
    recentlyDispatched,
  };
}

async function getFollowUpHealth(orgId: string): Promise<FollowUpHealth> {
  const [totalFollowUps, pendingFollowUps, resolvedFollowUps] = await Promise.all([
    db.messagingFollowUp.count({ where: { orgId } }),
    db.messagingFollowUp.count({ where: { orgId, resolvedAt: null } }),
    db.messagingFollowUp.count({ where: { orgId, resolvedAt: { not: null } } }),
  ]);

  return {
    totalFollowUps,
    pendingFollowUps,
    resolvedFollowUps,
  };
}
