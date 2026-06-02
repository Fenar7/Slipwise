import { NextRequest } from "next/server";
import { searchMessaging } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireNumberRange,
} from "../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/search
 * Search messaging entities (messages, conversations, tasks, meetings).
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q") || "";
    const rawKinds = searchParams.get("kinds");
    const limit = requireNumberRange(searchParams.get("limit"), "limit", 1, 100) ?? 20;
    const offset = requireNumberRange(searchParams.get("offset"), "offset", 0, 10000) ?? 0;
    const degraded = searchParams.get("degraded") === "true";

    let kinds: Array<"message" | "conversation" | "task" | "meeting" | "file"> | undefined;
    if (rawKinds) {
      kinds = rawKinds.split(",").filter((k): k is "message" | "conversation" | "task" | "meeting" | "file" =>
        ["message", "conversation", "task", "meeting", "file"].includes(k)
      );
    }

    const response = await searchMessaging(orgId, userId, {
      q,
      kinds,
      limit,
      offset,
      degraded,
    });

    return messagingApiResponse(response);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
