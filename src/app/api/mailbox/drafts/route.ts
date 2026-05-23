import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxDrafts } from "@/lib/mailbox/draft-service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId } = auth.ctx;
    const { searchParams } = new URL(request.url);

    const connectionId = searchParams.get("connectionId");
    const status = searchParams.get("status") as "ACTIVE" | "DISCARDED" | "SENT" | null;

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    const drafts = await listMailboxDrafts({
      orgId,
      mailboxConnectionId: connectionId,
      status: status ?? "ACTIVE",
    });

    return NextResponse.json({ drafts }, { status: 200 });
  } catch (error) {
    console.error("[mailbox/drafts] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
