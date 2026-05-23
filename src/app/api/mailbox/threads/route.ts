import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxThreads, type MailboxFolder } from "@/lib/mailbox/thread-service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId } = auth.ctx;
    const { searchParams } = new URL(request.url);

    const connectionId = searchParams.get("connectionId");
    const folder = searchParams.get("folder") as MailboxFolder | null;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    if (!folder || !["INBOX", "SENT", "SPAM", "ARCHIVE"].includes(folder)) {
      return NextResponse.json({ error: "Valid folder is required" }, { status: 400 });
    }

    const result = await listMailboxThreads({
      orgId,
      mailboxConnectionId: connectionId,
      folder,
      limit: Number.isNaN(limit) ? 50 : limit,
      offset: Number.isNaN(offset) ? 0 : offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[mailbox/threads] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
