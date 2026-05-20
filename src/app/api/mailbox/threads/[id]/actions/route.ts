import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  performThreadAction,
  isValidThreadAction,
  ThreadActionError,
} from "@/lib/mailbox/thread-action-service";
import {
  assignThread,
  unassignThread,
  setThreadStatus,
  AssignmentServiceError,
} from "@/lib/mailbox/assignment-service";
import type { MailboxThreadStatus } from "@/lib/mailbox/domain-types";

export interface ThreadActionRequest {
  action: string;
  assigneeId?: string;
  status?: string;
}

export interface ThreadActionResponse {
  success: boolean;
  thread: Record<string, unknown> | null;
  action: string;
}

export interface ThreadActionErrorResponse {
  error: string;
}

const VALID_EXTENDED_ACTIONS = [
  "mark_read",
  "mark_unread",
  "archive",
  "unarchive",
  "flag",
  "unflag",
  "assign",
  "unassign",
  "set_status",
];

function isValidExtendedAction(value: unknown): value is string {
  return typeof value === "string" && VALID_EXTENDED_ACTIONS.includes(value);
}

/**
 * POST /api/mailbox/threads/[id]/actions
 *
 * Body:
 *   { action: "mark_read" | "mark_unread" | "archive" | "unarchive" | "flag" | "unflag" }
 *   { action: "assign", assigneeId: string | "self" }
 *   { action: "unassign" }
 *   { action: "set_status", status: "OPEN" | "PENDING" | "CLOSED" | "ARCHIVED" }
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

    const rl = await rateLimitByOrg(orgId, { maxRequests: 60, window: "60 s" });
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

    if (!isValidExtendedAction(body.action)) {
      return NextResponse.json(
        {
          error: `Invalid action. Must be one of: ${VALID_EXTENDED_ACTIONS.join(", ")}`,
        } satisfies ThreadActionErrorResponse,
        { status: 400 },
      );
    }

    let result:
      | { success: boolean; thread: Record<string, unknown> | null; action: string }
      | undefined;

    if (isValidThreadAction(body.action)) {
      const actionResult = await performThreadAction(
        orgId,
        userId,
        role as "owner" | "admin" | "member",
        threadId,
        body.action,
      );
      result = {
        success: actionResult.success,
        thread: actionResult.thread as Record<string, unknown> | null,
        action: actionResult.action,
      };
    } else if (body.action === "assign") {
      const assigneeId = body.assigneeId === "self" ? userId : body.assigneeId;
      if (!assigneeId) {
        return NextResponse.json(
          { error: "assigneeId is required for assign action" } satisfies ThreadActionErrorResponse,
          { status: 400 },
        );
      }
      const assignResult = await assignThread({
        orgId,
        userId,
        role: role as "owner" | "admin" | "member",
        threadId,
        assigneeId,
      });
      result = {
        success: assignResult.success,
        thread: assignResult.thread as Record<string, unknown> | null,
        action: "assign",
      };
    } else if (body.action === "unassign") {
      const unassignResult = await unassignThread({
        orgId,
        userId,
        role: role as "owner" | "admin" | "member",
        threadId,
      });
      result = {
        success: unassignResult.success,
        thread: unassignResult.thread as Record<string, unknown> | null,
        action: "unassign",
      };
    } else if (body.action === "set_status") {
      const status = body.status?.toUpperCase() as MailboxThreadStatus;
      if (!status) {
        return NextResponse.json(
          { error: "status is required for set_status action" } satisfies ThreadActionErrorResponse,
          { status: 400 },
        );
      }
      const statusResult = await setThreadStatus({
        orgId,
        userId,
        role: role as "owner" | "admin" | "member",
        threadId,
        status,
      });
      result = {
        success: statusResult.success,
        thread: statusResult.thread as Record<string, unknown> | null,
        action: "set_status",
      };
    }

    if (!result) {
      return NextResponse.json(
        { error: "Unhandled action" } satisfies ThreadActionErrorResponse,
        { status: 500 },
      );
    }

    return NextResponse.json(result satisfies ThreadActionResponse);
  } catch (error) {
    if (error instanceof ThreadActionError || error instanceof AssignmentServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies ThreadActionErrorResponse,
        { status: (error as ThreadActionError | AssignmentServiceError).statusCode },
      );
    }

    console.error("[mailbox/threads/[id]/actions] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies ThreadActionErrorResponse,
      { status: 500 },
    );
  }
}
