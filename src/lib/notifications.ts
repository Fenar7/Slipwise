import "server-only";

import { db } from "@/lib/db";
import { isModelMissingTableError } from "@/lib/prisma-errors";
import { queueEmailDelivery, recordInAppDelivery } from "@/lib/flow/delivery-engine";
import { buildNotificationEmailHtml } from "@/lib/flow/delivery-templates";

// ─── Notification Utility ─────────────────────────────────────────────────────

export interface CreateNotificationParams {
  userId: string;
  orgId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  // Sprint 18.2 delivery options (all optional — backward-compatible)
  emailRequested?: boolean;
  recipientEmail?: string;
  sourceModule?: string;
  sourceRef?: string;
  workflowRunId?: string;
  scheduledActionId?: string;
  dedupeKey?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    let isNew = true;
    let notification;

    if (params.dedupeKey) {
      const existing = await db.notification.findUnique({
        where: {
          // @ts-ignore
      orgId_userId_dedupeKey: {
            orgId: params.orgId,
            userId: params.userId,
            dedupeKey: params.dedupeKey,
          } as any,
        },
      });

      if (existing) {
        isNew = false;
        notification = existing;
      } else {
        try {
          notification = await db.notification.create({
            data: {
              userId: params.userId,
              orgId: params.orgId,
              type: params.type,
              title: params.title,
              body: params.body,
              link: params.link ?? null,
              emailRequested: params.emailRequested ?? false,
              recipientEmail: params.recipientEmail ?? null,
              sourceModule: params.sourceModule ?? null,
              sourceRef: params.sourceRef ?? null,
              dedupeKey: params.dedupeKey,
            },
          });
        } catch (error) {
          const prismaError = error as { code?: string };
          if (prismaError.code === "P2002") {
            isNew = false;
            notification = await db.notification.findUnique({
              where: {
                // @ts-ignore
      orgId_userId_dedupeKey: {
                  orgId: params.orgId,
                  userId: params.userId,
                  dedupeKey: params.dedupeKey,
                } as any,
              },
            });
            if (!notification) {
              throw new Error("createNotification: deduplication re-fetch returned null after P2002 — retry required");
            }
          } else {
            throw error;
          }
        }
      }
    } else {
      notification = await db.notification.create({
        data: {
          userId: params.userId,
          orgId: params.orgId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link ?? null,
          emailRequested: params.emailRequested ?? false,
          recipientEmail: params.recipientEmail ?? null,
          sourceModule: params.sourceModule ?? null,
          sourceRef: params.sourceRef ?? null,
        },
      });
    }

    if (!notification) {
      return null;
    }

    // Record in-app delivery for analytics (idempotent)
    if (isNew) {
      await recordInAppDelivery(notification.id, params.orgId, params.userId, {
        sourceModule: params.sourceModule,
        sourceRef: params.sourceRef,
      }).catch(() => {}); // never fail the notification itself
    }

    // Queue email delivery only if it's a newly created notification
    if (isNew && params.emailRequested && params.recipientEmail) {
      const subject = `[Slipwise] ${params.title}`;
      const html = buildNotificationEmailHtml({
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      });
      await queueEmailDelivery({
        notificationId: notification.id,
        orgId: params.orgId,
        recipientEmail: params.recipientEmail,
        subject,
        html,
        sourceModule: params.sourceModule,
        sourceRef: params.sourceRef,
        workflowRunId: params.workflowRunId,
        scheduledActionId: params.scheduledActionId,
      }).catch((err) => {
        // Log but don't fail notification creation
        console.error("[createNotification] Email delivery failed:", err);
      });
    }

    return notification;
  } catch (error) {
    if (isModelMissingTableError(error, "Notification")) {
      console.warn(
        "createNotification skipped: notification table missing during local/runtime schema drift",
      );
      return null;
    }
    throw error;
  }
}

export interface NotifyOrgAdminsParams {
  orgId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  excludeUserId?: string;
}

export interface NotifyUsersParams {
  orgId: string;
  userIds: string[];
  type: string;
  title: string;
  body: string;
  link?: string;
  excludeUserId?: string;
  sourceModule?: string;
  sourceRef?: string;
}

export async function notifyUsers(params: NotifyUsersParams) {
  const targetUserIds = [...new Set(params.userIds.filter(Boolean))].filter(
    (userId) => userId !== params.excludeUserId,
  );

  if (targetUserIds.length === 0) {
    return;
  }

  const members = await db.member.findMany({
    where: {
      organizationId: params.orgId,
      userId: { in: targetUserIds },
    },
    include: { user: { select: { email: true } } },
  });

  if (members.length === 0) {
    return;
  }

  try {
    await Promise.all(
      members.map((member) =>
        createNotification({
          userId: member.userId,
          orgId: params.orgId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link,
          emailRequested: Boolean(member.user.email),
          recipientEmail: member.user.email ?? undefined,
          sourceModule: params.sourceModule,
          sourceRef: params.sourceRef,
        }),
      ),
    );
  } catch (error) {
    if (isModelMissingTableError(error, "Notification")) {
      console.warn(
        "notifyUsers skipped: notification table missing during local/runtime schema drift",
      );
      return;
    }
    throw error;
  }
}

export async function notifyOrgAdmins(params: NotifyOrgAdminsParams) {
  const admins = await db.member.findMany({
    where: {
      organizationId: params.orgId,
      role: { in: ["admin", "owner"] },
      ...(params.excludeUserId ? { userId: { not: params.excludeUserId } } : {}),
    },
    include: { user: { select: { email: true } } },
  });

  if (admins.length === 0) return;

  try {
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.userId,
          orgId: params.orgId,
          type: params.type,
          title: params.title,
          body: params.body,
          link: params.link ?? undefined,
          emailRequested: Boolean(admin.user.email),
          recipientEmail: admin.user.email ?? undefined,
          sourceModule: "flow",
          sourceRef: params.type,
        })
      )
    );
  } catch (error) {
    if (isModelMissingTableError(error, "Notification")) {
      console.warn(
        "notifyOrgAdmins skipped: notification table missing during local/runtime schema drift",
      );
      return;
    }
    throw error;
  }
}
