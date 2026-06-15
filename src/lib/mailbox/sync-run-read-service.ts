import "server-only";

import { db } from "@/lib/db";
import type { MailboxSyncRunRecord } from "./domain-types";
import { isSchemaDriftError } from "@/lib/prisma-errors";

const MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES = 30;

async function cleanStaleSyncRunsForConnections(
  orgId: string,
  connectionIds: string[],
): Promise<void> {
  if (!db.mailboxSyncRun || connectionIds.length === 0) return;
  const cutoff = new Date(Date.now() - MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES * 60 * 1000);
  try {
    await db.mailboxSyncRun.updateMany({
      where: {
        orgId,
        mailboxConnectionId: { in: connectionIds },
        status: "RUNNING",
        startedAt: { lt: cutoff },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCategory: "unknown",
        errorSummary: "Sync run abandoned — did not complete within expected time",
      },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) return;
    throw error;
  }
}

function toSyncRunRecord(
  row: {
    id: string;
    orgId: string;
    mailboxConnectionId: string;
    provider: MailboxSyncRunRecord["provider"];
    status: MailboxSyncRunRecord["status"];
    triggerSource: MailboxSyncRunRecord["triggerSource"];
    syncMode: MailboxSyncRunRecord["syncMode"];
    startedAt: Date;
    completedAt: Date | null;
    errorCategory: string | null;
    errorSummary: string | null;
    stats: unknown;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  },
): MailboxSyncRunRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    provider: row.provider,
    status: row.status,
    triggerSource: row.triggerSource,
    syncMode: row.syncMode,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorCategory: row.errorCategory,
    errorSummary: row.errorSummary,
    stats:
      row.stats != null &&
      typeof row.stats === "object" &&
      !Array.isArray(row.stats)
        ? (row.stats as Record<string, unknown>)
        : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getMailboxSyncRunsByConnectionIds(
  orgId: string,
  connectionIds: string[],
): Promise<{
  latestRunByConnectionId: Map<string, MailboxSyncRunRecord>;
  latestCompletedRunByConnectionId: Map<string, MailboxSyncRunRecord>;
}> {
  const latestRunByConnectionId = new Map<string, MailboxSyncRunRecord>();
  const latestCompletedRunByConnectionId = new Map<string, MailboxSyncRunRecord>();

  if (connectionIds.length === 0) {
    return { latestRunByConnectionId, latestCompletedRunByConnectionId };
  }

  if (!db.mailboxSyncRun) {
    return { latestRunByConnectionId, latestCompletedRunByConnectionId };
  }

  await cleanStaleSyncRunsForConnections(orgId, connectionIds);

  let rows: Awaited<ReturnType<typeof db.mailboxSyncRun.findMany>> = [];
  try {
    rows = await db.mailboxSyncRun.findMany({
      where: {
        orgId,
        mailboxConnectionId: { in: connectionIds },
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        orgId: true,
        mailboxConnectionId: true,
        provider: true,
        status: true,
        triggerSource: true,
        syncMode: true,
        startedAt: true,
        completedAt: true,
        errorCategory: true,
        errorSummary: true,
        stats: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox] getMailboxSyncRunsByConnectionIds skipped: mailbox_sync_run schema drift — run prisma migrate deploy",
      );
      return { latestRunByConnectionId, latestCompletedRunByConnectionId };
    }
    throw error;
  }

  for (const row of rows) {
    const mapped = toSyncRunRecord(row);

    if (!latestRunByConnectionId.has(mapped.mailboxConnectionId)) {
      latestRunByConnectionId.set(mapped.mailboxConnectionId, mapped);
    }

    if (
      mapped.status === "COMPLETED" &&
      !latestCompletedRunByConnectionId.has(mapped.mailboxConnectionId)
    ) {
      latestCompletedRunByConnectionId.set(mapped.mailboxConnectionId, mapped);
    }
  }

  return { latestRunByConnectionId, latestCompletedRunByConnectionId };
}
