import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../_utils";
import {
  reconcileProviderChangesForMeeting,
  reconcileProviderChangesForTask,
} from "@/lib/messaging/provider-sync-service";
import { InvalidInputError, NotFoundError } from "@/lib/messaging";

export const runtime = "nodejs";

/**
 * POST /api/messaging/calendar/reconcile
 * 
 * Reconciles provider-side calendar event changes back to local Slipwise meetings or tasks.
 * 
 * Request payload:
 * {
 *   "meetingId": "string" (optional),
 *   "taskId": "string" (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const body = await request.json().catch(() => ({}));
    const { meetingId, taskId } = body;

    if (!meetingId && !taskId) {
      throw new InvalidInputError("Either meetingId or taskId must be provided");
    }

    if (meetingId) {
      const meeting = await db.conversationMeeting.findFirst({
        where: { id: meetingId, orgId },
      });

      if (!meeting) {
        throw new NotFoundError("Meeting not found");
      }

      // Check conversation membership to enforce security and prevent existence leakage
      const membership = await db.conversationParticipant.findFirst({
        where: {
          orgId,
          conversationId: meeting.conversationId,
          userId,
          leftAt: null,
        },
      });

      if (!membership) {
        throw new NotFoundError("Meeting not found");
      }

      const reconciled = await reconcileProviderChangesForMeeting(orgId, meetingId, userId);
      return messagingApiResponse({ type: "meeting", reconciled });
    }

    if (taskId) {
      const task = await db.messagingTask.findFirst({
        where: { id: taskId, orgId },
      });

      if (!task) {
        throw new NotFoundError("Task not found");
      }

      // Check conversation membership to enforce security and prevent existence leakage
      const membership = await db.conversationParticipant.findFirst({
        where: {
          orgId,
          conversationId: task.conversationId,
          userId,
          leftAt: null,
        },
      });

      if (!membership) {
        throw new NotFoundError("Task not found");
      }

      const reconciled = await reconcileProviderChangesForTask(orgId, taskId, userId);
      return messagingApiResponse({ type: "task", reconciled });
    }

    throw new InvalidInputError("Invalid request parameters");
  } catch (error) {
    console.error("[api/messaging/calendar/reconcile] POST failed:", error);
    return handleMessagingApiError(error);
  }
}
