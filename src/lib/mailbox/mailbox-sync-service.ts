import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logMailboxAudit } from "./audit";
import { getMailboxConnection } from "./connection-service";
import { getMailboxCursor, upsertMailboxCursor, deleteMailboxCursors } from "./cursor-service";
import {
  mailboxCanSync,
  cursorIsValidForDelta,
  watchIsExpired,
} from "./domain-types";
import type { MailboxSyncTriggerSource, MailboxSyncMode } from "./domain-types";
import {
  upsertMailboxAttachment,
  upsertMailboxMessage,
  upsertMailboxThread,
  updateMailboxThreadSummary,
} from "./ingestion-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";
import type { MailboxProviderError, MailboxThreadEnvelope } from "./provider-contracts";
import {
  markFolderCoverageComplete,
  updateFolderCoverageBootstrapping,
  initFolderCoverageForBootstrap,
} from "./folder-coverage-service";
import {
  classifyProviderError,
  resolveStatusAfterFailure,
  resolveStatusAfterSuccess,
  isReplayRequired,
} from "./sync-failure-model";
import { deriveThreadParticipants } from "./participant-service";
import {
  deriveThreadLastMessageAt,
  deriveThreadPreviewSnippet,
  computeThreadAttachmentCount,
} from "./normalization-service";
import type { MailboxMessageRecord } from "./domain-types";

export interface RunMailboxSyncParams {
  orgId: string;
  connectionId: string;
  actorId: string;
  /** Why this sync was triggered. Defaults to MANUAL. */
  triggerSource?: MailboxSyncTriggerSource;
  /** Force a specific sync mode. If omitted, auto-resolved from cursor state. */
  syncMode?: MailboxSyncMode;
}

export interface RunMailboxSyncResult {
  success: boolean;
  runId: string;
  threadCount: number;
  messageCount: number;
  syncMode: MailboxSyncMode;
  triggerSource: MailboxSyncTriggerSource;
  error?: {
    category: string;
    summary: string;
  };
}

const MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES = 30;
const MAILBOX_SYNC_LEASE_DURATION_MS = MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES * 60 * 1000;
const GMAIL_REQUIRED_FOLDER_COVERAGE = ["INBOX", "SENT", "SPAM", "DRAFT"] as const;
const GMAIL_FOLDER_COVERAGE_VERSION = 4;

function toMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}

function mergeWatchMetadata(
  current: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(toMetadataRecord(current) ?? {}),
    ...patch,
  };
}

function hasRequiredGmailCoverage(metadata: unknown): boolean {
  const record = toMetadataRecord(metadata);
  if (!record) return false;

  const version = record.gmailCoverageVersion;
  if (typeof version !== "number" || version < GMAIL_FOLDER_COVERAGE_VERSION) {
    return false;
  }

  const coveredLabels = record.gmailCoveredSystemLabels;
  if (!Array.isArray(coveredLabels)) {
    return false;
  }

  const coveredSet = new Set(
    coveredLabels.filter((value): value is string => typeof value === "string"),
  );
  return GMAIL_REQUIRED_FOLDER_COVERAGE.every((label) => coveredSet.has(label));
}

function withRequiredGmailCoverage(metadata: unknown): Record<string, unknown> {
  return mergeWatchMetadata(metadata, {
    gmailCoverageVersion: GMAIL_FOLDER_COVERAGE_VERSION,
    gmailCoveredSystemLabels: [...GMAIL_REQUIRED_FOLDER_COVERAGE],
    gmailCoverageRecoveredAt: new Date().toISOString(),
  });
}

async function ingestSyncedThreads(params: {
  orgId: string;
  connectionId: string;
  mailboxEmail: string;
  tokenRef: string;
  adapter: ReturnType<typeof getMailboxProviderAdapter>;
  threads: MailboxThreadEnvelope[];
}): Promise<{ threadCount: number; messageCount: number }> {
  let messageCount = 0;

  for (const threadEnvelope of params.threads) {
    const thread = await upsertMailboxThread({
      orgId: params.orgId,
      mailboxConnectionId: params.connectionId,
      envelope: threadEnvelope,
    });
    const detail = await params.adapter.fetchThreadDetail({
      orgId: params.orgId,
      tokenRef: params.tokenRef,
      providerThreadId: threadEnvelope.providerThreadId,
    });
    if (isMailboxProviderError(detail)) {
      throw toProviderErrorException(detail);
    }

    const threadMessages: MailboxMessageRecord[] = [];
    for (const messageEnvelope of detail.messages) {
      const message = await upsertMailboxMessage({
        orgId: params.orgId,
        threadId: thread.id,
        envelope: messageEnvelope,
        mailboxEmail: params.mailboxEmail,
      });
      messageCount += 1;
      threadMessages.push(message);
      for (const attachment of messageEnvelope.attachments ?? []) {
        await upsertMailboxAttachment({
          messageId: message.id,
          envelope: attachment,
        });
      }
    }

    const participantsSummary = deriveThreadParticipants(threadMessages);
    const lastMessageAt = deriveThreadLastMessageAt(
      threadMessages,
      thread.lastMessageAt,
    );
    const previewSnippet = deriveThreadPreviewSnippet(threadMessages);
    const attachmentCount = computeThreadAttachmentCount(threadMessages);
    await updateMailboxThreadSummary({
      orgId: params.orgId,
      threadId: thread.id,
      participantsSummary: participantsSummary as unknown as Prisma.InputJsonValue,
      lastMessageAt,
      previewSnippet,
      attachmentCount,
    });
  }

  return {
    threadCount: params.threads.length,
    messageCount,
  };
}

async function ingestSyncedDrafts(params: {
  orgId: string;
  connectionId: string;
  mailboxEmail: string;
  drafts: import("./provider-contracts").MailboxDraftEnvelope[];
}): Promise<{ threadCount: number; messageCount: number }> {
  let messageCount = 0;
  const syncedThreadIds = new Set<string>();

  for (const draftEnvelope of params.drafts) {
    const thread = await upsertMailboxThread({
      orgId: params.orgId,
      mailboxConnectionId: params.connectionId,
      envelope: draftEnvelope.thread,
    });
    syncedThreadIds.add(thread.id);

    const message = await upsertMailboxMessage({
      orgId: params.orgId,
      threadId: thread.id,
      envelope: draftEnvelope.message,
      mailboxEmail: params.mailboxEmail,
    });
    messageCount += 1;

    for (const attachment of draftEnvelope.message.attachments ?? []) {
      await upsertMailboxAttachment({
        messageId: message.id,
        envelope: attachment,
      });
    }

    await updateMailboxThreadSummary({
      orgId: params.orgId,
      threadId: thread.id,
      participantsSummary: deriveThreadParticipants([message]) as unknown as Prisma.InputJsonValue,
      lastMessageAt: deriveThreadLastMessageAt([message], thread.lastMessageAt),
      previewSnippet: deriveThreadPreviewSnippet([message]),
      attachmentCount: computeThreadAttachmentCount([message]),
    });
  }

  return {
    threadCount: syncedThreadIds.size,
    messageCount,
  };
}

function hasDraftLabel(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const labelIds = (metadata as Record<string, unknown>).labelIds;
  return Array.isArray(labelIds) && labelIds.includes("DRAFT");
}

function removeDraftLabel(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const next = { ...(metadata as Record<string, unknown>) };
  const labelIds = Array.isArray(next.labelIds)
    ? next.labelIds.filter((value): value is string => typeof value === "string" && value !== "DRAFT")
    : [];
  next.labelIds = labelIds;
  delete next.gmailDraftId;
  return next;
}

async function reconcileProviderDraftMarkers(params: {
  orgId: string;
  connectionId: string;
  activeDraftIds: string[];
  /** Draft IDs that failed to fetch in this sync run. Their DRAFT labels
   * must NOT be removed — they likely still exist on the provider. */
  failedDraftIds?: string[];
}): Promise<void> {
  const rows = await db.mailboxMessage.findMany({
    where: {
      orgId: params.orgId,
      thread: {
        mailboxConnectionId: params.connectionId,
      },
    },
    select: {
      id: true,
      providerMessageId: true,
      providerMetadata: true,
    },
  });

  const activeSet = new Set(params.activeDraftIds);
  const failedSet = new Set(params.failedDraftIds ?? []);
  const staleRows = rows.filter(
    (row) => {
      if (!hasDraftLabel(row.providerMetadata)) return false;
      const metadata = row.providerMetadata as Record<string, unknown> | null;
      const gmailDraftId =
        metadata && typeof metadata.gmailDraftId === "string"
          ? metadata.gmailDraftId
          : null;
      const candidateId = gmailDraftId ?? row.providerMessageId;
      // Do NOT remove DRAFT label if the draft failed to fetch this run
      // (it likely still exists on the provider).
      if (failedSet.has(candidateId) || (gmailDraftId && failedSet.has(gmailDraftId))) {
        return false;
      }
      return !activeSet.has(candidateId);
    },
  );

  for (const row of staleRows) {
    await db.mailboxMessage.update({
      where: { id: row.id },
      data: {
        providerMetadata: removeDraftLabel(row.providerMetadata) as Prisma.InputJsonValue,
      },
    });
  }
}

/**
 * Check whether a sync is already running for this mailbox.
 * Uses the database as the source of truth so the guard is mailbox-scoped
 * and works across server instances.
 */
async function cleanStaleSyncRuns(mailboxConnectionId: string): Promise<void> {
  const cutoff = new Date(Date.now() - MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES * 60 * 1000);
  await db.mailboxSyncRun.updateMany({
    where: {
      mailboxConnectionId,
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
}

async function findRunningSyncForMailbox(
  mailboxConnectionId: string,
): Promise<{ running: false } | { running: true; runId: string }> {
  const cutoff = new Date(Date.now() - MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES * 60 * 1000);

  // Mark any stale RUNNING runs as FAILED so they do not pollute the
  // presentation layer or block future syncs indefinitely.
  await cleanStaleSyncRuns(mailboxConnectionId);

  const existing = await db.mailboxSyncRun.findFirst({
    where: {
      mailboxConnectionId,
      status: "RUNNING",
      startedAt: { gte: cutoff },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    return { running: true, runId: existing.id };
  }
  return { running: false };
}

async function acquireSyncLease(
  orgId: string,
  connectionId: string,
): Promise<string | null> {
  const leaseToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + MAILBOX_SYNC_LEASE_DURATION_MS);

  const result = await db.mailboxConnection.updateMany({
    where: {
      id: connectionId,
      orgId,
      OR: [
        { syncLeaseExpiresAt: null },
        { syncLeaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      syncLeaseToken: leaseToken,
      syncLeaseExpiresAt: leaseExpiresAt,
    },
  });

  return result.count === 1 ? leaseToken : null;
}

async function releaseSyncLease(
  orgId: string,
  connectionId: string,
  leaseToken: string,
): Promise<void> {
  await db.mailboxConnection.updateMany({
    where: {
      id: connectionId,
      orgId,
      syncLeaseToken: leaseToken,
    },
    data: {
      syncLeaseToken: null,
      syncLeaseExpiresAt: null,
    },
  });
}

/**
 * Run a mailbox sync with concurrency protection, explicit sync mode
 * selection, and cursor advancement only after successful ingestion.
 *
 * Scheduling hook: this function accepts triggerSource so callers from
 * scheduled jobs or webhook handlers can pass SCHEDULED / RENEWAL / WEBHOOK.
 */
export async function runMailboxSync(params: RunMailboxSyncParams): Promise<RunMailboxSyncResult> {
  const triggerSource = params.triggerSource ?? "MANUAL";
  const connection = await getMailboxConnection(params.orgId, params.connectionId);
  if (!connection) {
    throw new Error("Mailbox connection not found");
  }
  if (!mailboxCanSync(connection.status) || !connection.tokenRef) {
    throw new Error("Mailbox connection is not available for sync");
  }

  // Always clean up stale RUNNING runs before attempting a new sync so the
  // database and presentation layer stay truthful even if prior requests crashed.
  await cleanStaleSyncRuns(connection.id);

  const leaseToken = await acquireSyncLease(params.orgId, connection.id);
  if (!leaseToken) {
    const concurrencyCheck = await findRunningSyncForMailbox(connection.id);
    return {
      success: false,
      runId: concurrencyCheck.running ? concurrencyCheck.runId : `lease-denied:${connection.id}`,
      threadCount: 0,
      messageCount: 0,
      syncMode: params.syncMode ?? "INITIAL",
      triggerSource,
      error: { category: "concurrent_sync_running", summary: "A sync is already running for this mailbox" },
    };
  }

  // ─── Resolve sync mode ────────────────────────────────────────────────────
  const cursor = await getMailboxCursor(params.orgId, connection.id, "HISTORY_ID");
  const hasValidCursor = cursorIsValidForDelta(cursor);
  const requestedMode = params.syncMode ?? (hasValidCursor ? "DELTA" : "INITIAL");

  const startedAt = new Date();
  let effectiveMode: MailboxSyncMode = requestedMode;
  let effectiveCursor = cursor;
  let effectiveWatchMetadata = toMetadataRecord(connection.watchMetadata);
  let run:
    | {
        id: string;
      }
    | null = null;

  try {
    run = await db.mailboxSyncRun.create({
      data: {
        orgId: params.orgId,
        mailboxConnectionId: connection.id,
        provider: connection.provider,
        status: "RUNNING",
        triggerSource,
        syncMode: effectiveMode,
        startedAt,
        createdBy: params.actorId,
      },
      select: { id: true },
    });

    await logMailboxAudit({
      orgId: params.orgId,
      actorId: params.actorId,
      action:
        triggerSource === "SCHEDULED"
          ? "SYNC_SCHEDULED_TRIGGERED"
          : triggerSource === "RENEWAL"
            ? "SYNC_RENEWAL_TRIGGERED"
            : "SYNC_MANUAL_TRIGGERED",
      summary: `${effectiveMode} mailbox sync triggered (${triggerSource})`,
      mailboxConnectionId: connection.id,
      metadata: { runId: run.id, provider: connection.provider, syncMode: effectiveMode, triggerSource },
    });

    const adapter = getMailboxProviderAdapter(connection.provider);

    // ─── Watch renewal check ────────────────────────────────────────────────
    if (requestedMode === "DELTA" && watchIsExpired(connection)) {
      const renewal = await adapter.renewWatch({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
      });
      if (isMailboxProviderError(renewal)) {
        if (renewal.category === "auth_expired" || renewal.category === "auth_insufficient") {
          throw toProviderErrorException(renewal);
        }

        await logMailboxAudit({
          orgId: params.orgId,
          actorId: params.actorId,
          action: "WATCH_EXPIRED_DETECTED",
          summary: `Watch expired and renewal failed: ${renewal.safeMessage}`,
          mailboxConnectionId: connection.id,
          metadata: { errorCategory: renewal.category, runId: run.id },
        });
        await deleteMailboxCursors(params.orgId, connection.id);
        effectiveMode = "INITIAL";
        effectiveCursor = null;
        await db.mailboxSyncRun.update({
          where: { id: run.id },
          data: { syncMode: effectiveMode },
        });
      } else {
        await db.mailboxConnection.update({
          where: { id: connection.id },
          data: {
            watchExpiresAt: renewal.expiresAt,
            watchRenewedAt: new Date(),
            watchMetadata: mergeWatchMetadata(effectiveWatchMetadata, renewal.metadata) as Prisma.InputJsonValue,
            lastSyncError: null,
          },
        });
        effectiveWatchMetadata = mergeWatchMetadata(effectiveWatchMetadata, renewal.metadata);
        await logMailboxAudit({
          orgId: params.orgId,
          actorId: params.actorId,
          action: "WATCH_RENEWED",
          summary: "Mailbox watch renewed successfully",
          mailboxConnectionId: connection.id,
          metadata: { expiresAt: renewal.expiresAt?.toISOString(), runId: run.id },
        });
      }
    }

    const needsGmailCoverageRecovery =
      connection.provider === "GMAIL" &&
      effectiveMode === "DELTA" &&
      !!effectiveCursor &&
      !hasRequiredGmailCoverage(effectiveWatchMetadata);

    let threadCount = 0;
    let messageCount = 0;
    let recoveredGmailCoverage = false;
    if (needsGmailCoverageRecovery) {
      const recovery = await adapter.syncDelta({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
        cursor: null,
      });
      if (isMailboxProviderError(recovery)) {
        throw toProviderErrorException(recovery);
      }

      const recoveryStats = await ingestSyncedThreads({
        orgId: params.orgId,
        connectionId: connection.id,
        mailboxEmail: connection.emailAddress,
        tokenRef: connection.tokenRef,
        adapter,
        threads: recovery.threads,
      });
      threadCount += recoveryStats.threadCount;
      messageCount += recoveryStats.messageCount;
      recoveredGmailCoverage = true;
    }

    const delta = await adapter.syncDelta({
      orgId: params.orgId,
      tokenRef: connection.tokenRef,
      cursor: effectiveCursor ? { value: effectiveCursor.cursorValue, expiresAt: effectiveCursor.expiresAt } : null,
    });
    if (isMailboxProviderError(delta)) {
      throw toProviderErrorException(delta);
    }

    const deltaStats = await ingestSyncedThreads({
      orgId: params.orgId,
      connectionId: connection.id,
      mailboxEmail: connection.emailAddress,
      tokenRef: connection.tokenRef,
      adapter,
      threads: delta.threads,
    });
    threadCount += deltaStats.threadCount;
    messageCount += deltaStats.messageCount;

    // ─── Soft-delete threads that were remotely deleted ───────────────────
    if (delta.deletedThreadIds && delta.deletedThreadIds.length > 0) {
      await db.mailboxThread.updateMany({
        where: {
          orgId: params.orgId,
          mailboxConnectionId: connection.id,
          providerThreadId: { in: delta.deletedThreadIds },
          status: { not: "DELETED" },
        },
        data: { status: "DELETED", updatedAt: new Date() },
      });
    }

    let syncedDrafts = false;
    if (connection.provider === "GMAIL") {
      const draftSync = await adapter.syncDrafts({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
      });
      if (isMailboxProviderError(draftSync)) {
        throw toProviderErrorException(draftSync);
      }

      if (draftSync.drafts.length > 0) {
        const draftStats = await ingestSyncedDrafts({
          orgId: params.orgId,
          connectionId: connection.id,
          mailboxEmail: connection.emailAddress,
          drafts: draftSync.drafts,
        });
        threadCount += draftStats.threadCount;
        messageCount += draftStats.messageCount;
      }

      await reconcileProviderDraftMarkers({
        orgId: params.orgId,
        connectionId: connection.id,
        activeDraftIds: draftSync.activeDraftIds,
        failedDraftIds: draftSync.failedDraftIds,
      });
      syncedDrafts = true;
    }

    // ─── Cursor advancement only after successful ingestion ─────────────────
    if (delta.nextCursor) {
      await upsertMailboxCursor({
        orgId: params.orgId,
        mailboxConnectionId: connection.id,
        provider: connection.provider,
        cursorType: "HISTORY_ID",
        cursorValue: delta.nextCursor.value,
        expiresAt: delta.nextCursor.expiresAt,
      });
    }

    const shouldPersistGmailCoverage =
      connection.provider === "GMAIL" &&
      syncedDrafts &&
      (effectiveMode === "INITIAL" ||
        recoveredGmailCoverage ||
        !hasRequiredGmailCoverage(effectiveWatchMetadata));
    if (shouldPersistGmailCoverage) {
      effectiveWatchMetadata = withRequiredGmailCoverage(effectiveWatchMetadata);
    }

    let watchUpdateData:
      | {
          watchExpiresAt: Date | null;
          watchRenewedAt: Date;
        }
      | undefined;
    const shouldBootstrapWatch =
      connection.provider === "GMAIL" &&
      (!connection.watchExpiresAt || effectiveMode === "INITIAL");
    if (shouldBootstrapWatch) {
      const renewal = await adapter.renewWatch({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
      });
      if (isMailboxProviderError(renewal)) {
        await logMailboxAudit({
          orgId: params.orgId,
          actorId: params.actorId,
          action: "WATCH_EXPIRED_DETECTED",
          summary: `Watch bootstrap failed after sync: ${renewal.safeMessage}`,
          mailboxConnectionId: connection.id,
          metadata: { errorCategory: renewal.category, runId: run.id },
        });
      } else {
        effectiveWatchMetadata = mergeWatchMetadata(effectiveWatchMetadata, renewal.metadata);
        watchUpdateData = {
          watchExpiresAt: renewal.expiresAt,
          watchRenewedAt: new Date(),
        };
        await logMailboxAudit({
          orgId: params.orgId,
          actorId: params.actorId,
          action: "WATCH_RENEWED",
          summary: "Mailbox watch established successfully",
          mailboxConnectionId: connection.id,
          metadata: { expiresAt: renewal.expiresAt?.toISOString(), runId: run.id },
        });
      }
    }

    const stats = { threadCount, messageCount };
    const nextStatus = resolveStatusAfterSuccess(connection.status);

    // ── Update per-folder coverage after successful sync ─────────────────
    if (connection.provider === "GMAIL") {
      if (effectiveMode === "INITIAL") {
        // Bootstrap completed successfully: mark all required folders as COMPLETE
        // since the sync service now uses GMAIL_BOOTSTRAP_SLICES which covers
        // INBOX, SENT, SPAM, DRAFT, ARCHIVE.
        for (const folder of ["INBOX", "SENT", "SPAM", "DRAFT", "ARCHIVE"] as const) {
          await markFolderCoverageComplete(
            params.orgId,
            connection.id,
            folder,
            0, // totalThreads per-folder is tracked by the full sync
            delta.nextCursor?.value ?? "",
          );
        }
      } else if (recoveredGmailCoverage) {
        // Recovery sync completed: folders were re-bootstrapped
        for (const folder of ["INBOX", "SENT", "SPAM", "DRAFT", "ARCHIVE"] as const) {
          await markFolderCoverageComplete(
            params.orgId,
            connection.id,
            folder,
            0,
            delta.nextCursor?.value ?? "",
          );
        }
      }
    }

    await db.mailboxConnection.update({
      where: { id: connection.id },
      data: {
        status: nextStatus,
        lastSyncAt: new Date(),
        lastSyncError: null,
        lastSyncErrorCategory: null,
        ...(watchUpdateData ?? {}),
        ...(shouldPersistGmailCoverage
          ? { watchMetadata: effectiveWatchMetadata as Prisma.InputJsonValue }
          : watchUpdateData
            ? { watchMetadata: effectiveWatchMetadata as Prisma.InputJsonValue }
            : {}),
      },
    });
    await db.mailboxSyncRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        stats: stats as Prisma.InputJsonValue,
      },
    });
    await logMailboxAudit({
      orgId: params.orgId,
      actorId: params.actorId,
      action: effectiveMode === "DELTA" ? "SYNC_DELTA_COMPLETED" : "SYNC_COMPLETED",
      summary: `${effectiveMode} mailbox sync completed`,
      mailboxConnectionId: connection.id,
      metadata: { runId: run.id, ...stats, syncMode: effectiveMode, triggerSource },
    });

    return {
      success: true,
      runId: run.id,
      threadCount,
      messageCount,
      syncMode: effectiveMode,
      triggerSource,
    };
  } catch (error) {
    if (!run) {
      throw error;
    }
    const providerError = normalizeSyncError(error);
    const failureClass = classifyProviderError(providerError.category);
    const nextStatus = resolveStatusAfterFailure(connection.status, failureClass);

    // For cursor-invalid failures, clear the cursor so the next sync is INITIAL.
    if (isReplayRequired(failureClass)) {
      await deleteMailboxCursors(params.orgId, connection.id);
      effectiveMode = "INITIAL";
    }

    await db.mailboxSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCategory: providerError.category,
        errorSummary: providerError.safeMessage,
        stats: { threadCount: 0, messageCount: 0 } as Prisma.InputJsonValue,
      },
    });
    await db.mailboxConnection.update({
      where: { id: connection.id },
      data: {
        status: nextStatus,
        lastSyncError: providerError.safeMessage,
        lastSyncErrorCategory: providerError.category,
      },
    });
    await logMailboxAudit({
      orgId: params.orgId,
      actorId: params.actorId,
      action: "SYNC_FAILED",
      summary: "Mailbox sync failed",
      mailboxConnectionId: connection.id,
      metadata: { runId: run.id, errorCategory: providerError.category, failureClass, syncMode: effectiveMode, triggerSource },
    });

    return {
      success: false,
      runId: run.id,
      threadCount: 0,
      messageCount: 0,
      syncMode: effectiveMode,
      triggerSource,
      error: {
        category: providerError.category,
        summary: providerError.safeMessage,
      },
    };
  } finally {
    await releaseSyncLease(params.orgId, connection.id, leaseToken);
  }
}

function toProviderErrorException(error: MailboxProviderError): Error {
  return Object.assign(new Error(error.safeMessage), { mailboxProviderError: error });
}

function normalizeSyncError(error: unknown): MailboxProviderError {
  if (
    error instanceof Error &&
    "mailboxProviderError" in error &&
    isMailboxProviderError(error.mailboxProviderError)
  ) {
    return error.mailboxProviderError;
  }
  return {
    category: "unknown",
    safeMessage: error instanceof Error ? error.message : "Mailbox sync failed",
    retryable: false,
  };
}
