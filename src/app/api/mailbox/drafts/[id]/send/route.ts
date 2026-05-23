import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { sendDraft, SendServiceError } from "@/lib/mailbox/send-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId, userId, role } = auth.ctx;
    const draftId = (await params).id;

    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required" }, { status: 400 });
    }

    const result = await sendDraft({
      orgId,
      userId,
      role: role as "owner" | "admin" | "member",
      draftId,
    });

    switch (result.status) {
      case "sent":
        return NextResponse.json({ status: "sent", sendAttemptId: result.sendAttemptId }, { status: 200 });
      case "failed":
        return NextResponse.json(
          { status: "failed", retryable: result.retryable },
          { status: 422 }
        );
      case "pending_reconciliation":
        return NextResponse.json(
          { status: "pending_reconciliation", sendAttemptId: result.sendAttemptId },
          { status: 202 }
        );
    }
  } catch (error) {
    if (error instanceof SendServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[mailbox/drafts/[id]/send] POST failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
