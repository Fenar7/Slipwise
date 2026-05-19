import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { sendDraft, SendServiceError } from "@/lib/mailbox/send-service";

export type SendDraftResponse =
  | {
      status: "sent";
      draft: Record<string, unknown>;
      providerMessageId: string;
      providerThreadId: string | null;
      rfcMessageId: string | null;
      sendAttemptId: string;
    }
  | {
      status: "pending_reconciliation";
      sendAttemptId: string;
      retryAfter: number;
      reason: string;
    }
  | {
      status: "failed";
      sendAttemptId: string;
      reason: string;
      retryable: boolean;
    };

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

    switch (result.status) {
      case "sent":
        return NextResponse.json({
          status: "sent",
          draft: result.draft as unknown as Record<string, unknown>,
          providerMessageId: result.providerMessageId,
          providerThreadId: result.providerThreadId,
          rfcMessageId: result.rfcMessageId,
          sendAttemptId: result.sendAttemptId,
        }, { status: 200 });

      case "pending_reconciliation":
        return NextResponse.json({
          status: "pending_reconciliation",
          sendAttemptId: result.sendAttemptId,
          retryAfter: result.retryAfter,
          reason: result.reason,
        }, { status: 202 });

      case "failed":
        return NextResponse.json({
          status: "failed",
          sendAttemptId: result.sendAttemptId,
          reason: result.reason,
          retryable: result.retryable,
        }, { status: 422 });
    }
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
