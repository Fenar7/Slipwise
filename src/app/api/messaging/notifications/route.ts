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
    const filter = (searchParams.get("filter") || "all") as "all" | "mentions" | "unread";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

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
