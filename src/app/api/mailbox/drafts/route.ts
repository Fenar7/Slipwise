import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  createOrRestoreDraft,
  listDraftEntries,
  DraftServiceError,
} from "@/lib/mailbox/draft-service";
import {
  normalizeCreateDraftInput,
} from "@/lib/mailbox/compose-context";
import type { ComposeContext } from "@/lib/mailbox/compose-context";
import type { MailboxDraftMode } from "@/lib/mailbox/domain-types";

export interface CreateDraftRequest {
  mailboxConnectionId: string;
  mode: MailboxDraftMode;
  threadId?: string | null;
  replyToMessageId?: string | null;
  fromIdentity?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface CreateDraftResponse {
  draft: Record<string, unknown>;
  created: boolean;
}

export interface ListDraftsResponse {
  drafts: Record<string, unknown>[];
}

export interface DraftErrorResponse {
  error: string;
}

function isValidMode(value: unknown): value is MailboxDraftMode {
  return typeof value === "string" && ["NEW", "REPLY", "REPLY_ALL", "FORWARD"].includes(value);
}

/**
 * POST /api/mailbox/drafts
 *
 * Body: CreateDraftRequest
 *
 * Creates or restores a draft for the given compose context.
 * If an active draft already exists for this context, it is returned instead of creating a duplicate.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId, userId, role } = auth.ctx;

    const rl = await rateLimitByOrg(orgId, {
      maxRequests: 60,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: CreateDraftRequest;
    try {
      body = (await request.json()) as CreateDraftRequest;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.mailboxConnectionId || typeof body.mailboxConnectionId !== "string") {
      return NextResponse.json({ error: "mailboxConnectionId is required" }, { status: 400 });
    }

    if (!isValidMode(body.mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Must be one of: NEW, REPLY, REPLY_ALL, FORWARD" },
        { status: 400 },
      );
    }

    const context: ComposeContext = {
      mode: body.mode,
      mailboxConnectionId: body.mailboxConnectionId,
      threadId: body.threadId ?? null,
      replyToMessageId: body.replyToMessageId ?? null,
      fromIdentity: body.fromIdentity,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      htmlBody: body.htmlBody,
      textBody: body.textBody,
      attachmentRefs: body.attachmentRefs,
    };

    const input = normalizeCreateDraftInput(orgId, userId, role as "owner" | "admin" | "member", context);
    const result = await createOrRestoreDraft(input);

    return NextResponse.json({
      draft: result.draft as unknown as Record<string, unknown>,
      created: result.created,
    } satisfies CreateDraftResponse);
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies DraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts] POST failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies DraftErrorResponse,
      { status: 500 },
    );
  }
}

/**
 * GET /api/mailbox/drafts
 *
 * Query params:
 *   connectionId?: string — filter to a specific mailbox connection
 *
 * Returns active drafts for the current user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const { orgId, userId, role } = auth.ctx;

    const rl = await rateLimitByOrg(orgId, {
      maxRequests: 120,
      window: "60s",
    });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId") ?? undefined;
    const rawSearchQuery = searchParams.get("searchQuery");
    
    // Support stripping in:draft if user explicitly types it (since they are already in drafts)
    let searchQuery = rawSearchQuery?.trim() ?? undefined;
    if (searchQuery) {
      searchQuery = searchQuery.replace(/\bin:drafts?\b/gi, "").trim();
      if (!searchQuery) searchQuery = undefined;
    }

    const drafts = await listDraftEntries({
      orgId,
      userId,
      role: role as "owner" | "admin" | "member",
      mailboxConnectionId: connectionId,
      searchQuery,
    });

    return NextResponse.json({
      drafts: drafts as unknown as Record<string, unknown>[],
    } satisfies ListDraftsResponse);
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return NextResponse.json(
        { error: error.message } satisfies DraftErrorResponse,
        { status: error.statusCode },
      );
    }

    console.error("[mailbox/drafts] GET failed:", error);
    return NextResponse.json(
      { error: "Internal server error" } satisfies DraftErrorResponse,
      { status: 500 },
    );
  }
}
