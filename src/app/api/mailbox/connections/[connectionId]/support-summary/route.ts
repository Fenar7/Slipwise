import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { getConnectionSupportData, stripSensitiveMetadata } from "@/lib/mailbox/audit-read-service";
import { getMailboxAuditActionLabel } from "@/lib/mailbox/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxSupportSummary);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;

    const data = await getConnectionSupportData(auth.ctx.orgId, connectionId);

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const actionRequired =
      data.status === "DEGRADED" ||
      data.status === "RECONNECT_REQUIRED";

    const recentAuditEvents = data.recentAuditEvents.map((record) => ({
      id: record.id,
      action: record.action,
      actionLabel: getMailboxAuditActionLabel(record.action),
      summary: record.summary,
      actorId: record.actorId,
      mailboxConnectionId: record.mailboxConnectionId,
      threadId: record.threadId,
      messageId: record.messageId,
      metadata: stripSensitiveMetadata(record.metadata),
      createdAt: record.createdAt.toISOString(),
    }));

    return NextResponse.json({
      summary: {
        connectionId: data.connectionId,
        displayName: data.displayName,
        provider: data.provider,
        status: data.status,
        emailAddress: "[REDACTED]",
        lastSyncAt: data.lastSyncAt?.toISOString() ?? null,
        lastSyncError: data.lastSyncError,
        deletedAt: data.deletedAt?.toISOString() ?? null,
        syncRunCount: data.syncRunCount,
        failedSyncRunCount: data.failedSyncRunCount,
        recentAuditEvents,
        providerErrorSummary: data.providerErrorSummary,
        actionRequired,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[mailbox/connections/[connectionId]/support-summary] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
