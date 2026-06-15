import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxAuditEventsPaginated, stripSensitiveMetadata } from "@/lib/mailbox/audit-read-service";
import { getMailboxAuditActionLabel } from "@/lib/mailbox/audit";
import { db } from "@/lib/db";

const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_\-]{20,}/g;

function sanitizeProviderError(errorMessage: string | null): string | null {
  if (!errorMessage) return null;
  return errorMessage.replace(TOKEN_LIKE_PATTERN, "[REDACTED]");
}

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

    const connection = await db.mailboxConnection.findFirst({
      where: { id: connectionId, orgId: auth.ctx.orgId },
      select: {
        id: true,
        displayName: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [syncRunCounts, latestFailedRun, recentAuditRows] = await Promise.all([
      db.mailboxSyncRun.groupBy({
        by: ["status"],
        where: { orgId: auth.ctx.orgId, mailboxConnectionId: connectionId },
        _count: { id: true },
      }),
      db.mailboxSyncRun.findFirst({
        where: {
          orgId: auth.ctx.orgId,
          mailboxConnectionId: connectionId,
          status: "FAILED",
        },
        orderBy: { startedAt: "desc" },
        select: { errorSummary: true },
      }),
      listMailboxAuditEventsPaginated(auth.ctx.orgId, {
        pageSize: 5,
        connectionId,
      }),
    ]);

    const syncRunCount = syncRunCounts.reduce(
      (sum, row) => sum + row._count.id,
      0,
    );
    const failedSyncRunCount =
      syncRunCounts.find((row) => row.status === "FAILED")?._count.id ?? 0;

    const providerErrorSummary = sanitizeProviderError(
      latestFailedRun?.errorSummary ?? null,
    );

    const actionRequired =
      connection.status === "DEGRADED" ||
      connection.status === "RECONNECT_REQUIRED";

    const recentAuditEvents = recentAuditRows.records.map((record) => ({
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
        connectionId: connection.id,
        displayName: connection.displayName,
        provider: connection.provider,
        status: connection.status,
        emailAddress: "[REDACTED]",
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        lastSyncError: connection.lastSyncError,
        syncRunCount,
        failedSyncRunCount,
        recentAuditEvents,
        providerErrorSummary,
        actionRequired,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[mailbox/connections/[connectionId]/support-summary] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
