import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { getMailboxConnection } from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";

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
    const record = await getMailboxConnection(auth.ctx.orgId, connectionId);
    if (!record) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({ connection: toMailboxConnectionListItem(record) });
  } catch (error) {
    console.error("[mailbox/connections/:id] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
