import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
  MessagingApiError,
  MessagingApiErrorCode,
} from "@/app/api/messaging/_utils";
import { getCalendarDiagnostics } from "@/lib/messaging/read-models";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();

    // 1. Gating & Permissions: Enforce org admin or owner role
    if (!hasRole(role, "admin")) {
      throw new MessagingApiError(
        MessagingApiErrorCode.FORBIDDEN,
        "Forbidden",
        403,
      );
    }

    // 2. Query read-model
    const diagnostics = await getCalendarDiagnostics(orgId, userId);

    if (diagnostics === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ diagnostics });
  } catch (err) {
    return handleMessagingApiError(err);
  }
}
