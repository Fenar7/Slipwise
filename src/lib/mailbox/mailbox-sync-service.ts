import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logMailboxAudit } from "./audit";
import { getMailboxConnection } from "./connection-service";
import { getMailboxCursor, upsertMailboxCursor } from "./cursor-service";
import { mailboxCanSync } from "./domain-types";
import { upsertMailboxAttachment, upsertMailboxMessage, upsertMailboxThread } from "./ingestion-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import { isMailboxProviderError } from "./provider-contracts";
import type { MailboxProviderError } from "./provider-contracts";

export interface RunMailboxSyncParams {
  orgId: string;
  connectionId: string;
  actorId: string;
}

export interface RunMailboxSyncResult {
  success: boolean;
  runId: string;
  threadCount: number;
  messageCount: number;
  error?: {
    category: string;
    summary: string;
  };
}

export async function runMailboxSync(params: RunMailboxSyncParams): Promise<RunMailboxSyncResult> {
  const connection = await getMailboxConnection(params.orgId, params.connectionId);
  if (!connection) {
    throw new Error("Mailbox connection not found");
  }
  if (!mailboxCanSync(connection.status) || !connection.tokenRef) {
    throw new Error("Mailbox connection is not available for sync");
  }

  const startedAt = new Date();
  const run = await db.mailboxSyncRun.create({
    data: {
      orgId: params.orgId,
      mailboxConnectionId: connection.id,
      provider: connection.provider,
      status: "RUNNING",
      startedAt,
      createdBy: params.actorId,
    },
  });

  await logMailboxAudit({
    orgId: params.orgId,
    actorId: params.actorId,
    action: "SYNC_MANUAL_TRIGGERED",
    summary: "Manual mailbox sync triggered",
    mailboxConnectionId: connection.id,
    metadata: { runId: run.id, provider: connection.provider },
  });

  try {
    const cursor = await getMailboxCursor(params.orgId, connection.id, "HISTORY_ID");
    const adapter = getMailboxProviderAdapter(connection.provider);
    const delta = await adapter.syncDelta({
      orgId: params.orgId,
      tokenRef: connection.tokenRef,
      cursor: cursor ? { value: cursor.cursorValue, expiresAt: cursor.expiresAt } : null,
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
            envelope: attachment,
          });
        }
      }
    }

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
      action: "SYNC_COMPLETED",
      summary: "Mailbox sync completed",
      mailboxConnectionId: connection.id,
      metadata: { runId: run.id, ...stats },
    });

    return {
      success: true,
      runId: run.id,
      threadCount: delta.threads.length,
      messageCount,
    };
  } catch (error) {
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
      metadata: { runId: run.id, errorCategory: providerError.category },
    });

    return {
      success: false,
      runId: run.id,
      threadCount: 0,
      messageCount: 0,
      error: {
        category: providerError.category,
        summary: providerError.safeMessage,
      },
    };
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
