import { NextRequest } from "next/server";
import { requireMessagingApiContext, messagingApiResponse, handleMessagingApiError } from "../../_utils";
import { listCalendarConnections } from "@/lib/messaging/calendar-connection-service";
import { toCalendarConnectionSummary } from "@/lib/messaging/mappers";

export const runtime = "nodejs";

/**
 * GET /api/messaging/calendar/connections
 *
 * Lists all calendar connections in the active organization.
 *
 * Security contract: raw CalendarConnectionRecord objects are NEVER sent to the
 * client. Only CalendarConnectionSummary — which omits tokenRef, tokenExpiry,
 * providerAccountId, connectedBy, and orgId — is serialized into the response.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, role } = await requireMessagingApiContext();
    const records = await listCalendarConnections(orgId);
    // Project to safe UI shape — strips all sensitive / provider-internal fields
    const connections = records.map(toCalendarConnectionSummary);
    return messagingApiResponse({ connections, callerRole: role });
  } catch (error) {
    console.error("[api/messaging/calendar/connections] GET failed:", error);
    return handleMessagingApiError(error);
  }
}
