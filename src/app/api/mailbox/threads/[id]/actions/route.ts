import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  performThreadAction,
  isValidThreadAction,
  ThreadActionError,
} from "@/lib/mailbox/thread-action-service";

export interface ThreadActionRequest {
  action: string;
}

export interface ThreadActionResponse {
  success: boolean;
  thread: Record<string, unknown> | null;
  action: string;
}

export interface ThreadActionErrorResponse {
  error: string;
}

/**
 * POST /api/mailbox/threads/[id]/actions
 *
 * Body: { action: "mark_read" | "mark_unread" | "archive" | "unarchive" | "flag" | "unflag" }
 *
 * Auth: any authenticated org member with write-capable access.
 * Rate-limited per org.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) {
      return auth.response;
    }

    const { orgId, userId, role } = auth.ctx;

    const rl = await rateLimitByOrg(orgId, "mailbox:thread-action", {
      maxRequests: 60,
      window: 60,
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const threadId = (await params).id;
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "Invalid thread ID" } satisfies ThreadActionErrorResponse,
        { status: 400 },
      );
    }

    let body: ThreadActionRequest;
    try {
      body = (await request.json()) as ThreadActionRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" } satisfies ThreadActionErrorResponse,
        { status: 400 },
      );
    }

    if (!isValidThreadAction(body.action)) {
      return NextResponse.json(
        {
          error: `Invalid action. Must be one of: mark_read, mark_unread, archive, unarchive, flag, unflag`,
        } satisfies ThreadActionErrorResponse,
        { status: 400 },
      );
    }

    const result = await performThreadAction(
      orgId,
      userId,
      role as "owner" | "admin" | "member",
      threadId,
      body.action,
    );

    return NextResponse.json({
      success: result.success,
      thread: result.thread,
      action: result.action,
    } satisfies ThreadActionResponse);
  } catch (error) {
    if (error instanceof ThreadActionError) {
      return NextResponse.json(
        { error: error.message } satisfies ThreadActionErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/threads/[id]/actions] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies ThreadActionErrorResponse,
      { status: 500 },
    );
  }
}
