import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  createThreadLink,
  listThreadLinks,
  LinkServiceError,
} from "@/lib/mailbox/link-service";
import type { MailboxThreadLinkEntityType } from "@/lib/mailbox/domain-types";

const VALID_ENTITY_TYPES: MailboxThreadLinkEntityType[] = [
  "CUSTOMER",
  "INVOICE",
  "VOUCHER",
  "QUOTE",
];

export interface CreateLinkRequest {
  entityType: string;
  entityId: string;
}

export interface CreateLinkResponse {
  id: string;
  entityType: string;
  entityRef: string;
  entityLabel: string;
  entityMeta: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface LinkListResponse {
  links: CreateLinkResponse[];
  suggestions: CreateLinkResponse[];
}

export interface LinkErrorResponse {
  error: string;
}

/**
 * GET /api/mailbox/threads/[id]/links
 *
 * Returns confirmed links and suggested links for a thread.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, { maxRequests: 120, window: "60 s" });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const threadId = (await params).id;
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "Invalid thread ID" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    const result = await listThreadLinks({
      orgId: auth.ctx.orgId,
      userId: auth.ctx.userId,
      role: auth.ctx.role as "owner" | "admin" | "member",
      threadId,
    });

    return NextResponse.json(result satisfies LinkListResponse);
  } catch (error) {
    console.error("[mailbox/threads/[id]/links] GET failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies LinkErrorResponse,
      { status: 500 },
    );
  }
}

/**
 * POST /api/mailbox/threads/[id]/links
 *
 * Body: { entityType: "CUSTOMER" | "INVOICE" | "VOUCHER" | "QUOTE", entityId: string }
 *
 * Creates a new link between the thread and a business record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, { maxRequests: 60, window: "60 s" });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const threadId = (await params).id;
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "Invalid thread ID" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    let body: CreateLinkRequest;
    try {
      body = (await request.json()) as CreateLinkRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    if (!VALID_ENTITY_TYPES.includes(body.entityType as MailboxThreadLinkEntityType)) {
      return NextResponse.json(
        { error: `Invalid entityType. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` } satisfies LinkErrorResponse,
        { status: 400 },
      );
    }

    const result = await createThreadLink({
      orgId: auth.ctx.orgId,
      userId: auth.ctx.userId,
      role: auth.ctx.role as "owner" | "admin" | "member",
      threadId,
      entityType: body.entityType as MailboxThreadLinkEntityType,
      entityId: body.entityId,
    });

    return NextResponse.json(result satisfies CreateLinkResponse, { status: 201 });
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

    console.error("[mailbox/threads/[id]/links] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies LinkErrorResponse,
      { status: 500 },
    );
  }
}
