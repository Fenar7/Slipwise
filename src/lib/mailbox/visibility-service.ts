import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
  MailboxVisibilityPolicy,
  MailboxAccessResolution,
} from "./domain-types";
import {
  resolveMailboxAccessLevel,
  canAccessMailbox,
} from "./domain-types";
import { listMailboxConnections, getMailboxConnection } from "./connection-service";
import { toMailboxConnectionListItem } from "./admin-shapes";
import { toMailboxRestrictedSummary } from "./read-shapes";
import { logMailboxAuditTx } from "./audit";
import type { MailboxConnectionListItem } from "./admin-shapes";
import type { MailboxRestrictedSummary } from "./read-shapes";
import { getMailboxSyncRunsByConnectionIds } from "./sync-run-read-service";
import { getBatchMailboxFolderCoverage } from "./folder-coverage-service";

/**
 * Compute the effective access resolution for a user on a specific connection.
 * Loads the connection record from DB (org-scoped). Returns null if the
 * connection doesn't exist for this org.
 */
export async function getMailboxAccessResolution(
  orgId: string,
  connectionId: string,
  userId: string,
  role: "owner" | "admin" | "member",
): Promise<MailboxAccessResolution | null> {
  const record = await getMailboxConnection(orgId, connectionId);
  if (!record) {
    return null;
  }

  const visibilityPolicy =
    (record.visibilityPolicy as MailboxVisibilityPolicy) ?? "org_shared";

  return resolveMailboxAccessLevel({
    connectionId,
    orgId,
    userId,
    role,
    connectionStatus: record.status,
    visibilityPolicy,
  });
}

/**
 * List all mailbox connections an org member can see, segmented by access level.
 *
 * Returns:
 * - accessible: MailboxConnectionListItem[] — connections the user can access
 *   (accessLevel "full" or "read_only")
 * - restricted: MailboxRestrictedSummary[] — connections the user can see
 *   but cannot access (accessLevel "none")
 *
 * Admins/owners see all connections as "accessible" (full).
 * Members see connections per their resolved access level.
 */
export async function listMailboxConnectionsForMember(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
): Promise<{
  accessible: MailboxConnectionListItem[];
  restricted: MailboxRestrictedSummary[];
}> {
  const records = await listMailboxConnections(orgId);
  const syncRuns = await getMailboxSyncRunsByConnectionIds(
    orgId,
    records.map((record) => record.id),
  );

  const accessible: MailboxConnectionListItem[] = [];
  const restricted: MailboxRestrictedSummary[] = [];

  let batchCoverage: Awaited<ReturnType<typeof getBatchMailboxFolderCoverage>> | null = null;
  try {
    batchCoverage = await getBatchMailboxFolderCoverage(
      orgId,
      records.map((r) => r.id),
    );
  } catch {
    // Table may not exist yet (pending migration); skip coverage enrichment
    batchCoverage = null;
  }

  for (const record of records) {
    const visibilityPolicy =
      (record.visibilityPolicy as MailboxVisibilityPolicy) ?? "org_shared";

    const resolution = resolveMailboxAccessLevel({
      connectionId: record.id,
      orgId,
      userId,
      role,
      connectionStatus: record.status,
      visibilityPolicy,
    });

    if (canAccessMailbox(resolution)) {
      const coverage = batchCoverage?.coveragesByConnectionId.get(record.id);
      const listItem = toMailboxConnectionListItem(record, Date.now(), {
        latestRun: syncRuns.latestRunByConnectionId.get(record.id) ?? null,
        latestCompletedRun:
          syncRuns.latestCompletedRunByConnectionId.get(record.id) ?? null,
      });
      // Attach folder coverage to the sync presentation on the list item.
      // When real folder coverage exists, override staleGmailCoverage so the
      // UI truthfully reflects actual completion instead of legacy metadata.
      if (coverage && coverage.coverages.length > 0 && listItem.sync) {
        const hasStale = coverage.overallState !== "COMPLETE";
        listItem.sync = {
          ...listItem.sync,
          staleGmailCoverage: hasStale,
          folderCoverage: {
            overallState: coverage.overallState,
            coverages: coverage.coverages.map((c) => ({
              folder: c.folder,
              state: c.state,
              totalThreads: c.totalThreads,
            })),
          },
        };
      }
      accessible.push(listItem);
    } else {
      const reason: MailboxRestrictedSummary["restrictionReason"] =
        record.status === "DISCONNECTED" ? "mailbox_disabled" : "no_permission";
      restricted.push(toMailboxRestrictedSummary(record, reason));
    }
  }

  return { accessible, restricted };
}

/**
 * Admin governance: update the visibility policy for a connection.
 * Emits audit event. Org-safe: verifies ownership inside transaction.
 *
 * @throws Error if connection not found for org.
 */
export async function setMailboxVisibilityPolicy(
  orgId: string,
  connectionId: string,
  policy: MailboxVisibilityPolicy,
  actorId: string,
): Promise<MailboxConnectionListItem> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: connectionId, orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(
        `MailboxConnection ${connectionId} not found for org ${orgId}`,
      );
    }

    await tx.mailboxConnection.update({
      where: { id: existing.id },
      data: {
        visibilityPolicy: policy,
      },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId,
      action: "CONNECTION_POLICY_UPDATED",
      summary: `Visibility policy set to ${policy}`,
      mailboxConnectionId: existing.id,
      metadata: { policy },
    });
  });

  const updated = await getMailboxConnection(orgId, connectionId);
  if (!updated) {
    throw new Error(
      `MailboxConnection ${connectionId} not found for org ${orgId} after policy update`,
    );
  }

  return toMailboxConnectionListItem(updated);
}
