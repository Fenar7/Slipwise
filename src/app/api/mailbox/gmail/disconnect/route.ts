import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { disconnectGmailMailbox } from "@/lib/mailbox/gmail-oauth-service";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/mailbox/gmail/disconnect
 *
 * Disconnect a Gmail mailbox: revoke provider authorization, delete the
 * credential store entry, and set the connection status to DISCONNECTED.
 * Admin-only. Rate-limited per org.
 *
 * Body: { connectionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxDisconnect);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 },
      );
    }

    const body = await request.json() as { connectionId?: unknown };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    await disconnectGmailMailbox({
      orgId: auth.ctx.orgId,
      connectionId,
      actorId: auth.ctx.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mailbox/gmail/disconnect] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
