import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxAuditEventsPaginated, stripSensitiveMetadata } from "@/lib/mailbox/audit-read-service";
import { getMailboxAuditActionLabel } from "@/lib/mailbox/audit";
import { auditListQuerySchema } from "@/lib/validation/mailbox";
import { ZodError } from "zod";

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxAuditList);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    let parsed;
    try {
      parsed = auditListQuerySchema.parse(query);
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const message = firstIssue?.message ?? "Invalid query parameters";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }

    const { records, nextCursor } = await listMailboxAuditEventsPaginated(
      auth.ctx.orgId,
      {
        cursor: parsed.cursor,
        pageSize: parsed.pageSize,
        connectionId: parsed.connectionId,
        action: parsed.action,
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
      },
    );

    const events = records.map((record) => ({
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

    return NextResponse.json({ events, nextCursor });
  } catch (error) {
    console.error("[mailbox/audit] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
