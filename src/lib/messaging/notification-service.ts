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
};

// ─── Preference Services ─────────────────────────────────────────────────────

/**
 * Helper to check if a user is currently within quiet hours (DND).
 * Handles overnight time windows correctly (e.g. 22:00 to 08:00).
 */
export function isCurrentlyInQuietHours(pref: { dndEnabled: boolean; dndStart: string; dndEnd: string }): boolean {
  if (!pref.dndEnabled) return false;

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
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
    },
    update: {
      ...params.preferences,
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

  const where: any = {
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
export async function processNotificationEvents(orgId: string, conversationId: string): Promise<void> {
  const checkpoint = await getConsumptionCheckpoint(db, {
    consumerType: "notification",
    orgId,
    conversationId,
  });

  const startCursor = checkpoint ? checkpoint.cursor : undefined;

  const result = await consumeDownstreamEvents(db, {
    consumerType: "notification",
    orgId,
    conversationId,
    afterCursor: startCursor,
    eventTypes: ["conversation.message.created", "conversation.thread.replied"],
  });

  for (const event of result.events) {
    const payload = buildNotificationPayload(event);
    if (!payload || !payload.messageId) continue;

    // Fetch the message and its conversation title
    const message = await db.conversationMessage.findUnique({
      where: { id: payload.messageId },
      include: {
        conversation: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!message || message.deletedAt) continue;

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

      for (const recipientId of activeMentionUserIds) {
        const pref = await getMessagingPreferences({ userId: recipientId, orgId });
        if (pref.allNotificationsEnabled && pref.mentionsEnabled && !isCurrentlyInQuietHours(pref)) {
          // Resolve recipient email
          const recipientProfile = await db.profile.findUnique({
            where: { id: recipientId },
            select: { email: true },
          });

          await createNotification({
            userId: recipientId,
            orgId,
            type: "MENTION",
            title: `New mention in ${message.conversation.title || "conversation"}`,
            body: `${actorName}: ${snippet}`,
            link,
            emailRequested: Boolean(recipientProfile?.email),
            recipientEmail: recipientProfile?.email ?? undefined,
            sourceModule: "messaging",
            sourceRef: message.id,
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

          for (const recipientId of activeReplyUserIds) {
            const pref = await getMessagingPreferences({ userId: recipientId, orgId });
            const readState = await db.conversationReadState.findFirst({
              where: {
                conversationId: payload.conversationId,
                userId: recipientId,
              },
              select: { isMuted: true },
            });
            const isMuted = readState?.isMuted ?? false;

            if (
              pref.allNotificationsEnabled &&
              pref.repliesEnabled &&
              !isMuted &&
              !isCurrentlyInQuietHours(pref)
            ) {
              const recipientProfile = await db.profile.findUnique({
                where: { id: recipientId },
                select: { email: true },
              });

              await createNotification({
                userId: recipientId,
                orgId,
                type: "REPLY",
                title: `New reply in ${message.conversation.title || "conversation"}`,
                body: `${actorName}: ${snippet}`,
                link,
                emailRequested: Boolean(recipientProfile?.email),
                recipientEmail: recipientProfile?.email ?? undefined,
                sourceModule: "messaging",
                sourceRef: message.id,
              });
            }
          }
        }
      }
    }
  }

  // Record checkpoint up to nextCursor
  if (result.nextCursor !== undefined) {
    await recordConsumptionCheckpoint(db, {
      consumerType: "notification",
      orgId,
      conversationId,
      cursor: result.nextCursor,
    });
  }

  // Recurse to catch up if needed
  if (result.hasMore) {
    await processNotificationEvents(orgId, conversationId);
  }
}
