import { NextRequest } from "next/server";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "@/app/api/messaging/_utils";
import {
  getMessagingNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/messaging/notification-service";

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await requireMessagingApiContext();
    const searchParams = req.nextUrl.searchParams;

    const rawFilter = searchParams.get("filter");
    if (rawFilter !== null && rawFilter !== "all" && rawFilter !== "mentions" && rawFilter !== "unread") {
      return messagingApiError(
        "VALIDATION_ERROR",
        "Invalid filter. Allowed values: all, mentions, unread",
        422
      );
    }
    const filter = (rawFilter || "all") as "all" | "mentions" | "unread";

    const rawLimit = searchParams.get("limit");
    let limit = 50;
    if (rawLimit !== null) {
      if (!/^\d+$/.test(rawLimit)) {
        return messagingApiError("VALIDATION_ERROR", "Limit must be a valid positive integer", 422);
      }
      const val = parseInt(rawLimit, 10);
      if (isNaN(val) || val <= 0 || val > 100) {
        return messagingApiError("VALIDATION_ERROR", "Limit must be between 1 and 100", 422);
      }
      limit = val;
    }

    const rawOffset = searchParams.get("offset");
    let offset = 0;
    if (rawOffset !== null) {
      if (!/^\d+$/.test(rawOffset)) {
        return messagingApiError("VALIDATION_ERROR", "Offset must be a valid non-negative integer", 422);
      }
      const val = parseInt(rawOffset, 10);
      if (isNaN(val) || val < 0 || val > 10000) {
        return messagingApiError("VALIDATION_ERROR", "Offset must be a non-negative integer below 10000", 422);
      }
      offset = val;
    }

    const result = await getMessagingNotifications({
      userId,
      orgId,
      filter,
      limit,
      offset,
    });

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await requireMessagingApiContext();
    const body = await req.json();

    if (body.markAllRead) {
      const count = await markAllNotificationsRead({ userId, orgId });
      return messagingApiResponse({ count });
    }

    const { notificationId, isRead } = body;
    if (typeof notificationId !== "string" || typeof isRead !== "boolean") {
      return messagingApiError(
        "VALIDATION_ERROR",
        "Invalid payload: notificationId (string) and isRead (boolean) are required",
        422,
      );
    }

    const success = await markNotificationRead({
      userId,
      orgId,
      notificationId,
      isRead,
    });

    if (!success) {
      return messagingApiError("NOT_FOUND", "Notification not found or access denied.", 404);
    }

    return messagingApiResponse({ success: true });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
