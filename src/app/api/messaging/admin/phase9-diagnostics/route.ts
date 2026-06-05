import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
  applyMessagingRateLimit,
  MessagingApiError,
  MessagingApiErrorCode,
} from "@/app/api/messaging/_utils";
import { getMessagingDiagnostics } from "@/lib/messaging/diagnostics-service";

export const runtime = "nodejs";

/**
 * GET /api/messaging/admin/phase9-diagnostics
 *
 * Operator-facing diagnostics for the Internal Messaging Phase 9 surface.
 * Gated by admin role + org membership. Rate-limited.
 *
 * Returns truthful health data for:
 * - Search/indexing health (coverage, pending, failed, degraded)
 * - Notification delivery health (unread, failures, deduplication)
 * - Reminder health (task and meeting reminder dispatch status)
 * - Digest health (enabled users, dispatch frequency)
 * - Follow-up health (pending vs resolved)
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();

    if (!hasRole(role, "admin")) {
      throw new MessagingApiError(
        MessagingApiErrorCode.FORBIDDEN,
        "Forbidden",
        403,
      );
    }

    await applyMessagingRateLimit(request, orgId, "diagnostics");

    const diagnostics = await getMessagingDiagnostics(orgId, userId);

    if (diagnostics === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ diagnostics });
  } catch (err) {
    return handleMessagingApiError(err);
  }
}
