import { NextRequest } from "next/server";
import { getUnifiedCalendar } from "@/lib/messaging/read-models";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
} from "../_utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { searchParams } = new URL(request.url);

    const startAtParam = searchParams.get("startAt");
    const endAtParam = searchParams.get("endAt");

    const startAt = startAtParam ? new Date(startAtParam) : undefined;
    const endAt = endAtParam ? new Date(endAtParam) : undefined;

    if (startAt && isNaN(startAt.getTime())) {
      throw new Error("InvalidInputError: startAt must be a valid date string");
    }
    if (endAt && isNaN(endAt.getTime())) {
      throw new Error("InvalidInputError: endAt must be a valid date string");
    }

    const calendar = await safeRead(
      getUnifiedCalendar(orgId, userId, startAt, endAt)
    );

    return messagingApiResponse(calendar);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
