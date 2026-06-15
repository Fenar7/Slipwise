import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MailboxAuditAction } from "@/generated/prisma/enums";
import type { MailboxAuditEventRecord } from "./domain-types";

// ─── Sensitive key stripping (Blocker 5 — recursive) ─────────────────────────

const SENSITIVE_KEY_PATTERN = /token|secret|key|password|credential/i;

export function stripSensitiveMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;

  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      stripped[key] = stripSensitiveMetadata(value as Record<string, unknown>);
    } else {
      stripped[key] = value;
    }
  }
  return Object.keys(stripped).length > 0 ? stripped : null;
}

// ─── Provider error sanitization (Blocker 3 — moved from route) ───────────────

const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_\-]{20,}/g;

export function sanitizeProviderError(errorMessage: string | null): string | null {
  if (!errorMessage) return null;
  return errorMessage.replace(TOKEN_LIKE_PATTERN, "[REDACTED]");
}

// ─── Paginated list (Blocker 1 — no as never) ─────────────────────────────────

export async function listMailboxAuditEventsPaginated(
  orgId: string,
  params: {
    cursor?: string;
    pageSize: number;
    connectionId?: string;
    action?: MailboxAuditAction;
    from?: Date;
    to?: Date;
  },
): Promise<{ records: MailboxAuditEventRecord[]; nextCursor: string | null }> {
  const where: Prisma.MailboxAuditEventWhereInput = { orgId };

  if (params.connectionId) {
    where.mailboxConnectionId = params.connectionId;
  }

  if (params.action) {
    where.action = params.action;
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = params.from;
    if (params.to) where.createdAt.lte = params.to;
  }

  if (params.cursor) {
    where.id = { lt: params.cursor };
  }

  const rows = await db.mailboxAuditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.pageSize + 1,
  });

  const hasMore = rows.length > params.pageSize;
  const pageRows = hasMore ? rows.slice(0, params.pageSize) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  const records: MailboxAuditEventRecord[] = pageRows.map((row) => ({
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    threadId: row.threadId,
    messageId: row.messageId,
    actorId: row.actorId,
    action: row.action,
    summary: row.summary,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.createdAt,
  }));

  return {
    records,
    nextCursor,
  };
}

// ─── Single event by ID (Blocker 1 — no as never) ────────────────────────────

export async function getMailboxAuditEventById(
  orgId: string,
  eventId: string,
): Promise<MailboxAuditEventRecord | null> {
  const row = await db.mailboxAuditEvent.findFirst({
    where: { id: eventId, orgId },
  });

  if (!row) return null;

  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    threadId: row.threadId,
    messageId: row.messageId,
    actorId: row.actorId,
    action: row.action,
    summary: row.summary,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.createdAt,
  };
}

// ─── Connection lookup for audit (Blocker 2) ──────────────────────────────────

export async function getMailboxConnectionForAudit(
  orgId: string,
  connectionId: string,
): Promise<{ id: string } | null> {
  const connection = await db.mailboxConnection.findFirst({
    where: { id: connectionId, orgId },
    select: { id: true },
  });

  return connection ?? null;
}

// ─── Support summary data (Blockers 2, 3) ────────────────────────────────────

export interface ConnectionSupportData {
  connectionId: string;
  displayName: string;
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  deletedAt: Date | null;
  syncRunCount: number;
  failedSyncRunCount: number;
  providerErrorSummary: string | null;
  recentAuditEvents: MailboxAuditEventRecord[];
}

export async function getConnectionSupportData(
  orgId: string,
  connectionId: string,
): Promise<ConnectionSupportData | null> {
  const connection = await db.mailboxConnection.findFirst({
    where: { id: connectionId, orgId },
    select: {
      id: true,
      displayName: true,
      provider: true,
      status: true,
      lastSyncAt: true,
      lastSyncError: true,
      deletedAt: true,
    },
  });

  if (!connection) return null;

  const [syncRunCounts, latestFailedRun, recentAuditRows] = await Promise.all([
    db.mailboxSyncRun.groupBy({
      by: ["status"],
      where: { orgId, mailboxConnectionId: connectionId },
      _count: { id: true },
    }),
    db.mailboxSyncRun.findFirst({
      where: {
        orgId,
        mailboxConnectionId: connectionId,
        status: "FAILED",
      },
      orderBy: { startedAt: "desc" },
      select: { errorSummary: true },
    }),
    listMailboxAuditEventsPaginated(orgId, {
      pageSize: 5,
      connectionId,
    }),
  ]);

  const syncRunCount = syncRunCounts.reduce(
    (sum, row) => sum + row._count.id,
    0,
  );
  const failedSyncRunCount =
    syncRunCounts.find((row) => row.status === "FAILED")?._count.id ?? 0;

  return {
    connectionId: connection.id,
    displayName: connection.displayName,
    provider: connection.provider,
    status: connection.status,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: sanitizeProviderError(connection.lastSyncError),
    deletedAt: connection.deletedAt,
    syncRunCount,
    failedSyncRunCount,
    providerErrorSummary: sanitizeProviderError(
      latestFailedRun?.errorSummary ?? null,
    ),
    recentAuditEvents: recentAuditRows.records,
  };
}
