import "server-only";

import { NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const result = await listMailboxConnectionsForMember(
      auth.ctx.orgId,
      auth.ctx.userId,
      auth.ctx.role,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[mailbox/connections/visible] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
