import "server-only";

import { db } from "@/lib/db";
import type {
  MailboxCoverageFolder,
  MailboxFolderCoverageState,
  MailboxFolderCoverageRecord,
  MailboxFolderCoverageSummary,
  MailboxOverallCoverage,
} from "./domain-types";
import type { MailboxProvider } from "./domain-types";
import {
  computeOverallCoverage,
  getRequiredCoverageFolders,
  MAILBOX_FOLDER_COVERAGE_FOLDERS,
} from "./domain-types";

// ── Read ──

export interface GetFolderCoverageParams {
  orgId: string;
  connectionId: string;
}

export interface GetFolderCoverageResult {
  coverages: MailboxFolderCoverageSummary[];
  overallState: MailboxOverallCoverage;
}

export async function getMailboxFolderCoverage(
  params: GetFolderCoverageParams & { provider?: MailboxProvider },
): Promise<GetFolderCoverageResult> {
  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId: params.orgId,
      mailboxConnectionId: params.connectionId,
    },
    orderBy: { folder: "asc" },
  })) as MailboxFolderCoverageRecord[];

  const coverages: MailboxFolderCoverageSummary[] = rows.map((r) => ({
    folder: r.folder,
    state: r.state as MailboxFolderCoverageState,
    totalThreads: r.totalThreads,
    lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
    errorSummary: r.errorSummary,
    lastAdvancedCursor: r.lastAdvancedCursor,
  }));

  return {
    coverages,
    overallState: computeOverallCoverage(coverages, params.provider ?? "GMAIL" as MailboxProvider),
  };
}

export async function getFolderCoverage(
  orgId: string,
  connectionId: string,
  folder: string,
): Promise<MailboxFolderCoverageSummary | null> {
  const row = (await db.mailboxFolderCoverage.findUnique({
    where: {
      orgId_mailboxConnectionId_folder: {
        orgId,
        mailboxConnectionId: connectionId,
        folder,
      },
    },
  })) as MailboxFolderCoverageRecord | null;

  if (!row) return null;

  return {
    folder: row.folder,
    state: row.state as MailboxFolderCoverageState,
    totalThreads: row.totalThreads,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary,
    lastAdvancedCursor: row.lastAdvancedCursor,
  };
}

// ── Write ──

export interface UpsertFolderCoverageParams {
  orgId: string;
  connectionId: string;
  folder: MailboxCoverageFolder;
  state: MailboxFolderCoverageState;
  lastAdvancedCursor?: string | null;
  totalThreads?: number;
  errorSummary?: string | null;
}

export async function upsertFolderCoverage(
  params: UpsertFolderCoverageParams,
): Promise<void> {
  const data: Record<string, unknown> = {
    state: params.state,
    updatedAt: new Date(),
  };

  if (params.lastAdvancedCursor !== undefined) {
    data.lastAdvancedCursor = params.lastAdvancedCursor;
  }
  if (params.totalThreads !== undefined) {
    data.totalThreads = params.totalThreads;
  }
  if (params.errorSummary !== undefined) {
    data.errorSummary = params.errorSummary;
  }
  if (params.state === "COMPLETE") {
    data.lastCompletedAt = new Date();
  }

  await db.mailboxFolderCoverage.upsert({
    where: {
      orgId_mailboxConnectionId_folder: {
        orgId: params.orgId,
        mailboxConnectionId: params.connectionId,
        folder: params.folder,
      },
    },
    create: {
      orgId: params.orgId,
      mailboxConnectionId: params.connectionId,
      folder: params.folder,
      state: params.state,
      lastAdvancedCursor: params.lastAdvancedCursor ?? null,
      totalThreads: params.totalThreads ?? 0,
      lastCompletedAt: params.state === "COMPLETE" ? new Date() : null,
      errorSummary: params.errorSummary ?? null,
    },
    update: data,
  });
}

export async function initFolderCoverageForBootstrap(
  orgId: string,
  connectionId: string,
): Promise<void> {
  for (const folder of MAILBOX_FOLDER_COVERAGE_FOLDERS) {
    await db.mailboxFolderCoverage.upsert({
      where: {
        orgId_mailboxConnectionId_folder: {
          orgId,
          mailboxConnectionId: connectionId,
          folder,
        },
      },
      create: {
        orgId,
        mailboxConnectionId: connectionId,
        folder,
        state: "PENDING",
      },
      update: { updatedAt: new Date() },
    });
  }
}

export async function markFolderCoverageComplete(
  orgId: string,
  connectionId: string,
  folder: MailboxCoverageFolder,
  totalThreads: number,
  lastAdvancedCursor: string,
): Promise<void> {
  await upsertFolderCoverage({
    orgId,
    connectionId,
    folder,
    state: "COMPLETE",
    totalThreads,
    lastAdvancedCursor: lastAdvancedCursor || null,
  });
}

export async function updateFolderCoverageBootstrapping(
  orgId: string,
  connectionId: string,
  folder: MailboxCoverageFolder,
  totalThreads: number,
  lastAdvancedCursor: string,
): Promise<void> {
  await upsertFolderCoverage({
    orgId,
    connectionId,
    folder,
    state: "BOOTSTRAPPING",
    totalThreads,
    lastAdvancedCursor: lastAdvancedCursor || null,
  });
}

/**
 * Reset the per-folder coverage cursor without changing the state.
 * Used when a stored cursor becomes stale/invalid (e.g. stored a historyId
 * instead of a page token) so the next recovery attempt starts fresh.
 */
export async function resetFolderCoverageCursor(
  orgId: string,
  connectionId: string,
  folder: MailboxCoverageFolder,
): Promise<void> {
  await upsertFolderCoverage({
    orgId,
    connectionId,
    folder,
    state: "BOOTSTRAPPING",
    lastAdvancedCursor: null,
  });
}

export async function markFolderCoverageErrored(
  orgId: string,
  connectionId: string,
  folder: MailboxCoverageFolder,
  errorSummary: string,
): Promise<void> {
  await upsertFolderCoverage({
    orgId,
    connectionId,
    folder,
    state: "ERRORED",
    errorSummary,
  });
}

export async function isMailboxCoverageComplete(
  orgId: string,
  connectionId: string,
  provider?: MailboxProvider,
): Promise<boolean> {
  const requiredFolders = getRequiredCoverageFolders(provider ?? "GMAIL" as MailboxProvider);
  if (requiredFolders.length === 0) return true;

  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId,
      mailboxConnectionId: connectionId,
      folder: { in: requiredFolders },
      state: "COMPLETE",
    },
    select: { folder: true },
  })) as Array<{ folder: string }>;

  const completeSet = new Set(rows.map((r) => r.folder));
  return requiredFolders.every((f) => completeSet.has(f));
}

export async function getIncompleteRequiredFolders(
  orgId: string,
  connectionId: string,
  provider?: MailboxProvider,
): Promise<MailboxCoverageFolder[]> {
  const requiredFolders = getRequiredCoverageFolders(provider ?? "GMAIL" as MailboxProvider);
  if (requiredFolders.length === 0) return [];

  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId,
      mailboxConnectionId: connectionId,
      folder: { in: requiredFolders },
      state: "COMPLETE",
    },
    select: { folder: true },
  })) as Array<{ folder: string }>;

  const completeSet = new Set(rows.map((r) => r.folder));
  return requiredFolders.filter((f) => !completeSet.has(f));
}

// ── Batch Read ──

export interface BatchFolderCoverageResult {
  coveragesByConnectionId: Map<string, GetFolderCoverageResult>;
}

/** Batch fetch coverage for multiple connections. */
export async function getBatchMailboxFolderCoverage(
  orgId: string,
  connectionIds: string[],
  connectionProviders?: Map<string, MailboxProvider>,
): Promise<BatchFolderCoverageResult> {
  if (connectionIds.length === 0) {
    return { coveragesByConnectionId: new Map() };
  }

  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId,
      mailboxConnectionId: { in: connectionIds },
    },
    orderBy: { folder: "asc" },
  })) as MailboxFolderCoverageRecord[];

  const byConnection = new Map<string, MailboxFolderCoverageRecord[]>();
  for (const row of rows) {
    const list = byConnection.get(row.mailboxConnectionId) ?? [];
    list.push(row);
    byConnection.set(row.mailboxConnectionId, list);
  }

  const result = new Map<string, GetFolderCoverageResult>();
  for (const connId of connectionIds) {
    const connRows = byConnection.get(connId) ?? [];
    const coverages: MailboxFolderCoverageSummary[] = connRows.map((r) => ({
      folder: r.folder,
      state: r.state as MailboxFolderCoverageState,
      totalThreads: r.totalThreads,
      lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
      errorSummary: r.errorSummary,
      lastAdvancedCursor: r.lastAdvancedCursor,
    }));
    const provider = connectionProviders?.get(connId) ?? "GMAIL" as MailboxProvider;
    result.set(connId, {
      coverages,
      overallState: computeOverallCoverage(coverages, provider),
    });
  }

  return { coveragesByConnectionId: result };
}
