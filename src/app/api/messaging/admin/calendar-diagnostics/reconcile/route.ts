import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
  MessagingApiError,
  MessagingApiErrorCode,
} from "@/app/api/messaging/_utils";
import {
  syncMeetingToProvider,
  syncTaskToProvider,
  reconcileProviderChangesForMeeting,
  reconcileProviderChangesForTask,
} from "@/lib/messaging/provider-sync-service";
import { InvalidInputError, NotFoundError } from "@/lib/messaging/errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();

    // 1. Gating & Permissions: Enforce org admin or owner role
    if (!hasRole(role, "admin")) {
      throw new MessagingApiError(
        MessagingApiErrorCode.FORBIDDEN,
        "Forbidden",
        403,
      );
    }

    const body = await request.json().catch(() => ({}));
    const { meetingId, taskId, action } = body;

    if (!action || (action !== "retry" && action !== "reconcile")) {
      throw new InvalidInputError("Action must be 'retry' or 'reconcile'");
    }

    if (!meetingId && !taskId) {
      throw new InvalidInputError("Either meetingId or taskId must be provided");
    }

    if (meetingId && taskId) {
      throw new InvalidInputError("Ambiguous request: cannot provide both meetingId and taskId at once");
    }

    let conversationId: string | null = null;

    if (meetingId) {
      const meeting = await db.conversationMeeting.findFirst({
        where: { id: meetingId, orgId },
      });

      if (!meeting) {
        throw new NotFoundError("Meeting not found");
      }

      conversationId = meeting.conversationId;

      if (action === "retry") {
        const result = await syncMeetingToProvider(orgId, meetingId);
        
        // Log support audit event
        await db.messagingAuditEvent.create({
          data: {
            orgId,
            actorId: userId,
            action: "ADMIN_SUPPORT_ACTION",
            summary: `Support retry calendar sync for meeting: ${meeting.title}`,
            conversationId,
            meetingId,
          },
        });

        return NextResponse.json({ success: true, result });
      } else {
        const result = await reconcileProviderChangesForMeeting(orgId, meetingId, userId);
        
        // Log support audit event
        await db.messagingAuditEvent.create({
          data: {
            orgId,
            actorId: userId,
            action: "ADMIN_SUPPORT_ACTION",
            summary: `Support reconciled provider calendar for meeting: ${meeting.title}`,
            conversationId,
            meetingId,
          },
        });

        return NextResponse.json({ success: true, result });
      }
    }

    if (taskId) {
      const task = await db.messagingTask.findFirst({
        where: { id: taskId, orgId },
      });

      if (!task) {
        throw new NotFoundError("Task not found");
      }

      conversationId = task.conversationId;

      if (action === "retry") {
        const result = await syncTaskToProvider(orgId, taskId);

        // Log support audit event
        await db.messagingAuditEvent.create({
          data: {
            orgId,
            actorId: userId,
            action: "ADMIN_SUPPORT_ACTION",
            summary: `Support retry calendar sync for task: ${task.title}`,
            conversationId,
            taskId,
          },
        });

        return NextResponse.json({ success: true, result });
      } else {
        const result = await reconcileProviderChangesForTask(orgId, taskId, userId);

        // Log support audit event
        await db.messagingAuditEvent.create({
          data: {
            orgId,
            actorId: userId,
            action: "ADMIN_SUPPORT_ACTION",
            summary: `Support reconciled provider calendar for task: ${task.title}`,
            conversationId,
            taskId,
          },
        });

        return NextResponse.json({ success: true, result });
      }
    }

    throw new InvalidInputError("Invalid request parameters");
  } catch (error) {
    console.error("[api/messaging/admin/calendar-diagnostics/reconcile] POST failed:", error);
    return handleMessagingApiError(error);
  }
}
