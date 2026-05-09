import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getMailboxConnection,
  updateMailboxConnectionStatus,
} from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import type { MailboxConnectionStatus } from "@/lib/mailbox/domain-types";

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

    const existing = await getMailboxConnection(auth.ctx.orgId, connectionId);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const updated = await updateMailboxConnectionStatus({
      orgId: auth.ctx.orgId,
      connectionId,
      status,
      actorId: auth.ctx.userId,
    });

    return NextResponse.json({ ok: true, connection: toMailboxConnectionListItem(updated) });
  } catch (error) {
    console.error("[mailbox/connections/:id/status] PATCH failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
