import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { setMailboxVisibilityPolicy } from "@/lib/mailbox/visibility-service";
import type { MailboxVisibilityPolicy } from "@/lib/mailbox/domain-types";

const ALLOWED_POLICIES: MailboxVisibilityPolicy[] = [
  "org_shared",
  "restricted",
  "admin_only",
];

export async function PATCH(
  request: NextRequest,
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
    const rawBody = await request.json();
    const body =
      typeof rawBody === "object" && rawBody !== null
        ? (rawBody as { policy?: unknown })
        : {};

    if (
      typeof body.policy !== "string" ||
      !(ALLOWED_POLICIES as string[]).includes(body.policy)
    ) {
      return NextResponse.json({ error: "Invalid policy value" }, { status: 400 });
    }

    const policy = body.policy as MailboxVisibilityPolicy;

    let updated;
    try {
      updated = await setMailboxVisibilityPolicy(
        auth.ctx.orgId,
        connectionId,
        policy,
        auth.ctx.userId,
      );
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, connection: updated });
  } catch (error) {
    console.error("[mailbox/connections/:id/policy] PATCH failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
