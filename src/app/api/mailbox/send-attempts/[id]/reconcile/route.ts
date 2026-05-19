import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { reconcileSendAttempt, SendServiceError } from "@/lib/mailbox/send-service";

export type ReconcileResponse =
  | {
      status: "reconciled_sent";
      providerMessageId: string;
      providerThreadId: string;
    }
  | {
      status: "reconciled_failed";
      message: string;
    }
  | {
      status: "still_pending";
      message: string;
    };

export interface ReconcileErrorResponse {
  error: string;
}

/**
 * POST /api/mailbox/send-attempts/[id]/reconcile
 *
 * Explicitly reconcile a send attempt that is in PENDING_RECONCILIATION.
 * Asks the provider whether the sent message exists and updates local state.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId, userId, role } = auth.ctx;
    const attemptId = (await params).id;

    if (!attemptId || typeof attemptId !== "string") {
      return NextResponse.json({ error: "Invalid attempt ID" }, { status: 400 });
    }

    const result = await reconcileSendAttempt({
      orgId,
      userId,
      role: role as "owner" | "admin" | "member",
      attemptId,
    });

    switch (result.status) {
      case "reconciled_sent":
        return NextResponse.json({
          status: "reconciled_sent",
          providerMessageId: result.providerMessageId,
          providerThreadId: result.providerThreadId,
        } satisfies ReconcileResponse);
      case "reconciled_failed":
        return NextResponse.json({
          status: "reconciled_failed",
          message: result.message,
        } satisfies ReconcileResponse);
      case "still_pending":
        return NextResponse.json({
          status: "still_pending",
          message: result.message,
        } satisfies ReconcileResponse, { status: 202 });
    }
  } catch (error) {
    if (error instanceof SendServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies ReconcileErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/send-attempts/[id]/reconcile] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies ReconcileErrorResponse,
      { status: 500 },
    );
  }
}
