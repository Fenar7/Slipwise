import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { sendDraft, SendServiceError } from "@/lib/mailbox/send-service";

export interface SendDraftResponse {
  draft: Record<string, unknown>;
  providerMessageId: string | null;
  providerThreadId: string | null;
}

export interface SendDraftErrorResponse {
  error: string;
}

/**
 * POST /api/mailbox/drafts/[id]/send
 *
 * Sends the draft via the provider associated with its mailbox connection.
 * The draft must be ACTIVE. On success, the draft transitions to SENT.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId, userId, role } = auth.ctx;
    const draftId = (await params).id;

    if (!draftId || typeof draftId !== "string") {
      return NextResponse.json({ error: "Invalid draft ID" }, { status: 400 });
    }

    const rl = await rateLimitByOrg(orgId, {
      maxRequests: 30,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const result = await sendDraft({
      orgId,
      userId,
      role: role as "owner" | "admin" | "member",
      draftId,
    });

    return NextResponse.json({
      draft: result.draft as unknown as Record<string, unknown>,
      providerMessageId: result.providerMessageId,
      providerThreadId: result.providerThreadId,
    } satisfies SendDraftResponse);
  } catch (error) {
    if (error instanceof SendServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies SendDraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts/[id]/send] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies SendDraftErrorResponse,
      { status: 500 },
    );
  }
}
