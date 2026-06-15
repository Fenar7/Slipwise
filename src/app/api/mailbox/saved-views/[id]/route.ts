import "server-only";

import { NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { deleteMailboxSavedView } from "@/lib/mailbox/saved-view-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const ok = await deleteMailboxSavedView(id, auth.ctx.orgId, auth.ctx.userId);

    if (!ok) {
      return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[mailbox/saved-views] DELETE failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
