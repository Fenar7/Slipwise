import "server-only";

import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  consumeDownstreamEvents,
  recordConsumptionCheckpoint,
  getConsumptionCheckpoint,
  buildNotificationPayload,
} from "./realtime/downstream-seam";

// ─── Types and Interfaces ───────────────────────────────────────────────────

export interface MessagingPreferences {
  allNotificationsEnabled: boolean;
  mentionsEnabled: boolean;
  repliesEnabled: boolean;
  taskRemindersEnabled: boolean;
  meetingRemindersEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  digestEnabled: boolean;
  digestFrequency: string;
}

export const DEFAULT_PREFERENCES: MessagingPreferences = {
  allNotificationsEnabled: true,
  mentionsEnabled: true,
  repliesEnabled: true,
  taskRemindersEnabled: true,
  meetingRemindersEnabled: true,
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "08:00",
  digestEnabled: false,
  digestFrequency: "DAILY",
};

// ─── Preference Services ─────────────────────────────────────────────────────

/**
 * Helper to check if a user is currently within quiet hours (DND).
 * Handles overnight time windows correctly (e.g. 22:00 to 08:00).
 */
export function isCurrentlyInQuietHours(
  pref: { dndEnabled: boolean; dndStart: string; dndEnd: string },
  timezone?: string
): boolean {
  if (!pref.dndEnabled) return false;

  const now = new Date();
  let hours: number;
  let minutes: number;

  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(now);
      hours = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
      minutes = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    } catch {
      // Unknown timezone — fall back to UTC
      hours = now.getUTCHours();
      minutes = now.getUTCMinutes();
    }
  } else {
    hours = now.getUTCHours();
    minutes = now.getUTCMinutes();
  }

  const currentMinutes = hours * 60 + minutes;

  const [startH, startM] = pref.dndStart.split(":").map(Number);
  const [endH, endM] = pref.dndEnd.split(":").map(Number);
  const startMinutes = (startH ?? 22) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 8) * 60 + (endM ?? 0);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Fetch messaging notification preferences for a user in an organization.
 * Falls back to default settings if no preferences row exists.
 */
export async function getMessagingPreferences(params: {
  userId: string;
  orgId: string;
}): Promise<MessagingPreferences> {
  const row = await db.messagingNotificationPreference.findUnique({
    where: {
      orgId_userId: {
        orgId: params.orgId,
        userId: params.userId,
      },
    },
  });

  if (!row) {
    return DEFAULT_PREFERENCES;
  }

  return {
    allNotificationsEnabled: row.allNotificationsEnabled,
    mentionsEnabled: row.mentionsEnabled,
    repliesEnabled: row.repliesEnabled,
    taskRemindersEnabled: row.taskRemindersEnabled,
    meetingRemindersEnabled: row.meetingRemindersEnabled,
    dndEnabled: row.dndEnabled,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    digestEnabled: row.digestEnabled,
    digestFrequency: row.digestFrequency,
  };
}

/**
 * Upsert messaging preferences for a user in an organization.
 */
export async function updateMessagingPreferences(params: {
  userId: string;
  orgId: string;
  preferences: Partial<MessagingPreferences>;
}): Promise<MessagingPreferences> {
  const row = await db.messagingNotificationPreference.upsert({
    where: {
      orgId_userId: {
        orgId: params.orgId,
        userId: params.userId,
      },
    },
    create: {
      orgId: params.orgId,
      userId: params.userId,
      allNotificationsEnabled: params.preferences.allNotificationsEnabled ?? DEFAULT_PREFERENCES.allNotificationsEnabled,
      mentionsEnabled: params.preferences.mentionsEnabled ?? DEFAULT_PREFERENCES.mentionsEnabled,
      repliesEnabled: params.preferences.repliesEnabled ?? DEFAULT_PREFERENCES.repliesEnabled,
      taskRemindersEnabled: params.preferences.taskRemindersEnabled ?? DEFAULT_PREFERENCES.taskRemindersEnabled,
      meetingRemindersEnabled: params.preferences.meetingRemindersEnabled ?? DEFAULT_PREFERENCES.meetingRemindersEnabled,
      dndEnabled: params.preferences.dndEnabled ?? DEFAULT_PREFERENCES.dndEnabled,
      dndStart: params.preferences.dndStart ?? DEFAULT_PREFERENCES.dndStart,
      dndEnd: params.preferences.dndEnd ?? DEFAULT_PREFERENCES.dndEnd,
      digestEnabled: params.preferences.digestEnabled ?? DEFAULT_PREFERENCES.digestEnabled,
      digestFrequency: params.preferences.digestFrequency ?? DEFAULT_PREFERENCES.digestFrequency,
    },
    update: {
      ...(params.preferences.allNotificationsEnabled !== undefined && { allNotificationsEnabled: params.preferences.allNotificationsEnabled }),
      ...(params.preferences.mentionsEnabled !== undefined && { mentionsEnabled: params.preferences.mentionsEnabled }),
      ...(params.preferences.repliesEnabled !== undefined && { repliesEnabled: params.preferences.repliesEnabled }),
      ...(params.preferences.taskRemindersEnabled !== undefined && { taskRemindersEnabled: params.preferences.taskRemindersEnabled }),
      ...(params.preferences.meetingRemindersEnabled !== undefined && { meetingRemindersEnabled: params.preferences.meetingRemindersEnabled }),
      ...(params.preferences.dndEnabled !== undefined && { dndEnabled: params.preferences.dndEnabled }),
      ...(params.preferences.dndStart !== undefined && { dndStart: params.preferences.dndStart }),
      ...(params.preferences.dndEnd !== undefined && { dndEnd: params.preferences.dndEnd }),
      ...(params.preferences.digestEnabled !== undefined && { digestEnabled: params.preferences.digestEnabled }),
      ...(params.preferences.digestFrequency !== undefined && { digestFrequency: params.preferences.digestFrequency }),
      updatedAt: new Date(),
    },
  });

  return {
    allNotificationsEnabled: row.allNotificationsEnabled,
    mentionsEnabled: row.mentionsEnabled,
    repliesEnabled: row.repliesEnabled,
    taskRemindersEnabled: row.taskRemindersEnabled,
    meetingRemindersEnabled: row.meetingRemindersEnabled,
    dndEnabled: row.dndEnabled,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    digestEnabled: row.digestEnabled,
    digestFrequency: row.digestFrequency,
  };
}

/**
 * Set the mute state of a conversation for a participant.
 * Exposes a real toggle backed by `ConversationReadState.isMuted`.
 * Fails closed if the user is not an active participant.
 */
export async function toggleConversationMute(params: {
  userId: string;
  orgId: string;
  conversationId: string;
  isMuted: boolean;
}): Promise<{ isMuted: boolean }> {
  // Ensure the user is an active participant in the conversation
  const participant = await db.conversationParticipant.findFirst({
    where: {
      orgId: params.orgId,
      conversationId: params.conversationId,
      userId: params.userId,
      leftAt: null,
    },
  });

  if (!participant) {
    throw new Error("Mute toggle failed: user is not an active participant in this conversation");
  }

  await db.conversationReadState.upsert({
    where: {
      conversationId_userId: {
        conversationId: params.conversationId,
        userId: params.userId,
      },
    },
    create: {
      orgId: params.orgId,
      conversationId: params.conversationId,
      userId: params.userId,
      isMuted: params.isMuted,
    },
    update: {
      isMuted: params.isMuted,
      updatedAt: new Date(),
    },
  });

  return { isMuted: params.isMuted };
}

// ─── Notification Operations ─────────────────────────────────────────────────

/**
 * List the current user's messaging notifications in the current organization.
 */
export async function getMessagingNotifications(params: {
  userId: string;
  orgId: string;
  filter?: "all" | "mentions" | "unread";
  limit?: number;
  offset?: number;
}) {
  const { userId, orgId, filter = "all", limit = 50, offset = 0 } = params;

  const where: {
    userId: string;
    orgId: string;
    sourceModule: string;
    type?: string;
    isRead?: boolean;
  } = {
    userId,
    orgId,
    sourceModule: "messaging",
  };

  if (filter === "mentions") {
    where.type = "MENTION";
  } else if (filter === "unread") {
    where.isRead = false;
  }

  const [notifications, totalCount, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    db.notification.count({ where }),
    db.notification.count({
      where: {
        userId,
        orgId,
        sourceModule: "messaging",
        isRead: false,
      },
    }),
  ]);

  return {
    notifications,
    totalCount,
    unreadCount,
  };
}

/**
 * Mark a single messaging notification as read or unread.
 * Enforces ownership boundary via where clause.
 */
export async function markNotificationRead(params: {
  userId: string;
  orgId: string;
  notificationId: string;
  isRead: boolean;
}): Promise<boolean> {
  const result = await db.notification.updateMany({
    where: {
      id: params.notificationId,
      userId: params.userId,
      orgId: params.orgId,
      sourceModule: "messaging",
    },
    data: {
      isRead: params.isRead,
    },
  });

  return result.count > 0;
}

/**
 * Mark all visible/owned messaging notifications as read.
 */
export async function markAllNotificationsRead(params: {
  userId: string;
  orgId: string;
}): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      userId: params.userId,
      orgId: params.orgId,
      sourceModule: "messaging",
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return result.count;
}

// ─── Durable Event Routing Worker ───────────────────────────────────────────

/**
 * Process new messaging events and route them to notifications (idempotent & retry-safe).
 */
export async function processNotificationEvents(
  orgId: string,
  conversationId: string,
  maxBatchesParam?: number
): Promise<void> {
  const orgDefault = await db.orgDefaults.findUnique({
    where: { organizationId: orgId },
    select: { timezone: true },
  }).catch(() => null);
  const timezone = orgDefault?.timezone || "UTC";

  const checkpoint = await getConsumptionCheckpoint(db, {
    consumerType: "notification",
    orgId,
    conversationId,
  });

  let currentCursor = checkpoint ? checkpoint.cursor : undefined;
  let batchCount = 0;
  const maxBatches = maxBatchesParam ?? 10;
  let hasMore = true;

  while (hasMore && batchCount < maxBatches) {
    const result = await consumeDownstreamEvents(db, {
      consumerType: "notification",
      orgId,
      conversationId,
      afterCursor: currentCursor,
      eventTypes: ["conversation.message.created", "conversation.thread.replied"],
    });

    // Track the highest cursor that was successfully processed.
    // We never advance the checkpoint past a failed event, so failed
    // events remain retryable on the next invocation.
    let lastSuccessfulCursor: bigint | undefined;

    for (const event of result.events) {
      try {
        const payload = buildNotificationPayload(event);
        if (!payload || !payload.messageId) {
          // Event has no actionable payload — treat as successfully consumed
          // (nothing to retry for a missing messageId).
          lastSuccessfulCursor = event.cursor;
          continue;
        }

        // Fetch the message and its conversation name
        const message = await db.conversationMessage.findUnique({
          where: { id: payload.messageId },
          select: {
            id: true,
            body: true,
            deletedAt: true,
            conversationId: true,
            conversation: {
              select: { name: true },
            },
          },
        });

        if (!message || message.deletedAt) {
          // Deleted message — nothing to notify, treat as consumed.
          lastSuccessfulCursor = event.cursor;
          continue;
        }

        const actorProfile = await db.profile.findUnique({
          where: { id: payload.actorId },
          select: { name: true },
        });
        const actorName = actorProfile?.name || "Someone";
        const snippet = message.body.length > 120 ? message.body.slice(0, 120) + "..." : message.body;

        const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app"}/app/messaging/conversations/${payload.conversationId}`;

        // A. Handle Mention Notifications
        const mentionedUserIds = payload.mentionIds || [];
        const validMentions = mentionedUserIds.filter((id) => id !== payload.actorId);
        const uniqueMentions = [...new Set(validMentions)];

        let notifiedMentionIds: string[] = [];

        if (uniqueMentions.length > 0) {
          // Filter active conversation participants only
          const activeMentions = await db.conversationParticipant.findMany({
            where: {
              orgId,
              conversationId: payload.conversationId,
              userId: { in: uniqueMentions },
              leftAt: null,
            },
            select: { userId: true },
          });

          const activeMentionUserIds = activeMentions.map((p) => p.userId);
          notifiedMentionIds = activeMentionUserIds;

          // Batch fetch profiles and preferences for mentions
          const profiles = await db.profile.findMany({
            where: { id: { in: activeMentionUserIds } },
            select: { id: true, email: true },
          });
          const profileMap = new Map<string, string | null>(
            profiles.map((p) => [p.id, p.email])
          );

          const prefs = await db.messagingNotificationPreference.findMany({
            where: { orgId, userId: { in: activeMentionUserIds } },
          });
          const prefMap = new Map<string, MessagingPreferences>(
            prefs.map((p) => [p.userId, p])
          );

          for (const recipientId of activeMentionUserIds) {
            const pref = prefMap.get(recipientId) || DEFAULT_PREFERENCES;
            if (pref.allNotificationsEnabled && pref.mentionsEnabled) {
              const email = profileMap.get(recipientId) || null;
              const inQuietHours = isCurrentlyInQuietHours(pref, timezone);

              await createNotification({
                userId: recipientId,
                orgId,
                type: "MENTION",
                title: `New mention in ${message.conversation.name || "conversation"}`,
                body: `${actorName}: ${snippet}`,
                link,
                emailRequested: !inQuietHours && Boolean(email),
                recipientEmail: !inQuietHours ? (email ?? undefined) : undefined,
                sourceModule: "messaging",
                sourceRef: message.id,
                dedupeKey: `mention:${message.id}`,
              });
            }
          }
        }

        // B. Handle Reply Notifications (for thread.replied event type)
        if (event.eventType === "conversation.thread.replied" && payload.threadId) {
          const thread = await db.conversationThread.findUnique({
            where: { id: payload.threadId, orgId },
            include: {
              anchorMessage: {
                select: { authorId: true },
              },
            },
          });

          if (thread) {
            // Query distinct prior thread authors
            const priorMessages = await db.conversationMessage.findMany({
              where: {
                orgId,
                conversationId: payload.conversationId,
                threadId: payload.threadId,
              },
              select: { authorId: true },
            });

            const potentialReplyRecipients = [
              thread.anchorMessage.authorId,
              ...priorMessages.map((m) => m.authorId),
            ];

            // Exclude actor and those who already received mention notifications for this message
            const replyRecipients = potentialReplyRecipients.filter(
              (id) => id !== payload.actorId && !notifiedMentionIds.includes(id),
            );
            const uniqueReplyRecipients = [...new Set(replyRecipients)];

            if (uniqueReplyRecipients.length > 0) {
              // Verify active participant status
              const activeParticipants = await db.conversationParticipant.findMany({
                where: {
                  orgId,
                  conversationId: payload.conversationId,
                  userId: { in: uniqueReplyRecipients },
                  leftAt: null,
                },
                select: { userId: true },
              });

              const activeReplyUserIds = activeParticipants.map((p) => p.userId);

              // Batch fetch profiles, preferences, and mute states for replies
              const replyProfiles = await db.profile.findMany({
                where: { id: { in: activeReplyUserIds } },
                select: { id: true, email: true },
              });
              const replyProfileMap = new Map<string, string | null>(
                replyProfiles.map((p) => [p.id, p.email])
              );

              const replyPrefs = await db.messagingNotificationPreference.findMany({
                where: { orgId, userId: { in: activeReplyUserIds } },
              });
              const replyPrefMap = new Map<string, MessagingPreferences>(
                replyPrefs.map((p) => [p.userId, p])
              );

              const readStates = await db.conversationReadState.findMany({
                where: {
                  conversationId: payload.conversationId,
                  userId: { in: activeReplyUserIds },
                },
                select: { userId: true, isMuted: true },
              });
              const readStateMap = new Map<string, boolean>(
                readStates.map((rs) => [rs.userId, rs.isMuted])
              );

              for (const recipientId of activeReplyUserIds) {
                const pref = replyPrefMap.get(recipientId) || DEFAULT_PREFERENCES;
                const isMuted = readStateMap.get(recipientId) ?? false;

                if (
                  pref.allNotificationsEnabled &&
                  pref.repliesEnabled &&
                  !isMuted
                ) {
                  const email = replyProfileMap.get(recipientId) || null;
                  const inQuietHours = isCurrentlyInQuietHours(pref, timezone);

                  await createNotification({
                    userId: recipientId,
                    orgId,
                    type: "REPLY",
                    title: `New reply in ${message.conversation.name || "conversation"}`,
                    body: `${actorName}: ${snippet}`,
                    link,
                    emailRequested: !inQuietHours && Boolean(email),
                    recipientEmail: !inQuietHours ? (email ?? undefined) : undefined,
                    sourceModule: "messaging",
                    sourceRef: message.id,
                    dedupeKey: `reply:${message.id}`,
                  });
                }
              }
            }
          }
        }

        // Event fully processed — mark cursor as safe to advance past.
        lastSuccessfulCursor = event.cursor;
      } catch (eventError) {
        // Per-event error handling: log and continue processing remaining events.
        // The checkpoint will NOT advance past this event's cursor, so it
        // remains retryable on the next invocation.
        console.error(
          `[notification-service] Failed to process event ${event.eventId} (cursor ${event.cursor}):`,
          eventError,
        );
      }
    }

    // Only advance the checkpoint to the last successfully processed cursor.
    // This ensures failed events remain retryable and no notifications are lost.
    if (lastSuccessfulCursor !== undefined) {
      await recordConsumptionCheckpoint(db, {
        consumerType: "notification",
        orgId,
        conversationId,
        cursor: lastSuccessfulCursor,
      });
      currentCursor = lastSuccessfulCursor;
    }

    hasMore = result.hasMore;
    batchCount++;
  }
}
