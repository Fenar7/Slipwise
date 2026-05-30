import { NextRequest } from "next/server";
import { getOrgTaskSummaries } from "@/lib/messaging";
import { isValidTaskListScope } from "@/lib/messaging/service-contracts";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  parsePagination,
} from "../_utils";

export const runtime = "nodejs";

const VALID_TASK_SCOPES = [
  "open",
  "done",
  "cancelled",
  "overdue",
  "due_soon",
  "assigned",
  "created",
] as const;

export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { searchParams } = new URL(request.url);

    // Validate scope — reject invalid values at the API boundary
    const rawScope = searchParams.get("scope");
    const scope = rawScope && isValidTaskListScope(rawScope) ? rawScope : undefined;

    // Validate optional conversationId — must be a non-empty string
    const conversationId = searchParams.get("conversationId") || undefined;

    // Parse pagination params
    const { limit, cursor } = parsePagination(searchParams);

    const result = await safeRead(
      getOrgTaskSummaries(orgId, userId, {
        scope,
        conversationId,
        cursor,
        limit,
      }),
    );

    return messagingApiResponse(result);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
