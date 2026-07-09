import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";

/** Rate-limit window for manual mailbox sync requests. */
const MAILBOX_SYNC_RATE_LIMIT = { maxRequests: 1, window: "10 s" as const };

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

    if (body.triggerSource !== undefined && body.triggerSource !== "MANUAL") {
      return NextResponse.json(
        { error: "Only MANUAL triggerSource is accepted on the public sync route" },
        { status: 400 },
      );
    }

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
      triggerSource: "MANUAL",
    });

    // If the sync returned early due to time constraints but has more data (chunking),
    // spawn a detached background promise to continue processing the remaining chunks
    // so the API response doesn't timeout.
    if (result.hasMore) {
      console.log(`[mailbox/sync] Sync incomplete, spawning background continuation for ${body.mailboxConnectionId}`);
      
      // Detached Promise: runs in the Node.js background.
      (async () => {
        try {
          let hasMore = true;
          while (hasMore) {
            const nextResult = await runMailboxSync({
              orgId: auth.ctx.orgId,
              connectionId: String(body.mailboxConnectionId),
              actorId: auth.ctx.userId,
              triggerSource: "MANUAL",
            });
            hasMore = nextResult.hasMore === true;
          }
          console.log(`[mailbox/sync] Background sync finished for ${body.mailboxConnectionId}`);
        } catch (bgError) {
          console.error(`[mailbox/sync] Background sync failed for ${body.mailboxConnectionId}`, bgError);
        }
      })();
    }

    // Return 202 Accepted if it's still running in the background, otherwise 200 OK
    return NextResponse.json(result, { status: result.hasMore ? 202 : (result.success ? 200 : 400) });
  } catch (error) {
    console.error("[mailbox/sync] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
