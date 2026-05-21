import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  deleteThreadLink,
  setPrimaryLink,
  LinkServiceError,
} from "@/lib/mailbox/link-service";

export interface SetPrimaryRequest {
  action: "setPrimary";
}

export interface LinkActionResponse {
  id: string;
  entityType: string;
  entityRef: string;
  entityLabel: string;
  entityMeta: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface LinkErrorResponse {
  error: string;
}

/**
 * DELETE /api/mailbox/threads/[id]/links/[linkId]
 *
 * Removes a link between a thread and a business record.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, { maxRequests: 60, window: "60 s" });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id: threadId, linkId } = await params;
    if (!threadId || !linkId) {
      return NextResponse.json(
        { error: "Invalid thread or link ID" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    await deleteThreadLink({
      orgId: auth.ctx.orgId,
      userId: auth.ctx.userId,
      role: auth.ctx.role as "owner" | "admin" | "member",
      threadId,
      linkId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LinkServiceError) {
      const statusMap: Record<LinkServiceError["code"], number> = {
        UNAUTHORIZED: 403,
        NOT_FOUND: 404,
        DUPLICATE: 409,
        CROSS_ORG: 403,
        INVALID_ENTITY: 400,
      };
      return NextResponse.json(
        { error: error.message } satisfies LinkErrorResponse,
        { status: statusMap[error.code] ?? 400 },
      );
    }

    console.error("[mailbox/threads/[id]/links/[linkId]] DELETE failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies LinkErrorResponse,
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/mailbox/threads/[id]/links/[linkId]
 *
 * Body: { action: "setPrimary" }
 *
 * Promotes a link to the primary link for the thread.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, { maxRequests: 60, window: "60 s" });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id: threadId, linkId } = await params;
    if (!threadId || !linkId) {
      return NextResponse.json(
        { error: "Invalid thread or link ID" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    let body: SetPrimaryRequest;
    try {
      body = (await request.json()) as SetPrimaryRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    if (body.action !== "setPrimary") {
      return NextResponse.json(
        { error: "Unsupported action. Use 'setPrimary'." } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    const result = await setPrimaryLink({
      orgId: auth.ctx.orgId,
      userId: auth.ctx.userId,
      role: auth.ctx.role as "owner" | "admin" | "member",
      threadId,
      linkId,
    });

    return NextResponse.json(result satisfies LinkActionResponse);
  } catch (error) {
    if (error instanceof LinkServiceError) {
      const statusMap: Record<LinkServiceError["code"], number> = {
        UNAUTHORIZED: 403,
        NOT_FOUND: 404,
        DUPLICATE: 409,
        CROSS_ORG: 403,
        INVALID_ENTITY: 400,
      };
      return NextResponse.json(
        { error: error.message } satisfies LinkErrorResponse,
        { status: statusMap[error.code] ?? 400 },
      );
    }

    console.error("[mailbox/threads/[id]/links/[linkId]] PATCH failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies LinkErrorResponse,
      { status: 500 },
    );
  }
}
