import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
  MessagingApiError,
  MessagingApiErrorCode,
} from "@/app/api/messaging/_utils";
import { getTaskHealthDiagnostics } from "@/lib/messaging/read-models";

export async function GET(_request: NextRequest) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();

    if (!hasRole(role, "admin")) {
      throw new MessagingApiError(
        MessagingApiErrorCode.FORBIDDEN,
        "Forbidden",
        403,
      );
    }

    const diagnostics = await getTaskHealthDiagnostics(orgId, userId);

    if (diagnostics === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ diagnostics });
  } catch (err) {
    return handleMessagingApiError(err);
  }
}
