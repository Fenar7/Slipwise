import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { updateMailboxConnectionStatus } from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import type { MailboxConnectionStatus, MailboxConnectionRecord } from "@/lib/mailbox/domain-types";

const ALLOWED_ADMIN_STATUSES: MailboxConnectionStatus[] = ["DEGRADED", "DISCONNECTED"];

export async function PATCH(
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
    const body = (await request.json()) as { status?: unknown };

    if (
      typeof body.status !== "string" ||
      !(ALLOWED_ADMIN_STATUSES as string[]).includes(body.status)
    ) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const status = body.status as MailboxConnectionStatus;

    let updated: MailboxConnectionRecord;
    try {
      updated = await updateMailboxConnectionStatus({
        orgId: auth.ctx.orgId,
        connectionId,
        status,
        actorId: auth.ctx.userId,
      });
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, connection: toMailboxConnectionListItem(updated) });
  } catch (error) {
    console.error("[mailbox/connections/:id/status] PATCH failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
