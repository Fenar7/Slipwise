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
import { upsertMailboxAttachment, upsertMailboxMessage, upsertMailboxThread } from "./ingestion-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";
import type { MailboxProviderError } from "./provider-contracts";

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
 * Check whether a sync is already running for this mailbox.
 * Uses the database as the source of truth so the guard is mailbox-scoped
 * and works across server instances.
 */
async function findRunningSyncForMailbox(
  mailboxConnectionId: string,
): Promise<{ running: false } | { running: true; runId: string }> {
  const cutoff = new Date(Date.now() - MAILBOX_SYNC_MAX_RUNNING_AGE_MINUTES * 60 * 1000);
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
            watchMetadata: renewal.metadata as Prisma.InputJsonValue,
            lastSyncError: null,
          },
        });
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

    const delta = await adapter.syncDelta({
      orgId: params.orgId,
      tokenRef: connection.tokenRef,
      cursor: effectiveCursor ? { value: effectiveCursor.cursorValue, expiresAt: effectiveCursor.expiresAt } : null,
    });
    if (isMailboxProviderError(delta)) {
      throw toProviderErrorException(delta);
    }

    let messageCount = 0;
    for (const threadEnvelope of delta.threads) {
      const thread = await upsertMailboxThread({
        orgId: params.orgId,
        mailboxConnectionId: connection.id,
        envelope: threadEnvelope,
      });
      const detail = await adapter.fetchThreadDetail({
        orgId: params.orgId,
        tokenRef: connection.tokenRef,
        providerThreadId: threadEnvelope.providerThreadId,
      });
      if (isMailboxProviderError(detail)) {
        throw toProviderErrorException(detail);
      }
      for (const messageEnvelope of detail.messages) {
        const message = await upsertMailboxMessage({
          orgId: params.orgId,
          threadId: thread.id,
          envelope: messageEnvelope,
        });
        messageCount += 1;
        for (const attachment of messageEnvelope.attachments ?? []) {
          await upsertMailboxAttachment({
            messageId: message.id,
            providerAttachmentId: attachment.providerAttachmentId,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            isInline: attachment.isInline,
          });
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

    const stats = { threadCount: delta.threads.length, messageCount };
    await db.mailboxConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastSyncError: null },
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
      threadCount: delta.threads.length,
      messageCount,
      syncMode: effectiveMode,
      triggerSource,
    };
  } catch (error) {
    if (!run) {
      throw error;
    }
    const providerError = normalizeSyncError(error);
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
        status: providerError.category === "auth_expired" ? "RECONNECT_REQUIRED" : connection.status,
        lastSyncError: providerError.safeMessage,
      },
    });
    await logMailboxAudit({
      orgId: params.orgId,
      actorId: params.actorId,
      action: "SYNC_FAILED",
      summary: "Mailbox sync failed",
      mailboxConnectionId: connection.id,
      metadata: { runId: run.id, errorCategory: providerError.category, syncMode: effectiveMode, triggerSource },
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
