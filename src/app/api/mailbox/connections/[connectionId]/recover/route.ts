import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getMailboxRecoveryStatus,
  performMailboxRecoveryAction,
} from "@/lib/mailbox/recovery-service";
import type { RecoveryActionType } from "@/lib/mailbox/recovery-service";

const ALLOWED_RECOVERY_ACTIONS: RecoveryActionType[] = [
  "retry",
  "replay",
  "verify_auth",
];

/**
 * GET /api/mailbox/connections/[connectionId]/recover
 *
 * Returns the recovery status for a mailbox connection.
 * Admin-only. Rate-limited per org.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;
    const status = await getMailboxRecoveryStatus(auth.ctx.orgId, connectionId);
    if (!status) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({ status });
  } catch (error) {
    console.error("[mailbox/connections/:id/recover] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/mailbox/connections/[connectionId]/recover
 *
 * Perform a recovery action on a mailbox connection.
 * Admin-only. Rate-limited per org.
 *
 * Body: { action: "retry" | "replay" | "verify_auth" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;
    const rawBody = await request.json();
    const body =
      typeof rawBody === "object" && rawBody !== null
        ? (rawBody as { action?: unknown })
        : {};

    if (
      typeof body.action !== "string" ||
      !(ALLOWED_RECOVERY_ACTIONS as string[]).includes(body.action)
    ) {
      return NextResponse.json({ error: "Invalid recovery action" }, { status: 400 });
    }

    const action = body.action as RecoveryActionType;

    const result = await performMailboxRecoveryAction({
      orgId: auth.ctx.orgId,
      connectionId,
      actorId: auth.ctx.userId,
      action,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error("[mailbox/connections/:id/recover] POST failed:", error);
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
