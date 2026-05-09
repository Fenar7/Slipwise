import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getMailboxConnection,
  disableMailboxConnection,
} from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import type { MailboxConnectionRecord } from "@/lib/mailbox/domain-types";

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

/**
 * DELETE /api/mailbox/connections/[connectionId]
 *
 * Admin governance action: soft-disable a mailbox connection.
 * Sets status = DISCONNECTED and emits a governance audit event.
 *
 * This is a provider-agnostic disable. It does NOT revoke OAuth tokens at the
 * provider level — use the provider-specific disconnect routes for that.
 * Use this route when an admin needs to immediately disable a connection
 * regardless of provider (e.g., security incident, org offboarding).
 *
 * Admin-only. Rate-limited per org.
 */
export async function DELETE(
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

    let record: MailboxConnectionRecord;
    try {
      record = await disableMailboxConnection(
        auth.ctx.orgId,
        connectionId,
        auth.ctx.userId,
      );
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, connection: toMailboxConnectionListItem(record) });
  } catch (error) {
    console.error("[mailbox/connections/:id] DELETE failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
