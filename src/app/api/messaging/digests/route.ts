import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatchDigestForUser } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  messagingApiError,
} from "../_utils";

export const runtime = "nodejs";

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

    const { orgId } = body;
    if (typeof orgId !== "string" || !orgId) {
      return messagingApiError(
        "VALIDATION_ERROR",
        "orgId is required and must be a string",
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

    const result = await dispatchDigestForUser({
      userId,
      orgId,
    });

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
