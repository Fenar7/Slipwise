import { NextRequest } from "next/server";
import { updateMeeting, cancelMeeting } from "@/lib/messaging/meeting-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireStringField,
  requireNumberRange,
  requireValidDate,
  MessagingApiError,
  MessagingApiErrorCode,
} from "../../../../_utils";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; meetingId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: conversationId, meetingId } = await params;
    const body = await request.json();

    if (
      body.title === undefined &&
      body.description === undefined &&
      body.scheduledAt === undefined &&
      body.durationMinutes === undefined
    ) {
      throw new MessagingApiError(
        MessagingApiErrorCode.VALIDATION_ERROR,
        "At least one editable field must be provided.",
        422,
      );
    }

    let title: string | undefined = undefined;
    if (body.title !== undefined) {
      title = requireStringField(body.title, "Meeting title", 256);
    }

    let description: string | null | undefined = undefined;
    if (body.description !== undefined) {
      if (body.description === null || body.description === "") {
        description = null;
      } else {
        description = requireStringField(body.description, "Description", 1000);
      }
    }

    let scheduledAt: Date | undefined = undefined;
    if (body.scheduledAt !== undefined) {
      scheduledAt = requireValidDate(body.scheduledAt, "Scheduled time");
    }

    let durationMinutes: number | undefined = undefined;
    if (body.durationMinutes !== undefined) {
      durationMinutes = requireNumberRange(body.durationMinutes, "Duration", 1, 1440);
    }

    const updated = await updateMeeting({
      orgId,
      conversationId,
      meetingId,
      title,
      description,
      scheduledAt,
      durationMinutes,
      updatedBy: userId,
    });

    return messagingApiResponse(updated);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; meetingId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: conversationId, meetingId } = await params;
    
    let cancelReason: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.cancelReason === "string") {
        cancelReason = body.cancelReason.trim();
      }
    } catch {
      // Body might be empty, which is completely fine for DELETE
    }

    const cancelled = await cancelMeeting({
      orgId,
      conversationId,
      meetingId,
      cancelledBy: userId,
      cancelReason,
    });

    return messagingApiResponse(cancelled);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
