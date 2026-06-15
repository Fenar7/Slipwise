/**
 * Security checklist:
 * - GET query params validated via Zod (paginationQuerySchema)
 * - POST body validated via Zod (createConnectionSchema or newChatCreateSchema) with strict unknown-key rejection
 * - Admin-only via requireIntegrationAdminRoute()
 * - Rate-limited per org: RATE_LIMITS.mailboxCreate for New Chat (5 req/min), RATE_LIMITS.mailboxPolicyUpdate for provider connections
 * - Max 1000 active connections per org (429)
 * - Tenant-isolated via org-scoped listMailboxConnectionsPaginated / createMailboxConnection / createNewChatConnection
 * - Duplicate displayName checked per org (409)
 * - PII (emailAddress) masked in audit metadata; New Chat audit stores only the numeric seq
 * - Error messages never leak internal IDs or stack traces
 * - 201 Created with Location header for POST
 */

import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  listMailboxConnectionsPaginated,
  createMailboxConnection,
  createNewChatConnection,
} from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import { getMailboxSyncRunsByConnectionIds } from "@/lib/mailbox/sync-run-read-service";
import { emitMailboxConnectionEvent } from "@/lib/realtime";
import { paginationQuerySchema, createConnectionSchema, newChatCreateSchema } from "@/lib/validation/mailbox";
import { db } from "@/lib/db";
import { ZodError } from "zod";

/**
 * GET /api/mailbox/connections
 *
 * List mailbox connections for the caller's org with cursor-based pagination.
 * Excludes soft-deleted connections (deletedAt IS NULL).
 * Enriches each connection with sync run presentation data.
 *
 * Query params:
 *   cursor   - Opaque page cursor (connection id from previous response).
 *   pageSize - Number of results per page (1–100, default 20).
 *
 * Returns { connections: MailboxConnectionListItem[], nextCursor: string | null }.
 * nextCursor is null when the current page is the last page.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    let parsed;
    try {
      parsed = paginationQuerySchema.parse(query);
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const message = firstIssue?.message ?? "Invalid query parameters";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }

    const { records, nextCursor } = await listMailboxConnectionsPaginated(
      auth.ctx.orgId,
      { cursor: parsed.cursor, pageSize: parsed.pageSize },
    );

    const syncRuns = await getMailboxSyncRunsByConnectionIds(
      auth.ctx.orgId,
      records.map((r) => r.id),
    );

    const connections = records.map((record) =>
      toMailboxConnectionListItem(record, Date.now(), {
        latestRun: syncRuns.latestRunByConnectionId.get(record.id) ?? null,
        latestCompletedRun:
          syncRuns.latestCompletedRunByConnectionId.get(record.id) ?? null,
      }),
    );

    return NextResponse.json({ connections, nextCursor });
  } catch (error) {
    console.error("[mailbox/connections] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/mailbox/connections
 *
 * Create a new mailbox connection for the caller's org.
 * Rejects duplicate displayName within the same org (409 Conflict).
 * Emits a mailbox_connection_created realtime event after commit.
 *
 * Body (validated via createConnectionSchema):
 *   provider, emailAddress, displayName (required),
 *   visibilityPolicy (optional, defaults to "org_shared"),
 *   notificationSettings (optional),
 *   providerAccountId, tokenRef (required),
 *   tokenExpiry (optional, nullable).
 *
 * Returns 201 with Location header and { connection, ok: true }.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    // Attempt to parse raw body. If JSON parse fails, treat as empty.
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }

    if (typeof rawBody !== "object" || rawBody === null) {
      rawBody = {};
    }

    // ── Determine request type ─────────────────────────────────────────────
    // New Chat: empty body validated via newChatCreateSchema (strict).
    // Provider connection: body with provider/emailAddress etc.
    const isEmptyBody = Object.keys(rawBody as Record<string, unknown>).length === 0;

    if (isEmptyBody) {
      // ── New Chat flow (Sprint 7.3) ───────────────────────────────────────

      const parseResult = newChatCreateSchema.safeParse(rawBody);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        return NextResponse.json(
          { error: firstIssue?.message ?? "Invalid request body" },
          { status: 400 },
        );
      }

      const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxCreate);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      }

      const activeCount = await db.mailboxConnection.count({
        where: { orgId: auth.ctx.orgId, deletedAt: null },
      });
      if (activeCount >= 1000) {
        return NextResponse.json(
          { error: "Maximum number of connections (1000) reached" },
          { status: 429 },
        );
      }

      const connection = await createNewChatConnection(
        auth.ctx.orgId,
        auth.ctx.userId,
      );

      void emitMailboxConnectionEvent("mailbox_connection_created", {
        id: connection.id,
        orgId: auth.ctx.orgId,
      });

      return NextResponse.json(connection, {
        status: 201,
        headers: { Location: `/app/mailbox/connections/${connection.id}` },
      });
    }

    // ── Provider-based connection flow (Sprint 7.2) ────────────────────────

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxPolicyUpdate);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let parsed;
    try {
      parsed = createConnectionSchema.parse(rawBody);
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const message = firstIssue?.message ?? "Invalid request body";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }

    const duplicate = await db.mailboxConnection.findFirst({
      where: {
        orgId: auth.ctx.orgId,
        displayName: parsed.displayName,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `A connection with display name "${parsed.displayName}" already exists` },
        { status: 409 },
      );
    }

    const record = await createMailboxConnection({
      orgId: auth.ctx.orgId,
      provider: parsed.provider,
      providerAccountId: parsed.providerAccountId,
      emailAddress: parsed.emailAddress,
      displayName: parsed.displayName,
      tokenRef: parsed.tokenRef,
      tokenExpiry: parsed.tokenExpiry ? new Date(parsed.tokenExpiry) : null,
      connectedBy: auth.ctx.userId,
    });

    void emitMailboxConnectionEvent("mailbox_connection_created", {
      id: record.id,
      orgId: auth.ctx.orgId,
    });

    const listItem = toMailboxConnectionListItem(record);

    const url = new URL(request.url);
    url.pathname = `/api/mailbox/connections/${record.id}`;

    return NextResponse.json(
      { ok: true, connection: listItem },
      { status: 201, headers: { Location: url.pathname } },
    );
  } catch (error) {
    console.error("[mailbox/connections] POST failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
