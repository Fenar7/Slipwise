import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  getDraft,
  getProviderDraftDetail,
  autosaveDraft,
  discardDraft,
  DraftServiceError,
} from "@/lib/mailbox/draft-service";
import { normalizeAutosaveDraftInput } from "@/lib/mailbox/compose-context";
import type { AutosaveContext } from "@/lib/mailbox/compose-context";

export interface GetDraftResponse {
  draft: Record<string, unknown> | null;
}

export interface AutosaveRequest {
  lastKnownUpdatedAt?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface AutosaveResponse {
  draft: Record<string, unknown>;
  stale: boolean;
}

export interface DiscardResponse {
  success: boolean;
  draftId: string;
}

export interface DraftErrorResponse {
  error: string;
}

/**
 * GET /api/mailbox/drafts/[id]
 *
 * Returns a single draft by ID, scoped to the caller's org and permissions.
 */
export async function GET(
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
      maxRequests: 120,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const effectiveRole = role as "owner" | "admin" | "member";
    const draft = draftId.startsWith("provider:")
      ? await getProviderDraftDetail({
          orgId,
          userId,
          role: effectiveRole,
          draftId,
        })
      : await getDraft({
          orgId,
          userId,
          role: effectiveRole,
          draftId,
        });

    return NextResponse.json({
      draft: draft as unknown as Record<string, unknown> | null,
    } satisfies GetDraftResponse);
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies DraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts/[id]] GET failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies DraftErrorResponse,
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/mailbox/drafts/[id]
 *
 * Body: AutosaveRequest
 *
 * Autosaves draft content. Uses lastKnownUpdatedAt as an optimistic concurrency guard.
 * If the guard fails, returns stale: true and the current server draft.
 */
export async function PATCH(
  request: NextRequest,
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
      maxRequests: 120,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: AutosaveRequest;
    try {
      body = (await request.json()) as AutosaveRequest;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const context: AutosaveContext = {
      draftId,
      lastKnownUpdatedAt: body.lastKnownUpdatedAt ?? null,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      htmlBody: body.htmlBody,
      textBody: body.textBody,
      attachmentRefs: body.attachmentRefs,
    };

    const input = normalizeAutosaveDraftInput(
      orgId,
      userId,
      role as "owner" | "admin" | "member",
      context,
    );

    const result = await autosaveDraft(input);

    return NextResponse.json({
      draft: result.draft as unknown as Record<string, unknown>,
      stale: result.stale,
    } satisfies AutosaveResponse);
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies DraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts/[id]] PATCH failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies DraftErrorResponse,
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/mailbox/drafts/[id]
 *
 * Discards the draft. Transitions status to DISCARDED.
 * Idempotent: deleting an already-discarded draft succeeds.
 */
export async function DELETE(
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
      maxRequests: 60,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const result = await discardDraft({
      orgId,
      userId,
      role: role as "owner" | "admin" | "member",
      draftId,
    });

    return NextResponse.json(result satisfies DiscardResponse);
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies DraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts/[id]] DELETE failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies DraftErrorResponse,
      { status: 500 },
    );
  }
}
