import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { getMailboxConnection } from "@/lib/mailbox/connection-service";
import { refreshGmailAuthorization } from "@/lib/mailbox/gmail-oauth-service";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/mailbox/gmail/refresh
 *
 * Manually trigger a token refresh for a Gmail mailbox connection.
 * Admin-only. Rate-limited per org.
 *
 * Body: { connectionId: string }
 *
 * On success: returns { ok: true, tokenExpiry: string | null }
 * On auth_expired: returns { ok: false, reconnectRequired: true }
 *   — the connection has been transitioned to RECONNECT_REQUIRED.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxTokenRefresh);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many refresh attempts. Please wait before trying again." },
        { status: 429 },
      );
    }

    const body = await request.json() as { connectionId?: unknown };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    const connection = await getMailboxConnection(auth.ctx.orgId, connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!connection.tokenRef) {
      return NextResponse.json(
        { error: "Connection has no stored credentials. Reconnect required." },
        { status: 422 },
      );
    }

    const result = await refreshGmailAuthorization({
      orgId: auth.ctx.orgId,
      connectionId: connection.id,
      tokenRef: connection.tokenRef,
      actorId: auth.ctx.userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reconnectRequired: result.reconnectRequired, error: result.error },
        { status: result.error === "auth_expired" ? 401 : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      tokenExpiry: result.tokenExpiry?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[mailbox/gmail/refresh] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
