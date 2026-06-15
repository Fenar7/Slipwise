/**
 * Security checklist:
 * - All inputs validated via Zod schema (patchConnectionSchema)
 * - Unknown request body keys are rejected (strict mode)
 * - Admin-only via requireIntegrationAdminRoute()
 * - Rate-limited per org via RATE_LIMITS.mailboxPolicyUpdate
 * - Org-scoped queries prevent cross-tenant data access
 * - Error messages never leak internal IDs or stack traces
 * - Soft-delete prevents data loss with draft-existence guard
 */

import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getMailboxConnection,
  softDeleteMailboxConnection,
  updateMailboxConnectionSettings,
} from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import { getMailboxSyncRunsByConnectionIds } from "@/lib/mailbox/sync-run-read-service";
import { emitMailboxConnectionEvent } from "@/lib/realtime";
import { patchConnectionSchema } from "@/lib/validation/mailbox";
import { ZodError } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;
    const record = await getMailboxConnection(auth.ctx.orgId, connectionId);
    if (!record) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const syncRuns = await getMailboxSyncRunsByConnectionIds(auth.ctx.orgId, [record.id]);

    return NextResponse.json({
      connection: toMailboxConnectionListItem(record, Date.now(), {
        latestRun: syncRuns.latestRunByConnectionId.get(record.id) ?? null,
        latestCompletedRun:
          syncRuns.latestCompletedRunByConnectionId.get(record.id) ?? null,
      }),
    });
  } catch (error) {
    console.error("[mailbox/connections/:id] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/mailbox/connections/[connectionId]
 *
 * Soft-delete a mailbox connection. Sets deletedAt and status = DISCONNECTED.
 * Denies deletion if the connection has any active email drafts (409).
 * Emits a mailbox_connection_deleted realtime event after commit.
 *
 * Admin-only. Rate-limited per org.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxPolicyUpdate);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;

    let record;
    try {
      record = await softDeleteMailboxConnection(
        auth.ctx.orgId,
        connectionId,
        auth.ctx.userId,
      );
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes("not found")) {
          return NextResponse.json({ error: "Connection not found" }, { status: 404 });
        }
        if (msg.includes("active drafts")) {
          return NextResponse.json(
            { error: "Cannot delete connection with active email drafts" },
            { status: 409 },
          );
        }
        if (msg.includes("already deleted")) {
          return NextResponse.json(
            { error: "Connection is already deleted" },
            { status: 410 },
          );
        }
      }
      throw err;
    }

    // Fire-and-forget realtime event after successful commit.
    void emitMailboxConnectionEvent("mailbox_connection_deleted", {
      id: record.id,
      orgId: auth.ctx.orgId,
    });

    return NextResponse.json({ ok: true, connection: toMailboxConnectionListItem(record) });
  } catch (error) {
    console.error("[mailbox/connections/:id] DELETE failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/mailbox/connections/[connectionId]
 *
 * Update a mailbox connection's display name, visibility policy, and/or
 * notification settings. All fields are optional — only provided fields are
 * updated. Unknown request body keys are rejected.
 *
 * Validates input via Zod (patchConnectionSchema), enforces tenant isolation,
 * logs a CONNECTION_POLICY_UPDATED audit event with previous and new values,
 * emits a mailbox_connection_updated realtime event, and returns the updated
 * connection.
 *
 * Admin-only. Rate-limited per org using mailboxPolicyUpdate limits.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationAdminRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.mailboxPolicyUpdate);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;
    const rawBody = await request.json();

    let parsed;
    try {
      parsed = patchConnectionSchema.parse(
        typeof rawBody === "object" && rawBody !== null ? rawBody : {},
      );
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const message = firstIssue?.message ?? "Invalid request body";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }

    const record = await updateMailboxConnectionSettings({
      orgId: auth.ctx.orgId,
      connectionId,
      actorId: auth.ctx.userId,
      displayName: parsed.displayName,
      visibilityPolicy: parsed.visibilityPolicy,
      notificationSettings: parsed.notificationSettings as Record<string, unknown> | undefined,
    });

    void emitMailboxConnectionEvent("mailbox_connection_updated", {
      id: record.id,
      orgId: auth.ctx.orgId,
    });

    return NextResponse.json({
      ok: true,
      connection: toMailboxConnectionListItem(record),
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    console.error("[mailbox/connections/:id] PATCH failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
