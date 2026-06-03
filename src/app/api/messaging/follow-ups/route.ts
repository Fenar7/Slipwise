import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listFollowUps, flagMessageForFollowUp } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "../_utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireMessagingApiContext();
    const { searchParams } = new URL(request.url);

    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "orgId query parameter is required",
        422
      );
    }

    // Validate org membership
    const member = await db.member.findFirst({
      where: {
        organizationId: orgId,
        userId: userId,
      },
    });

    if (!member) {
      return messagingApiError(
        "FORBIDDEN",
        "Access denied: user is not a member of this organization",
        403
      );
    }

    const filterParam = searchParams.get("filter") || "all";
    if (filterParam !== "pending" && filterParam !== "resolved" && filterParam !== "all") {
      return messagingApiError(
        "VALIDATION_ERROR",
        "filter query parameter must be pending, resolved, or all",
        422
      );
    }
    const filter = filterParam as "pending" | "resolved" | "all";

    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? parseInt(rawLimit, 10) : undefined;
    const cursor = searchParams.get("cursor") || undefined;

    const result = await listFollowUps({
      orgId,
      userId,
      filter,
      limit,
      cursor,
    });

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireMessagingApiContext();

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return messagingApiError(
        "VALIDATION_ERROR",
        "Body must be a JSON object",
        422
      );
    }

    const { orgId, messageId, conversationId, note } = body;
    if (typeof orgId !== "string" || !orgId) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "orgId is required and must be a string",
        422
      );
    }
    if (typeof messageId !== "string" || !messageId) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "messageId is required and must be a string",
        422
      );
    }
    if (typeof conversationId !== "string" || !conversationId) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "conversationId is required and must be a string",
        422
      );
    }
    if (note !== undefined && typeof note !== "string") {
      return messagingApiError(
        "VALIDATION_ERROR",
        "note must be a string",
        422
      );
    }

    // Validate org membership
    const member = await db.member.findFirst({
      where: {
        organizationId: orgId,
        userId: userId,
      },
    });

    if (!member) {
      return messagingApiError(
        "FORBIDDEN",
        "Access denied: user is not a member of this organization",
        403
      );
    }

    const result = await flagMessageForFollowUp({
      orgId,
      userId,
      messageId,
      conversationId,
      note,
    });

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
