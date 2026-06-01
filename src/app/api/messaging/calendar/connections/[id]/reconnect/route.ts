import { NextRequest } from "next/server";
import { requireMessagingApiContext, messagingApiResponse, handleMessagingApiError, requireStringField } from "../../../../_utils";
import { reconnectCalendar } from "@/lib/messaging/calendar-connection-service";

export const runtime = "nodejs";

/**
 * POST /api/messaging/calendar/connections/[id]/reconnect
 * Reconnects or repairs an expired/revoked calendar connection.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: connectionId } = await params;
    const body = await request.json();

    const tokenRef = requireStringField(body.tokenRef, "tokenRef");
    const tokenExpiry = body.tokenExpiry ? new Date(body.tokenExpiry) : null;

    const connection = await reconnectCalendar({
      orgId,
      connectionId,
      tokenRef,
      tokenExpiry,
      reconnectedBy: userId,
    });

    return messagingApiResponse(connection);
  } catch (error) {
    console.error("[api/messaging/calendar/connections/[id]/reconnect] POST failed:", error);
    return handleMessagingApiError(error);
  }
}
