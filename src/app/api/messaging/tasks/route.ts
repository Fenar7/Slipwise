import { NextRequest } from "next/server";
import { getOrgTaskSummaries } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
} from "../_utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const tasks = await safeRead(
      getOrgTaskSummaries(orgId, userId)
    );
    return messagingApiResponse(tasks);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
