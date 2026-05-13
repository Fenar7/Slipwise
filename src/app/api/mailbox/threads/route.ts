import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxThreads } from "@/lib/mailbox/thread-service";
import type { MailboxThreadStatus } from "@/lib/mailbox/domain-types";

const VALID_STATUSES: MailboxThreadStatus[] = ["OPEN", "PENDING", "CLOSED", "ARCHIVED"];
const MAX_LIMIT = 100;

/** Unsupported folder statuses that should yield empty results. */
const UNSUPPORTED_STATUSES = new Set(["DRAFT", "SPAM"]);

function parseStatusParam(
  searchParams: URLSearchParams,
): MailboxThreadStatus | MailboxThreadStatus[] | undefined {
  const value = searchParams.get("status");
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  const validParts = parts.filter((p) =>
    (VALID_STATUSES as string[]).includes(p),
  ) as MailboxThreadStatus[];
  if (validParts.length === 0) return undefined;
  if (validParts.length === 1) return validParts[0];
  return validParts;
}

function parseQueryParam(
  searchParams: URLSearchParams,
  key: string,
): string | undefined {
  const value = searchParams.get(key);
  return value ?? undefined;
}

function parseBooleanParam(
  searchParams: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = searchParams.get(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseNumberParam(
  searchParams: URLSearchParams,
  key: string,
  max: number,
): number | undefined {
  const value = searchParams.get(key);
  if (!value) return undefined;
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 1) return undefined;
  return Math.min(num, max);
}

/**
 * GET /api/mailbox/threads
 *
 * Query params:
 *   connectionId?: string    — filter to specific mailbox (omit for all-inboxes)
 *   status?: string          — "OPEN" | "PENDING" | "CLOSED" | "ARCHIVED"
 *   unreadOnly?: "true"      — only threads with unread messages
 *   isFlagged?: "true"       — only flagged threads
 *   assignee?: string        — "me" | "none"
 *   cursor?: string          — pagination cursor
 *   limit?: number           — page size (default 50, max 100)
 *
 * Returns:
 *   { threads: MailboxThreadReadShape[], nextCursor: string | null, totalCount: number }
 *
 * Auth: any authenticated org member. Permission-scoped at service layer.
 * Rate-limited per org.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);

    const connectionId = parseQueryParam(searchParams, "connectionId");
    const status = parseStatusParam(searchParams);
    const unreadOnly = parseBooleanParam(searchParams, "unreadOnly");
    const isFlagged = parseBooleanParam(searchParams, "isFlagged");
    const assigneeFilter = parseQueryParam(searchParams, "assignee") as
      | "me"
      | "none"
      | undefined;
    const cursor = parseQueryParam(searchParams, "cursor") ?? undefined;
    const limit = parseNumberParam(searchParams, "limit", MAX_LIMIT);

    if (assigneeFilter && assigneeFilter !== "me" && assigneeFilter !== "none") {
      return NextResponse.json(
        { error: "Invalid assignee filter. Use 'me' or 'none'." },
        { status: 400 },
      );
    }

    // Short-circuit for unsupported folder types (drafts, spam) — yield empty
    const rawStatus = searchParams.get("status");
    if (rawStatus && UNSUPPORTED_STATUSES.has(rawStatus)) {
      return NextResponse.json({ threads: [], totalCount: 0, nextCursor: null });
    }

    const result = await listMailboxThreads({
      orgId: auth.ctx.orgId,
      userId: auth.ctx.userId,
      role: auth.ctx.role,
      connectionId,
      status,
      unreadOnly,
      isFlagged,
      assigneeFilter,
      cursor,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[mailbox/threads] GET failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
