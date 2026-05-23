import "server-only";

import { NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxConnections } from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import { getMailboxSyncRunsByConnectionIds } from "@/lib/mailbox/sync-run-read-service";

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const records = await listMailboxConnections(auth.ctx.orgId);
    const syncRuns = await getMailboxSyncRunsByConnectionIds(
      auth.ctx.orgId,
      records.map((record) => record.id),
    );
    const connections = records.map((record) =>
      toMailboxConnectionListItem(record, Date.now(), {
        latestRun: syncRuns.latestRunByConnectionId.get(record.id) ?? null,
        latestCompletedRun:
          syncRuns.latestCompletedRunByConnectionId.get(record.id) ?? null,
      }),
    );
    return NextResponse.json({ connections });
  } catch (error) {
    console.error("[mailbox/connections] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
