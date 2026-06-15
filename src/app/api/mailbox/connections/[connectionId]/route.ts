import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationAdminRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import {
  getMailboxConnection,
  disableMailboxConnection,
} from "@/lib/mailbox/connection-service";
import { toMailboxConnectionListItem } from "@/lib/mailbox/admin-shapes";
import { getMailboxSyncRunsByConnectionIds } from "@/lib/mailbox/sync-run-read-service";
import { logMailboxAuditTx } from "@/lib/mailbox/audit";
import type { MailboxConnectionRecord, MailboxVisibilityPolicy } from "@/lib/mailbox/domain-types";

const ALLOWED_POLICIES: MailboxVisibilityPolicy[] = [
  "org_shared",
  "restricted",
  "admin_only",
];

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
 * Admin governance action: soft-disable a mailbox connection.
 * Sets status = DISCONNECTED and emits a governance audit event.
 *
 * This is a provider-agnostic disable. It does NOT revoke OAuth tokens at the
 * provider level — use the provider-specific disconnect routes for that.
 * Use this route when an admin needs to immediately disable a connection
 * regardless of provider (e.g., security incident, org offboarding).
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

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { connectionId } = await params;

    let record: MailboxConnectionRecord;
    try {
      record = await disableMailboxConnection(
        auth.ctx.orgId,
        connectionId,
        auth.ctx.userId,
      );
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, connection: toMailboxConnectionListItem(record) });
  } catch (error) {
    console.error("[mailbox/connections/:id] DELETE failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/mailbox/connections/[connectionId]
 *
 * Admin governance action: update a mailbox connection's display name and/or
 * visibility policy. Both fields are optional — only provided fields are updated.
 *
 * Validates input, enforces tenant isolation via org-scoped findFirst,
 * logs a CONNECTION_POLICY_UPDATED audit event with previous and new values,
 * and returns the updated connection.
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
    const body: Record<string, unknown> =
      typeof rawBody === "object" && rawBody !== null ? rawBody : {};

    let displayName: string | undefined;
    let visibilityPolicy: string | undefined;

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== "string") {
        return NextResponse.json({ error: "displayName must be a string" }, { status: 400 });
      }
      displayName = body.displayName.trim();
      if (displayName.length === 0) {
        return NextResponse.json({ error: "displayName must not be empty" }, { status: 400 });
      }
      if (displayName.length > 100) {
        return NextResponse.json({ error: "displayName must be at most 100 characters" }, { status: 400 });
      }
    }

    if (body.visibilityPolicy !== undefined) {
      if (typeof body.visibilityPolicy !== "string") {
        return NextResponse.json({ error: "visibilityPolicy must be a string" }, { status: 400 });
      }
      visibilityPolicy = body.visibilityPolicy;
      if (!(ALLOWED_POLICIES as string[]).includes(visibilityPolicy)) {
        return NextResponse.json({ error: "Invalid visibilityPolicy value" }, { status: 400 });
      }
    }

    if (displayName === undefined && visibilityPolicy === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      const existing = await tx.mailboxConnection.findFirst({
        where: { id: connectionId, orgId: auth.ctx.orgId },
      });
      if (!existing) {
        throw new Error("Connection not found");
      }

      const updateData: Record<string, unknown> = {};
      const metadata: Record<string, unknown> = {};
      const summaryParts: string[] = [];

      if (displayName !== undefined && displayName !== existing.displayName) {
        updateData.displayName = displayName;
        metadata.previousDisplayName = existing.displayName;
        metadata.newDisplayName = displayName;
        summaryParts.push(`display name updated from "${existing.displayName}" to "${displayName}"`);
      }

      if (visibilityPolicy !== undefined && visibilityPolicy !== existing.visibilityPolicy) {
        updateData.visibilityPolicy = visibilityPolicy;
        metadata.previousVisibilityPolicy = existing.visibilityPolicy;
        metadata.newVisibilityPolicy = visibilityPolicy;
        summaryParts.push(`visibility policy changed to "${visibilityPolicy}"`);
      }

      if (Object.keys(updateData).length === 0) return;

      await tx.mailboxConnection.update({
        where: { id: existing.id },
        data: updateData,
      });

      await logMailboxAuditTx(tx, {
        orgId: auth.ctx.orgId,
        actorId: auth.ctx.userId,
        action: "CONNECTION_POLICY_UPDATED",
        summary: `Mailbox connection ${summaryParts.join("; ")}`,
        mailboxConnectionId: existing.id,
        metadata,
      });
    });

    const record = await getMailboxConnection(auth.ctx.orgId, connectionId);
    if (!record) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

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
