import "server-only";

import { db } from "@/lib/db";
import { queueEmailDelivery } from "@/lib/flow/delivery-engine";
import { logMessagingAudit } from "./audit";

export interface DigestPayload {
  userId: string;
  orgId: string;
  unreadCount: number;
  mentionCount: number;
  replyCount: number;
  taskReminderCount: number;
  meetingReminderCount: number;
  pendingTaskCount: number;
  pendingMeetingCount: number;
}

/**
 * Helper to build custom HTML for the digest email summary.
 */
function buildDigestEmailHtml(payload: DigestPayload): string {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; padding: 20px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Your Slipwise Notification Digest</h2>
        <p>Here is a summary of your unread messaging notifications and upcoming activity in the organization:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; max-width: 600px;">
          <thead>
            <tr style="background-color: #f3f4f6; text-align: left;">
              <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151;">Category</th>
              <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151;">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Mentions</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.mentionCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Replies</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.replyCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Task Reminders</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.taskReminderCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Meeting Reminders</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.meetingReminderCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Pending Tasks Assigned to You</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.pendingTaskCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Upcoming Meetings (next 24h)</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${payload.pendingMeetingCount}</td>
            </tr>
          </tbody>
        </table>
        
        <p style="margin-top: 20px; font-size: 16px; color: #1f2937;">
          Total unread messaging notifications: <strong>${payload.unreadCount}</strong>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0; max-width: 600px;" />
        <p style="font-size: 12px; color: #9ca3af; max-width: 600px;">
          You received this email because digest notifications are enabled in your Slipwise notification settings.
        </p>
      </body>
    </html>
  `;
}

/**
 * Builds the digest payload for a user.
 * Returns null if there are no unread notifications since `since`.
 */
export async function buildUserDigest(params: {
  userId: string;
  orgId: string;
  since: Date;
}): Promise<DigestPayload | null> {
  const { userId, orgId, since } = params;

  const notifications = await db.notification.findMany({
    where: {
      orgId,
      userId,
      isRead: false,
      sourceModule: "messaging",
      createdAt: { gte: since },
    },
  });

  if (notifications.length === 0) {
    return null;
  }

  let mentionCount = 0;
  let replyCount = 0;
  let taskReminderCount = 0;
  let meetingReminderCount = 0;

  for (const notif of notifications) {
    if (notif.type === "MENTION") {
      mentionCount++;
    } else if (notif.type === "REPLY") {
      replyCount++;
    } else if (notif.type === "TASK_REMINDER") {
      taskReminderCount++;
    } else if (notif.type === "MEETING_REMINDER") {
      meetingReminderCount++;
    }
  }

  const pendingTaskCount = await db.messagingTask.count({
    where: {
      orgId,
      assigneeId: userId,
      status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
    },
  });

  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pendingMeetingCount = await db.conversationMeeting.count({
    where: {
      orgId,
      status: "UPCOMING",
      scheduledAt: {
        gte: now,
        lte: twentyFourHoursFromNow,
      },
      attendees: {
        some: {
          userId,
        },
      },
    },
  });

  return {
    userId,
    orgId,
    unreadCount: notifications.length,
    mentionCount,
    replyCount,
    taskReminderCount,
    meetingReminderCount,
    pendingTaskCount,
    pendingMeetingCount,
  };
}

/**
 * Dispatches the notification digest for a single user if enabled and overdue.
 */
export async function dispatchDigestForUser(params: {
  userId: string;
  orgId: string;
}): Promise<{ dispatched: boolean; skipped: boolean; reason?: string }> {
  const { userId, orgId } = params;

  const pref = await db.messagingNotificationPreference.findUnique({
    where: {
      orgId_userId: {
        orgId,
        userId,
      },
    },
  });

  if (!pref || !pref.digestEnabled) {
    return { dispatched: false, skipped: true, reason: "disabled" };
  }

  const now = new Date();

  // Idempotency guard
  if (pref.lastDigestSentAt) {
    const elapsedMs = now.getTime() - pref.lastDigestSentAt.getTime();
    const limitMs =
      pref.digestFrequency === "WEEKLY"
        ? (6 * 24 + 20) * 60 * 60 * 1000
        : 20 * 60 * 60 * 1000;

    if (elapsedMs < limitMs) {
      return { dispatched: false, skipped: true, reason: "too_recent" };
    }
  }

  let since = pref.lastDigestSentAt;
  if (!since) {
    const elapsedHours = pref.digestFrequency === "WEEKLY" ? 7 * 24 : 24;
    since = new Date(now.getTime() - elapsedHours * 60 * 60 * 1000);
  }

  const digest = await buildUserDigest({ userId, orgId, since });
  if (!digest) {
    return { dispatched: false, skipped: true, reason: "empty" };
  }

  const member = await db.member.findFirst({
    where: { organizationId: orgId, userId },
    include: { user: { select: { email: true } } },
  });

  const recipientEmail = member?.user?.email;
  if (!recipientEmail) {
    return { dispatched: false, skipped: true, reason: "no_email" };
  }

  // Create an audit Notification record for the digest itself
  const notif = await db.notification.create({
    data: {
      userId,
      orgId,
      type: "DIGEST",
      title: `Your ${pref.digestFrequency.toLowerCase()} notification digest`,
      body: `Summary of your unread notifications.`,
      isRead: true,
      sourceModule: "messaging",
      dedupeKey: `digest:${userId}:${now.toISOString().split("T")[0]}:${pref.digestFrequency}`,
    },
  });

  const html = buildDigestEmailHtml(digest);

  await queueEmailDelivery({
    notificationId: notif.id,
    orgId,
    recipientEmail,
    subject: `[Slipwise] Your ${pref.digestFrequency.toLowerCase()} notification digest`,
    html,
    sourceModule: "messaging",
  }).catch((err) => {
    console.error("[digest-service] Email queueing failed:", err);
  });

  await db.messagingNotificationPreference.update({
    where: {
      orgId_userId: {
        orgId,
        userId,
      },
    },
    data: {
      lastDigestSentAt: now,
    },
  });

  logMessagingAudit({
    orgId,
    actorId: userId,
    action: "ADMIN_SUPPORT_ACTION",
    summary: `Dispatched ${pref.digestFrequency.toLowerCase()} notification digest`,
    metadata: {
      digestFrequency: pref.digestFrequency,
      unreadCount: digest.unreadCount,
    },
  }).catch(() => {});

  return { dispatched: true, skipped: false };
}

/**
 * Global sweep function to dispatch all overdue digests.
 */
export async function dispatchPendingDigests(
  limit = 50,
): Promise<{ dispatched: number; skipped: number; failed: number; evaluated: number }> {
  const now = new Date();
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const sixDaysTwentyHoursAgo = new Date(now.getTime() - (6 * 24 + 20) * 60 * 60 * 1000);

  // 1. Fetch unique timezone values currently in the DB
  const allTimezones = await db.orgDefaults.findMany({
    select: { timezone: true },
    distinct: ["timezone"],
  }).then(rows => rows.map(r => r.timezone).filter(Boolean));

  // 2. Identify timezones currently in quiet hours (23:00 to 07:00)
  const quietTimezones = allTimezones.filter(tz => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hourCycle: "h23",
      }).formatToParts(now);
      const hourVal = parts.find((p) => p.type === "hour")?.value;
      if (hourVal) {
        const hour = parseInt(hourVal, 10);
        return hour >= 23 || hour < 7;
      }
    } catch {}
    return false;
  });

  // 3. Build a query filter to exclude organizations in quiet timezones
  const utcIsQuiet = quietTimezones.includes("UTC");
  const timezoneFilter = utcIsQuiet
    ? {
        organization: {
          defaults: {
            timezone: { notIn: quietTimezones },
          },
        },
      }
    : {
        OR: [
          {
            organization: {
              defaults: null,
            },
          },
          {
            organization: {
              defaults: {
                timezone: { notIn: quietTimezones },
              },
            },
          },
        ],
      };

  // 4. Query candidates excluding quiet zones
  const candidates = await db.messagingNotificationPreference.findMany({
    where: {
      digestEnabled: true,
      OR: [
        { lastDigestSentAt: null },
        {
          AND: [
            { digestFrequency: "DAILY" },
            { lastDigestSentAt: { lte: twentyHoursAgo } },
          ],
        },
        {
          AND: [
            { digestFrequency: "WEEKLY" },
            { lastDigestSentAt: { lte: sixDaysTwentyHoursAgo } },
          ],
        },
      ],
      ...timezoneFilter,
    },
    take: limit,
  });

  let dispatched = 0;
  let skipped = 0;
  let failed = 0;
  const evaluated = candidates.length;

  if (evaluated === 0) {
    return { dispatched: 0, skipped: 0, failed: 0, evaluated: 0 };
  }

  const candidateOrgIds = [...new Set(candidates.map((c) => c.orgId))];
  const orgDefaults = await db.orgDefaults.findMany({
    where: { organizationId: { in: candidateOrgIds } },
    select: { organizationId: true, timezone: true },
  }).catch(() => []);
  const timezoneMap = new Map<string, string>(
    orgDefaults.map((od) => [od.organizationId, od.timezone])
  );

  for (const candidate of candidates) {
    try {
      const timezone = timezoneMap.get(candidate.orgId) || "UTC";

      let hour = now.getUTCHours();
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          hourCycle: "h23",
        }).formatToParts(now);
        const hourVal = parts.find((p) => p.type === "hour")?.value;
        if (hourVal) {
          hour = parseInt(hourVal, 10);
        }
      } catch {
        hour = now.getUTCHours();
      }

      if (hour >= 23 || hour < 7) {
        skipped++;
        continue;
      }

      const res = await dispatchDigestForUser({
        userId: candidate.userId,
        orgId: candidate.orgId,
      });

      if (res.dispatched) {
        dispatched++;
      } else if (res.skipped) {
        skipped++;
      }
    } catch (err) {
      console.error(
        `[digest-service] Failed to dispatch digest for user ${candidate.userId} in org ${candidate.orgId}:`,
        err,
      );
      failed++;
    }
  }

  return { dispatched, skipped, failed, evaluated };
}
