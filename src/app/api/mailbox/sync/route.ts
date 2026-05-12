import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";
import type { MailboxSyncTriggerSource } from "@/lib/mailbox/domain-types";

/** Rate-limit window for manual mailbox sync requests. */
const MAILBOX_SYNC_RATE_LIMIT = { maxRequests: 1, window: "10 s" as const };

const VALID_TRIGGER_SOURCES: MailboxSyncTriggerSource[] = [
  "MANUAL",
  "SCHEDULED",
  "RENEWAL",
  "WEBHOOK",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      mailboxConnectionId?: unknown;
      triggerSource?: unknown;
    };
    if (typeof body.mailboxConnectionId !== "string" || body.mailboxConnectionId.length === 0) {
      return NextResponse.json({ error: "mailboxConnectionId is required" }, { status: 400 });
    }

    const triggerSource =
      typeof body.triggerSource === "string" &&
      VALID_TRIGGER_SOURCES.includes(body.triggerSource as MailboxSyncTriggerSource)
        ? (body.triggerSource as MailboxSyncTriggerSource)
        : "MANUAL";

    const rl = await rateLimitByOrg(
      `${auth.ctx.orgId}:mailbox:${body.mailboxConnectionId}`,
      MAILBOX_SYNC_RATE_LIMIT,
    );
    if (!rl.success) {
      return NextResponse.json({ error: "Too many sync requests" }, { status: 429 });
    }

    const result = await runMailboxSync({
      orgId: auth.ctx.orgId,
      connectionId: body.mailboxConnectionId,
      actorId: auth.ctx.userId,
      triggerSource,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[mailbox/sync] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
