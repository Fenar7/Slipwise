import { NextRequest } from "next/server";
import { listMeetingsForConversation, scheduleMeeting } from "@/lib/messaging/meeting-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  requireStringField,
  requireNumberRange,
  requireValidDate,
} from "../../../_utils";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const meetings = await safeRead(
      listMeetingsForConversation(orgId, id, userId)
    );
    return messagingApiResponse(meetings);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = await request.json();

    const title = requireStringField(body.title, "Meeting title");
    const scheduledAt = requireValidDate(body.scheduledAt, "Scheduled time");
    const durationMinutes = requireNumberRange(body.durationMinutes ?? 30, "Duration", 1, 1440) ?? 30;

    if (!scheduledAt) {
      throw new Error("InvalidInputError: Meeting scheduled time is required");
    }

    const meeting = await scheduleMeeting({
      orgId,
      conversationId: id,
      title,
      description: body.description ?? null,
      scheduledAt,
      durationMinutes,
      scheduledBy: userId,
    });

    return messagingApiResponse(meeting, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
