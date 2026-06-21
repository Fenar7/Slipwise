import { NextRequest } from "next/server";
import { requireMessagingApiContext, messagingApiResponse, handleMessagingApiError } from "../../../_utils";
import { disconnectCalendar } from "@/lib/messaging/calendar-connection-service";

export const runtime = "nodejs";

/**
 * DELETE /api/messaging/calendar/connections/[id]
 * Disconnects an active calendar connection.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { provider: connectionId } = await params;

    const connection = await disconnectCalendar({
      orgId,
      connectionId,
      disconnectedBy: userId,
    });

    return messagingApiResponse(connection);
  } catch (error) {
    console.error("[api/messaging/calendar/connections/[id]] DELETE failed:", error);
    return handleMessagingApiError(error);
  }
}
