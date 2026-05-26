import "server-only";

import { db } from "@/lib/db";
import type {
  MailboxCoverageFolder,
  MailboxFolderCoverageState,
  MailboxFolderCoverageRecord,
  MailboxFolderCoverageSummary,
  MailboxOverallCoverage,
} from "./domain-types";
import {
  computeOverallCoverage,
  MAILBOX_FOLDER_COVERAGE_FOLDERS,
  GMAIL_REQUIRED_COVERAGE_FOLDERS,
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
  params: GetFolderCoverageParams,
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
  }));

  return {
    coverages,
    overallState: computeOverallCoverage(coverages),
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
    lastAdvancedCursor,
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
    lastAdvancedCursor,
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
): Promise<boolean> {
  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId,
      mailboxConnectionId: connectionId,
      folder: { in: GMAIL_REQUIRED_COVERAGE_FOLDERS },
      state: "COMPLETE",
    },
    select: { folder: true },
  })) as Array<{ folder: string }>;

  const completeSet = new Set(rows.map((r) => r.folder));
  return GMAIL_REQUIRED_COVERAGE_FOLDERS.every((f) => completeSet.has(f));
}

export async function getIncompleteRequiredFolders(
  orgId: string,
  connectionId: string,
): Promise<MailboxCoverageFolder[]> {
  const rows = (await db.mailboxFolderCoverage.findMany({
    where: {
      orgId,
      mailboxConnectionId: connectionId,
      folder: { in: GMAIL_REQUIRED_COVERAGE_FOLDERS },
      state: "COMPLETE",
    },
    select: { folder: true },
  })) as Array<{ folder: string }>;

  const completeSet = new Set(rows.map((r) => r.folder));
  return GMAIL_REQUIRED_COVERAGE_FOLDERS.filter((f) => !completeSet.has(f));
}

// ── Batch Read ──

export interface BatchFolderCoverageResult {
  coveragesByConnectionId: Map<string, GetFolderCoverageResult>;
}

/** Batch fetch coverage for multiple connections. */
export async function getBatchMailboxFolderCoverage(
  orgId: string,
  connectionIds: string[],
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
    }));
    result.set(connId, {
      coverages,
      overallState: computeOverallCoverage(coverages),
    });
  }

  return { coveragesByConnectionId: result };
}
