import { NextRequest } from "next/server";
import { requireMessagingApiContext, messagingApiResponse, handleMessagingApiError } from "../../_utils";
import { listCalendarConnections } from "@/lib/messaging/calendar-connection-service";

export const runtime = "nodejs";

/**
 * GET /api/messaging/calendar/connections
 * Lists all calendar connections in the active organization.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId } = await requireMessagingApiContext();
    const connections = await listCalendarConnections(orgId);
    return messagingApiResponse(connections);
  } catch (error) {
    console.error("[api/messaging/calendar/connections] GET failed:", error);
    return handleMessagingApiError(error);
  }
}
