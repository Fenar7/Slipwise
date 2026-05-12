import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as { mailboxConnectionId?: unknown };
    if (typeof body.mailboxConnectionId !== "string" || body.mailboxConnectionId.length === 0) {
      return NextResponse.json({ error: "mailboxConnectionId is required" }, { status: 400 });
    }

    const rl = await rateLimitByOrg(
      `${auth.ctx.orgId}:mailbox:${body.mailboxConnectionId}`,
      { maxRequests: 1, window: "10 s" },
    );
    if (!rl.success) {
      return NextResponse.json({ error: "Too many sync requests" }, { status: 429 });
    }

    const result = await runMailboxSync({
      orgId: auth.ctx.orgId,
      connectionId: body.mailboxConnectionId,
      actorId: auth.ctx.userId,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[mailbox/sync] POST failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mailbox sync failed" },
      { status: 500 },
    );
  }
}
