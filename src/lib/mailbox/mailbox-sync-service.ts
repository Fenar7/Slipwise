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
  getIncompleteRequiredFolders,
  getFolderCoverage,
  resetFolderCoverageCursor,
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

/**
 * Minimum interval between heartbeat/progress DB writes during a running sync.
 * Keeps writes bounded — we update at most once per this interval, not on every message.
 */
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

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
      cachedThreadData: threadEnvelope.cachedThreadData,
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

    // Derive isFlagged from Gmail STARRED label: thread is flagged if any
    // message carries the STARRED label in its provider metadata.
    const isStarred = threadMessages.some((msg) => {
      if (!msg.providerMetadata) return false;
      const labelIds = (msg.providerMetadata as Record<string, unknown>).labelIds;
      return Array.isArray(labelIds) && (labelIds as string[]).includes("STARRED");
    });

    await db.mailboxThread.updateMany({
      where: { id: thread.id, orgId: params.orgId },
      data: {
        participantsSummary: participantsSummary as unknown as Prisma.InputJsonValue,
        lastMessageAt,
        previewSnippet,
        attachmentCount,
        isFlagged: isStarred,
      },
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
 * Persist incremental progress stats and heartbeat timestamp for a running sync run.
 * Called periodically during long-running syncs so the UI can distinguish
 * active progress from stalled/looping sync.
 *
 * Writes are bounded by HEARTBEAT_INTERVAL_MS — callers may invoke this
 * freely and it will only write to the DB when the interval has elapsed.
 *
 * Stats include: threadCount, messageCount, currentFolder, and syncPhase
 * to provide truthful in-run progress visibility.
 */
async function updateSyncRunHeartbeat(
  runId: string,
  stats: {
    threadCount: number;
    messageCount: number;
    currentFolder?: string;
    syncPhase?: string;
  },
  lastHeartbeatAt: Date,
): Promise<void> {
  await db.mailboxSyncRun.update({
    where: { id: runId },
    data: {
      stats: {
        threadCount: stats.threadCount,
        messageCount: stats.messageCount,
        ...(stats.currentFolder ? { currentFolder: stats.currentFolder } : {}),
        ...(stats.syncPhase ? { syncPhase: stats.syncPhase } : {}),
      } as Prisma.InputJsonValue,
      lastHeartbeatAt,
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

    // ─── Determine whether recovery is required based on REAL folder coverage ──
    const incompleteRequiredFolders =
      connection.provider === "GMAIL" && effectiveMode === "DELTA" && !!effectiveCursor
        ? await getIncompleteRequiredFolders(params.orgId, connection.id)
        : [];

    const needsGmailCoverageRecovery = incompleteRequiredFolders.length > 0;

    let threadCount = 0;
    let messageCount = 0;
    let lastHeartbeatAt = startedAt;
    let draftSyncError: MailboxProviderError | null = null;
    let recoveryBootstrapResults: import("./provider-contracts").MailboxBootstrapSliceResult[] | undefined;
    if (needsGmailCoverageRecovery) {
      // Build resumption cursors from prior incomplete folder coverage so we
      // do not restart from scratch every recovery sync.
      const folderCursors: Record<string, string> = {};
      for (const folder of incompleteRequiredFolders) {
        const coverage = await getFolderCoverage(params.orgId, connection.id, folder);
        if (coverage?.lastAdvancedCursor) {
          folderCursors[folder] = coverage.lastAdvancedCursor;
        }
      }

      const recovery = await adapter.syncDelta({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
        cursor: null,
        folderCursors,
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
      recoveryBootstrapResults = recovery.bootstrapSliceResults;

      // Persist incremental progress after recovery phase
      const now = Date.now();
      if (now - lastHeartbeatAt.getTime() >= HEARTBEAT_INTERVAL_MS) {
        await updateSyncRunHeartbeat(run.id, { threadCount, messageCount, syncPhase: "coverage_recovery" }, new Date(now));
        lastHeartbeatAt = new Date(now);
      }
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

    // Persist incremental progress after delta phase
    const nowAfterDelta = Date.now();
    if (nowAfterDelta - lastHeartbeatAt.getTime() >= HEARTBEAT_INTERVAL_MS) {
      await updateSyncRunHeartbeat(run.id, { threadCount, messageCount, syncPhase: "delta_sync" }, new Date(nowAfterDelta));
      lastHeartbeatAt = new Date(nowAfterDelta);
    }

    // ─── Reconcile remote message deletions ───────────────────────────────
    // Gmail messagesDeleted is message-level. Remove individual messages
    // first, then re-evaluate affected threads — only mark a thread as DELETED
    // if it has zero remaining live messages after re-fetch.
    if (delta.deletedMessageIds && delta.deletedMessageIds.length > 0) {
      await db.mailboxMessage.deleteMany({
        where: {
          orgId: params.orgId,
          thread: {
            mailboxConnectionId: connection.id,
          },
          providerMessageId: { in: delta.deletedMessageIds },
        },
      });
    }

    // Re-fetch threads affected by deletion events to reconcile thread state.
    // If the re-fetched thread has zero messages, it was fully deleted
    // remotely and we should soft-delete it locally.
    if (delta.deletionAffectedThreadIds && delta.deletionAffectedThreadIds.length > 0) {
      for (const providerThreadId of delta.deletionAffectedThreadIds) {
        const detail = await adapter.fetchThreadDetail({
          orgId: params.orgId,
          tokenRef: connection.tokenRef,
          providerThreadId,
        });
        if (isMailboxProviderError(detail)) {
          // Not found or other error: the thread is gone. Soft-delete it.
          if (detail.category === "not_found") {
            await db.mailboxThread.updateMany({
              where: {
                orgId: params.orgId,
                mailboxConnectionId: connection.id,
                providerThreadId,
                status: { not: "DELETED" },
              },
              data: { status: "DELETED", updatedAt: new Date() },
            });
          }
          continue;
        }
        // Thread still exists but may have fewer messages than before.
        // The individual message deletion above handles message removal.
        // If there are no messages left in the provider response, the
        // thread is effectively empty and should be soft-deleted.
        if (detail.messages.length === 0) {
          await db.mailboxThread.updateMany({
            where: {
              orgId: params.orgId,
              mailboxConnectionId: connection.id,
              providerThreadId,
              status: { not: "DELETED" },
            },
            data: { status: "DELETED", updatedAt: new Date() },
          });
        }
      }
    }

    // ─── Reconcile STARRED and TRASH from provider truth ──────────────────
    // Gmail watch + history delta can miss label-only transitions (star/unstar,
    // trash/restore without message changes). Run bounded reconciliation to
    // keep isFlagged and trashed status truthful.
    //
    // This is non-fatal: if reconciliation fails, mark the specific folders
    // as degraded but do NOT fail the entire mailbox sync. A failed
    // reconciliation is a folder-scoped issue, not a mailbox-wide issue.
    if (connection.provider === "GMAIL" && effectiveMode === "DELTA") {
      try {
        await reconcileStarredTrashStatus({
          orgId: params.orgId,
          connectionId: connection.id,
          adapter,
          tokenRef: connection.tokenRef,
        });
      } catch (reconciliationError) {
        // Log but do not propagate — folder reconciliation is best-effort.
        console.warn(
          `[mailbox-sync] STARRED/TRASH reconciliation failed (non-fatal):`,
          reconciliationError,
        );
      }
    }

    if (connection.provider === "GMAIL") {
      const draftSync = await adapter.syncDrafts({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
      });
      if (isMailboxProviderError(draftSync)) {
        draftSyncError = draftSync;
        await logMailboxAudit({
          orgId: params.orgId,
          actorId: params.actorId,
          action: "DRAFT_SYNC_FAILED",
          summary: `Draft sync degraded: ${draftSync.safeMessage}`,
          mailboxConnectionId: connection.id,
          metadata: { errorCategory: draftSync.category, runId: run.id },
        });
      } else {
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

        // Persist progress after draft sync phase
        const nowAfterDrafts = Date.now();
        if (nowAfterDrafts - lastHeartbeatAt.getTime() >= HEARTBEAT_INTERVAL_MS) {
          await updateSyncRunHeartbeat(run.id, { threadCount, messageCount, syncPhase: "draft_sync" }, new Date(nowAfterDrafts));
          lastHeartbeatAt = new Date(nowAfterDrafts);
        }
      }
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

    // ─── No fake "coverage recovered" metadata flags ──────────────────────────
    // Completion truth comes from per-folder mailboxFolderCoverage rows.
    // Do NOT persist gmailCoverageVersion / gmailCoveredSystemLabels merely
    // because a sync ran. Only actual folder pagination exhaustion counts.

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

    const stats: Record<string, unknown> = { threadCount, messageCount };
    if (draftSyncError) {
      stats.draftErrorCategory = draftSyncError.category;
      stats.draftErrorSummary = draftSyncError.safeMessage;
    }
    const nextStatus = resolveStatusAfterSuccess(connection.status);

    // ── Update per-folder coverage after successful sync ─────────────────
    if (connection.provider === "GMAIL") {
      // Use bootstrap results from the INITIAL delta or from the recovery sync.
      const bootstrapResults =
        effectiveMode === "INITIAL"
          ? delta.bootstrapSliceResults
          : recoveryBootstrapResults;

      if (bootstrapResults && bootstrapResults.length > 0) {
        for (const slice of bootstrapResults) {
          const folder = slice.sliceLabel as "INBOX" | "SENT" | "SPAM" | "DRAFT" | "TRASH" | "STARRED";
          if (slice.paginationExhausted) {
            await markFolderCoverageComplete(
              params.orgId,
              connection.id,
              folder,
              slice.threadCount,
              slice.lastAdvancedCursor,
            );
          } else {
            await updateFolderCoverageBootstrapping(
              params.orgId,
              connection.id,
              folder,
              slice.threadCount,
              slice.lastAdvancedCursor,
            );
          }
        }
      } else if (effectiveMode === "INITIAL" || recoveryBootstrapResults !== undefined) {
        // Fallback: no per-slice results — mark folders that were requested but
        // produced no individual results as BOOTSTRAPPING with null cursor.
        // Never stamp delta.nextCursor (a historyId) into lastAdvancedCursor —
        // that field is page-token-only and a historyId poisons recovery pagination.
        for (const folder of ["INBOX", "SENT", "SPAM", "DRAFT", "TRASH", "STARRED"] as const) {
          await updateFolderCoverageBootstrapping(
            params.orgId,
            connection.id,
            folder,
            threadCount,
            "",  // null cursor — folder has no page-token resume point
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
        ...(watchUpdateData
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
    // Also reset per-folder coverage cursors so stale/invalid recovery tokens
    // (e.g. a historyId stored as a page token in lastAdvancedCursor) do not
    // cause repeated recovery failures.
    if (isReplayRequired(failureClass)) {
      await deleteMailboxCursors(params.orgId, connection.id);
      effectiveMode = "INITIAL";
      const staleFolders = await getIncompleteRequiredFolders(params.orgId, connection.id);
      for (const folder of staleFolders) {
        await resetFolderCoverageCursor(params.orgId, connection.id, folder);
      }
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

/**
 * Reconcile STARRED and TRASH membership from Gmail provider truth.
 *
 * Gmail watch + history-based delta can miss label-only transitions
 * (e.g., star/unstar without message changes, or trash/restore). This
 * function runs bounded queries for `is:starred` and `in:trash` and
 * updates local thread state to match provider truth.
 *
 * Scope: bounded to threads already in our local DB for this connection.
 * Does not fetch new threads — only updates membership of existing ones.
 */
async function reconcileStarredTrashStatus(params: {
  orgId: string;
  connectionId: string;
  adapter: ReturnType<typeof getMailboxProviderAdapter>;
  tokenRef: string;
}): Promise<void> {
  const { orgId, connectionId, adapter, tokenRef } = params;

  // Only run if the adapter supports the lightweight query method.
  if (!adapter.queryThreadIdsByLabel) return;

  // Fetch provider-thread-IDs currently in our local DB for this connection.
  const localThreads = await db.mailboxThread.findMany({
    where: { orgId, mailboxConnectionId: connectionId, status: { not: "DELETED" } },
    select: { id: true, providerThreadId: true, isFlagged: true },
  });
  if (localThreads.length === 0) return;

  // ─── Reconcile STARRED ────────────────────────────────────────────────
  const starredResult = await adapter.queryThreadIdsByLabel({
    orgId,
    tokenRef,
    query: "is:starred",
  });

  if (!isMailboxProviderError(starredResult)) {
    const starredIds = new Set(starredResult.threadIds);
    for (const thread of localThreads) {
      const shouldBeFlagged = starredIds.has(thread.providerThreadId);
      if (thread.isFlagged !== shouldBeFlagged) {
        await db.mailboxThread.updateMany({
          where: { id: thread.id, orgId },
          data: { isFlagged: shouldBeFlagged, updatedAt: new Date() },
        });
      }
    }
  }

  // ─── Reconcile TRASH ──────────────────────────────────────────────────
  const trashResult = await adapter.queryThreadIdsByLabel({
    orgId,
    tokenRef,
    query: "in:trash",
  });

  if (!isMailboxProviderError(trashResult)) {
    const trashedIds = new Set(trashResult.threadIds);
    for (const thread of localThreads) {
      const isInTrash = trashedIds.has(thread.providerThreadId);
      if (isInTrash) {
        // Thread is in trash on provider — soft-delete locally.
        await db.mailboxThread.updateMany({
          where: { id: thread.id, orgId, status: { not: "DELETED" } },
          data: { status: "DELETED", updatedAt: new Date() },
        });
      }
    }
  }
}

function normalizeSyncError(error: unknown): MailboxProviderError {
  if (
    error instanceof Error &&
    "mailboxProviderError" in error &&
    isMailboxProviderError(error.mailboxProviderError)
  ) {
    return error.mailboxProviderError;
  }
  if (isMailboxProviderError(error)) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : "Mailbox sync failed";
  const safeMessage = /fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(rawMessage)
    ? "Gmail API unreachable (network error)"
    : rawMessage;
  return {
    category: "unknown",
    safeMessage,
    retryable: false,
  };
}
