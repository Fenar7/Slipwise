import { NextRequest } from "next/server";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "@/app/api/messaging/_utils";
import {
  getMessagingPreferences,
  updateMessagingPreferences,
} from "@/lib/messaging/notification-service";

export async function GET(_req: NextRequest) {
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

    // Body validation
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "Invalid payload: body must be a JSON object",
        422
      );
    }

    const allowedKeys = [
      "allNotificationsEnabled",
      "mentionsEnabled",
      "repliesEnabled",
      "taskRemindersEnabled",
      "meetingRemindersEnabled",
      "dndEnabled",
      "dndStart",
      "dndEnd",
      "digestEnabled",
      "digestFrequency",
    ];

    const bodyKeys = Object.keys(body);
    for (const key of bodyKeys) {
      if (!allowedKeys.includes(key)) {
        return messagingApiError(
          "VALIDATION_ERROR",
          `Invalid key: '${key}' is not a permitted preference option`,
          422
        );
      }
    }

    const booleanKeys = [
      "allNotificationsEnabled",
      "mentionsEnabled",
      "repliesEnabled",
      "taskRemindersEnabled",
      "meetingRemindersEnabled",
      "dndEnabled",
      "digestEnabled",
    ];

    for (const key of booleanKeys) {
      if (key in body && typeof body[key] !== "boolean") {
        return messagingApiError(
          "VALIDATION_ERROR",
          `Invalid type: '${key}' must be a boolean`,
          422
        );
      }
    }

    const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24h format
    const stringKeys = ["dndStart", "dndEnd", "digestFrequency"];
    for (const key of stringKeys) {
      if (key in body) {
        if (typeof body[key] !== "string") {
          return messagingApiError(
            "VALIDATION_ERROR",
            `Invalid type: '${key}' must be a string`,
            422
          );
        }
        if (key === "digestFrequency" && body[key] !== "DAILY" && body[key] !== "WEEKLY") {
          return messagingApiError(
            "VALIDATION_ERROR",
            "Invalid value: 'digestFrequency' must be either 'DAILY' or 'WEEKLY'",
            422
          );
        }
        if ((key === "dndStart" || key === "dndEnd") && !timeRegex.test(body[key])) {
          return messagingApiError(
            "VALIDATION_ERROR",
            `Invalid format: '${key}' must be a string in HH:MM format (24-hour)`,
            422
          );
        }
      }
    }

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

export const POST = PUT;
