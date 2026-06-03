import { NextRequest } from "next/server";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "@/app/api/messaging/_utils";
import {
  getMessagingPreferences,
  updateMessagingPreferences,
} from "@/lib/messaging/notification-service";

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await requireMessagingApiContext();
    const preferences = await getMessagingPreferences({ userId, orgId });
    return messagingApiResponse(preferences);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, orgId } = await requireMessagingApiContext();
    const body = await req.json();

    const updated = await updateMessagingPreferences({
      userId,
      orgId,
      preferences: body,
    });

    return messagingApiResponse(updated);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
