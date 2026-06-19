import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { getMailboxAuditEventById, stripSensitiveMetadata } from "@/lib/mailbox/audit-read-service";
import { getMailboxAuditActionLabel } from "@/lib/mailbox/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxAuditDetail);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { eventId } = await params;

    const event = await getMailboxAuditEventById(auth.ctx.orgId, eventId);

    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      event: {
        id: event.id,
        action: event.action,
        actionLabel: getMailboxAuditActionLabel(event.action),
        summary: event.summary,
        actorId: event.actorId,
        mailboxConnectionId: event.mailboxConnectionId,
        threadId: event.threadId,
        messageId: event.messageId,
        metadata: stripSensitiveMetadata(event.metadata),
        createdAt: event.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[mailbox/audit/[eventId]] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
