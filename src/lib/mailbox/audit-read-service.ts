import "server-only";

import { db } from "@/lib/db";
import type { MailboxAuditAction } from "@/generated/prisma/enums";
import type { MailboxAuditEventRecord } from "./domain-types";

// ─── Sensitive key stripping ──────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERN = /token|secret|key|password|credential/i;

export function stripSensitiveMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;

  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SENSITIVE_KEY_PATTERN.test(key)) {
      stripped[key] = value;
    }
  }
  return Object.keys(stripped).length > 0 ? stripped : null;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

function toRecord(
  row: Awaited<ReturnType<typeof db.mailboxAuditEvent.findFirst>> &
    Record<string, unknown>,
): MailboxAuditEventRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId ?? null,
    threadId: row.threadId ?? null,
    messageId: row.messageId ?? null,
    actorId: row.actorId,
    action: row.action as MailboxAuditAction,
    summary: row.summary,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt,
  };
}

// ─── Paginated list ───────────────────────────────────────────────────────────

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
  const where: Record<string, unknown> = { orgId };

  if (params.connectionId) {
    where.mailboxConnectionId = params.connectionId;
  }

  if (params.action) {
    where.action = params.action;
  }

  if (params.from || params.to) {
    const createdAt: Record<string, Date> = {};
    if (params.from) createdAt.gte = params.from;
    if (params.to) createdAt.lte = params.to;
    where.createdAt = createdAt;
  }

  if (params.cursor) {
    where.id = { lt: params.cursor };
  }

  const rows = await db.mailboxAuditEvent.findMany({
    where: where as never,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.pageSize + 1,
  });

  const hasMore = rows.length > params.pageSize;
  const pageRows = hasMore ? rows.slice(0, params.pageSize) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  return {
    records: pageRows.map((row) => toRecord(row as never)),
    nextCursor,
  };
}

// ─── Single event by ID ──────────────────────────────────────────────────────

export async function getMailboxAuditEventById(
  orgId: string,
  eventId: string,
): Promise<MailboxAuditEventRecord | null> {
  const row = await db.mailboxAuditEvent.findFirst({
    where: { id: eventId, orgId },
  });

  if (!row) return null;

  return toRecord(row as never);
}
